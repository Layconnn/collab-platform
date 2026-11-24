import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Decision reviews against a real database: who may ask and answer, tenant
// isolation, idempotency, version checks, concurrency and members leaving.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { decisionReviewRouter } = jiti("./routers/decision-review.router.ts");
const { summarizeReviews } = jiti("../services/decision-review.service.ts");
const { workspaceService } = jiti("../services/workspace.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;
redis.del = async () => 1;
redis.get = async () => null;
redis.set = async () => "OK";

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];

function caller(user) {
  return decisionReviewRouter.createCaller({
    user: { id: user.id }, requestId: `review-test-${suffix()}`, headers: new Headers(),
    requestMethod: "POST", ip: null, responseHeaders: new Headers(),
  });
}

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `review_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

async function workspace(owner, members) {
  const ws = await prisma.workspace.create({ data: { name: `WS ${suffix().slice(0, 6)}`, slug: `review-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map(([member, role]) => ({ workspaceId: ws.id, userId: member.id, role })),
  ] });
  return ws;
}

const proposal = (ws, author, question = "Offer a free plan for teams under five", extra = {}) => prisma.decision.create({ data: {
  workspaceId: ws.id, createdById: author.id, createdByLabel: author.name, question, sourceDiscussionTitle: "Source",
  outcome: "Yes", rationale: "Growth", idempotencyKey: suffix(), ...extra,
} });

const ids = (ws, decision) => ({ workspaceId: ws.id, decisionId: decision.id });
const REVIEW_KINDS = ["DECISION_REVIEW_REQUESTED", "DECISION_REVIEW_RESPONDED", "DECISION_REVIEW_WITHDRAWN", "DECISION_REVIEWS_RESET", "DECISION_REVIEW_RULE_CHANGED"];
const events = (decision) => prisma.activityEvent.findMany({ where: { subjectId: decision.id, kind: { in: REVIEW_KINDS } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
const reviewEventCount = (decision) => prisma.activityEvent.count({ where: { subjectId: decision.id, kind: { in: REVIEW_KINDS } } });

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("the author asks two members; both wait and the request is recorded once each", async () => {
  const [owner, sam, maya, lee] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"], [lee, "MEMBER"]]);
  const decision = await proposal(ws, sam);

  const result = await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id, lee.id] });
  assert.deepEqual(result.reviews.map((r) => [r.reviewerLabel, r.state]), [["Maya", "PENDING"], ["Lee", "PENDING"]]);
  assert.deepEqual(
    { needed: result.summary.needed, approved: result.summary.approved, pending: result.summary.pending, met: result.summary.met },
    { needed: 2, approved: 0, pending: 2, met: false },
  );
  assert.equal(result.viewer.canManage, true);

  // Asking again, as a retry or double click would, changes nothing.
  await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id, lee.id] });
  assert.equal(await prisma.decisionReview.count({ where: { decisionId: decision.id } }), 2);
  assert.equal((await events(decision)).filter((e) => e.kind === "DECISION_REVIEW_REQUESTED").length, 2);
});

test("only the author or a manager may ask, never for the author, and only members of the workspace", async () => {
  const [owner, sam, maya, lee, admin, outsider] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee"), user("Ada"), user("Out")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"], [lee, "MEMBER"], [admin, "ADMIN"]]);
  const elsewhere = await workspace(outsider, []);
  const decision = await proposal(ws, sam);

  await rejects(caller(maya).request({ ...ids(ws, decision), reviewerIds: [lee.id] }), "FORBIDDEN");
  await rejects(caller(sam).request({ ...ids(ws, decision), reviewerIds: [sam.id] }), "BAD_REQUEST");
  await rejects(caller(sam).request({ ...ids(ws, decision), reviewerIds: [outsider.id] }), "BAD_REQUEST");
  await rejects(caller(outsider).request({ ...ids(ws, decision), reviewerIds: [lee.id] }), "NOT_FOUND");
  // The decision id under another workspace is not found, not reviewable.
  await rejects(caller(outsider).request({ workspaceId: elsewhere.id, decisionId: decision.id, reviewerIds: [outsider.id] }), "NOT_FOUND");

  const byAdmin = await caller(admin).request({ ...ids(ws, decision), reviewerIds: [lee.id] });
  assert.equal(byAdmin.reviews.length, 1);
  await rejects(caller(outsider).list(ids(ws, decision)), "NOT_FOUND");
  const asMember = await caller(maya).list(ids(ws, decision));
  assert.equal(asMember.viewer.canManage, false);
  assert.equal(asMember.viewer.canRespond, false);
});

test("a proposal has at most ten reviewers", async () => {
  const [owner, sam] = await Promise.all([user("Olu"), user("Sam")]);
  const many = await Promise.all(Array.from({ length: 11 }, (_, i) => user(`R${i}`)));
  const ws = await workspace(owner, [[sam, "MEMBER"], ...many.map((m) => [m, "MEMBER"])]);
  const decision = await proposal(ws, sam);
  await caller(sam).request({ ...ids(ws, decision), reviewerIds: many.slice(0, 10).map((m) => m.id) });
  await rejects(caller(sam).request({ ...ids(ws, decision), reviewerIds: [many[10].id] }), "BAD_REQUEST");
});

test("reviewers approve or object with a reason, can change their answer, and repeats record nothing", async () => {
  const [owner, sam, maya, lee] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"], [lee, "MEMBER"]]);
  const decision = await proposal(ws, sam);
  await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id, lee.id] });

  await assert.rejects(caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "OBJECTED" }));
  await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  const after = await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "OBJECTED", note: "Five is too low." });
  assert.deepEqual(after.reviews.map((r) => [r.reviewerLabel, r.state, r.note]), [["Maya", "APPROVED", null], ["Lee", "OBJECTED", "Five is too low."]]);
  assert.deepEqual([after.summary.approved, after.summary.objected, after.summary.met], [1, 1, false]);
  assert.deepEqual(after.viewer.review, { state: "OBJECTED", note: "Five is too low." });

  const before = await reviewEventCount(decision);
  await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "OBJECTED", note: "Five is too low." });
  assert.equal(await reviewEventCount(decision), before, "a repeated answer records nothing");

  const changed = await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  assert.equal(changed.summary.met, true);
  const responses = (await events(decision)).filter((e) => e.kind === "DECISION_REVIEW_RESPONDED").map((e) => [e.summary.response, e.summary.previous]);
  assert.deepEqual(responses, [["APPROVED", "PENDING"], ["OBJECTED", "PENDING"], ["APPROVED", "OBJECTED"]]);
  assert.equal(changed.history.length, 5, "two requests and three responses, newest first");
  assert.equal(changed.history[0].kind, "DECISION_REVIEW_RESPONDED");
});

test("only the person asked can answer, and only on the version they saw", async () => {
  const [owner, sam, maya, lee] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"], [lee, "MEMBER"]]);
  const decision = await proposal(ws, sam);
  await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id] });

  await rejects(caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" }), "NOT_FOUND");
  await rejects(caller(owner).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" }), "NOT_FOUND");
  await prisma.decision.update({ where: { id: decision.id }, data: { version: 2 } });
  await rejects(caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" }), "CONFLICT");
  const ok = await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 2, response: "APPROVED" });
  assert.equal(ok.reviews[0].respondedVersion, 2);
  assert.equal(ok.reviews[0].stale, false);
});

test("an 'at least N' rule is checked against the reviewers asked and follows withdrawals", async () => {
  const [owner, sam, maya, lee, kim] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee"), user("Kim")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"], [lee, "MEMBER"], [kim, "MEMBER"]]);
  const decision = await proposal(ws, sam);
  await rejects(caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id], rule: { rule: "AT_LEAST", requiredApprovals: 2 } }), "BAD_REQUEST");
  assert.equal(await prisma.decisionReview.count({ where: { decisionId: decision.id } }), 0, "a rejected request changes nothing");

  let result = await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id, lee.id, kim.id], rule: { rule: "AT_LEAST", requiredApprovals: 2 } });
  assert.deepEqual([result.summary.rule, result.summary.needed, result.requiredApprovals], ["AT_LEAST", 2, 2]);
  await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "OBJECTED", note: "Not yet." });
  result = await caller(kim).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  assert.equal(result.summary.met, true, "two approvals meet 'at least 2' despite an objection");

  await caller(sam).withdraw({ ...ids(ws, decision), reviewerId: kim.id });
  result = await caller(sam).withdraw({ ...ids(ws, decision), reviewerId: lee.id });
  assert.equal(result.requiredApprovals, 1, "the stored rule shrinks to the one reviewer left");
  assert.deepEqual([result.summary.active, result.summary.met], [1, true]);
  await rejects(caller(kim).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" }), "NOT_FOUND");

  // Asking a withdrawn reviewer again starts them afresh.
  result = await caller(sam).request({ ...ids(ws, decision), reviewerIds: [kim.id] });
  assert.equal(result.reviews.find((r) => r.reviewerLabel === "Kim").state, "PENDING");
  const kinds = (await events(decision)).map((e) => e.kind);
  assert.equal(kinds.filter((k) => k === "DECISION_REVIEW_WITHDRAWN").length, 2);
  assert.equal(kinds.filter((k) => k === "DECISION_REVIEW_RULE_CHANGED").length, 1);
});

test("reviews cannot change once the proposal is decided", async () => {
  const [owner, sam, maya] = await Promise.all([user("Olu"), user("Sam"), user("Maya")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"]]);
  const decision = await proposal(ws, sam);
  await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id] });
  await prisma.decision.update({ where: { id: decision.id }, data: { status: "DECIDED", version: 2 } });
  await rejects(caller(maya).respond({ ...ids(ws, decision), expectedVersion: 2, response: "APPROVED" }), "CONFLICT");
  await rejects(caller(sam).request({ ...ids(ws, decision), reviewerIds: [owner.id] }), "CONFLICT");
  await rejects(caller(sam).setRule({ ...ids(ws, decision), rule: "ALL" }), "CONFLICT");
  const view = await caller(maya).list(ids(ws, decision));
  assert.deepEqual([view.viewer.canRespond, view.viewer.canManage], [false, false]);
});

test("removing a member withdraws their open requests and records it", async () => {
  const [owner, sam, maya, lee] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"], [lee, "MEMBER"]]);
  const open = await proposal(ws, sam);
  const decided = await proposal(ws, sam, "Decided already");
  await caller(sam).request({ ...ids(ws, open), reviewerIds: [maya.id, lee.id], rule: { rule: "AT_LEAST", requiredApprovals: 2 } });
  await caller(sam).request({ ...ids(ws, decided), reviewerIds: [maya.id] });
  await caller(maya).respond({ ...ids(ws, decided), expectedVersion: 1, response: "APPROVED" });
  await prisma.decision.update({ where: { id: decided.id }, data: { status: "DECIDED", version: 2 } });

  await workspaceService.removeMember(owner.id, { workspaceId: ws.id, userId: maya.id }, { requestId: suffix() });

  const view = await caller(sam).list(ids(ws, open));
  assert.equal(view.reviews.find((r) => r.reviewerLabel === "Maya").state, "WITHDRAWN");
  assert.deepEqual([view.summary.active, view.requiredApprovals], [1, 1]);
  const withdrawn = (await events(open)).find((e) => e.kind === "DECISION_REVIEW_WITHDRAWN");
  assert.equal(withdrawn.summary.reason, "left the workspace");
  assert.equal(withdrawn.actorUserId, owner.id);
  const kept = await prisma.decisionReview.findFirst({ where: { decisionId: decided.id } });
  assert.equal(kept.state, "APPROVED", "answers on decided proposals stay as they were");
});

test("two reviewers answering at once both count", async () => {
  const [owner, sam, maya, lee] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"], [lee, "MEMBER"]]);
  const decision = await proposal(ws, sam);
  await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id, lee.id] });
  await Promise.all([
    caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" }),
    caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" }),
  ]);
  const view = await caller(sam).list(ids(ws, decision));
  assert.deepEqual([view.summary.approved, view.summary.met], [2, true]);
});

test("the database refuses an objection without a note", async () => {
  const [owner, sam, maya] = await Promise.all([user("Olu"), user("Sam"), user("Maya")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "MEMBER"]]);
  const decision = await proposal(ws, sam);
  await assert.rejects(prisma.decisionReview.create({ data: {
    workspaceId: ws.id, decisionId: decision.id, reviewerId: maya.id, reviewerLabel: "Maya", requestedByLabel: "Sam", state: "OBJECTED", note: "  ",
  } }));
});

test("summaries follow the rule", () => {
  const states = (...list) => list.map((state) => ({ state }));
  assert.equal(summarizeReviews({ reviewRule: "ALL", requiredApprovals: null }, []).met, true, "no reviewers, nothing to wait for");
  assert.equal(summarizeReviews({ reviewRule: "ALL", requiredApprovals: null }, states("APPROVED", "PENDING")).met, false);
  assert.equal(summarizeReviews({ reviewRule: "ALL", requiredApprovals: null }, states("APPROVED", "WITHDRAWN")).met, true);
  const atLeast = summarizeReviews({ reviewRule: "AT_LEAST", requiredApprovals: 3 }, states("APPROVED", "APPROVED"));
  assert.deepEqual([atLeast.needed, atLeast.met], [2, true], "N is capped at the reviewers asked");
});

// ---------------------------------------------------------------------------
// Edits send a proposal back for review; finalizing follows the rule (PR 3)
// ---------------------------------------------------------------------------

const { decisionRouter } = jiti("./routers/decision.router.ts");
function decisions(user) {
  return decisionRouter.createCaller({
    user: { id: user.id }, requestId: `review-test-${suffix()}`, headers: new Headers(),
    requestMethod: "POST", ip: null, responseHeaders: new Headers(),
  });
}

async function reviewed(question = "Offer a free plan for teams under five") {
  const [owner, sam, maya, lee] = await Promise.all([user("Olu"), user("Sam"), user("Maya"), user("Lee")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [maya, "ADMIN"], [lee, "MEMBER"]]);
  const decision = await proposal(ws, sam, question);
  await caller(sam).request({ ...ids(ws, decision), reviewerIds: [maya.id, lee.id] });
  return { owner, sam, maya, lee, ws, decision };
}

test("changing what a proposal says asks everyone again; changing the follow-up does not", async () => {
  const { sam, maya, lee, ws, decision } = await reviewed();
  await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "OBJECTED", note: "Five is too low." });

  await decisions(sam).edit({ ...ids(ws, decision), expectedVersion: 1, followUp: "Announce on Monday." });
  let view = await caller(sam).list(ids(ws, decision));
  assert.deepEqual(view.reviews.map((r) => r.state), ["APPROVED", "OBJECTED"], "follow-up edits keep answers");
  assert.deepEqual(view.reviews.map((r) => r.stale), [true, true], "but they now refer to an earlier version");

  await decisions(sam).edit({ ...ids(ws, decision), expectedVersion: 2, outcome: "Teams under ten." });
  view = await caller(sam).list(ids(ws, decision));
  assert.deepEqual(view.reviews.map((r) => [r.state, r.note]), [["PENDING", null], ["PENDING", null]]);
  assert.equal(view.summary.met, false);
  const reset = (await events(decision)).filter((e) => e.kind === "DECISION_REVIEWS_RESET");
  assert.equal(reset.length, 1);
  assert.deepEqual([reset[0].summary.reviewers, reset[0].summary.version], [2, 3]);
  // The earlier answers are still in the history.
  assert.ok(view.history.some((e) => e.kind === "DECISION_REVIEW_RESPONDED" && e.summary.note === "Five is too low."));
  await rejects(caller(lee).respond({ ...ids(ws, decision), expectedVersion: 2, response: "APPROVED" }), "CONFLICT");
  await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 3, response: "APPROVED" });
});

test("finalizing waits for the rule, unless a manager gives a reason", async () => {
  const { owner, sam, maya, lee, ws, decision } = await reviewed();
  await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });

  await assert.rejects(decisions(owner).finalize({ ...ids(ws, decision), expectedVersion: 1 }), (error) => {
    assert.equal(error.code, "CONFLICT");
    assert.match(error.message, /Waiting for Lee/);
    return true;
  });
  await rejects(decisions(sam).finalize({ ...ids(ws, decision), expectedVersion: 1, overrideReason: "Launch date is fixed." }), "FORBIDDEN");
  await assert.rejects(decisions(owner).finalize({ ...ids(ws, decision), expectedVersion: 1, overrideReason: "short" }));

  const finalized = await decisions(owner).finalize({ ...ids(ws, decision), expectedVersion: 1, overrideReason: "Launch date fixed by the board." });
  assert.equal(finalized.status, "DECIDED");
  const { items } = await decisions(owner).revisions(ids(ws, decision));
  assert.equal(items.at(-1).overrideReason, "Launch date fixed by the board.");
  const event = await prisma.activityEvent.findFirst({ where: { subjectId: decision.id, kind: "DECISION_FINALIZED" } });
  assert.deepEqual([event.summary.overrideReason, event.summary.waitingFor], ["Launch date fixed by the board.", "Lee"]);
  // Pending requests are closed with the proposal: nothing can be answered now.
  await rejects(caller(lee).respond({ ...ids(ws, decision), expectedVersion: 2, response: "APPROVED" }), "CONFLICT");
  assert.equal((await caller(lee).list(ids(ws, decision))).viewer.canRespond, false);
});

test("a met rule, or no reviewers, finalizes as before and ignores a reason", async () => {
  const { owner, maya, lee, ws, decision } = await reviewed();
  await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  await decisions(owner).finalize({ ...ids(ws, decision), expectedVersion: 1, overrideReason: "Not needed, all approved." });
  const { items } = await decisions(owner).revisions(ids(ws, decision));
  assert.equal(items.at(-1).overrideReason, null);

  const plain = await proposal(ws, owner, "No reviewers");
  const done = await decisions(owner).finalize({ ...ids(ws, plain), expectedVersion: 1 });
  assert.equal(done.status, "DECIDED");
});

test("an objection under 'at least N' does not block once enough have approved", async () => {
  const { owner, sam, maya, lee, ws, decision } = await reviewed();
  await caller(sam).setRule({ ...ids(ws, decision), rule: "AT_LEAST", requiredApprovals: 1 });
  await caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "OBJECTED", note: "Prefer ten." });
  await assert.rejects(decisions(owner).finalize({ ...ids(ws, decision), expectedVersion: 1 }), /needs 1 approval and has 0/);
  await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  const done = await decisions(owner).finalize({ ...ids(ws, decision), expectedVersion: 1 });
  assert.equal(done.status, "DECIDED");
});

test("an answer racing finalization is either counted or refused, never lost", async () => {
  const { owner, maya, lee, ws, decision } = await reviewed();
  await caller(maya).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" });
  const [answer, finalize] = await Promise.allSettled([
    caller(lee).respond({ ...ids(ws, decision), expectedVersion: 1, response: "APPROVED" }),
    decisions(owner).finalize({ ...ids(ws, decision), expectedVersion: 1 }),
  ]);
  const stored = await prisma.decision.findUniqueOrThrow({ where: { id: decision.id } });
  const lees = await prisma.decisionReview.findFirstOrThrow({ where: { decisionId: decision.id, reviewerId: lee.id } });
  if (finalize.status === "fulfilled") {
    // Finalizing could only succeed after Lee's approval was committed.
    assert.equal(answer.status, "fulfilled");
    assert.equal(lees.state, "APPROVED");
    assert.equal(stored.status, "DECIDED");
  } else {
    assert.equal(finalize.reason.code, "CONFLICT");
    assert.equal(stored.status, "PROPOSED");
    assert.equal(lees.state, answer.status === "fulfilled" ? "APPROVED" : "PENDING");
  }
});
