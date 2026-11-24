import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// The daily digest's content against a real database: what is included, the
// 24-hour window, the member's own actions, excluded and left workspaces,
// empty days and escaping in the email.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { buildDigest } = jiti("../services/digest/digest.service.ts");
const { renderDigest } = jiti("../services/digest/digest.email.ts");
const { prisma } = jiti("../db/prisma.ts");

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const HOUR = 60 * 60 * 1000;

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `dg_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}
async function workspace(owner, members, name) {
  const ws = await prisma.workspace.create({ data: { name, slug: `digest-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map(([member, role]) => ({ workspaceId: ws.id, userId: member.id, role })),
  ] });
  return ws;
}
const event = (ws, actor, kind, msAgo, summary = {}, subjectId = `c${suffix().slice(0, 24)}`) => prisma.activityEvent.create({ data: {
  workspaceId: ws.id, actorUserId: actor.id, actorLabel: actor.name, kind,
  subjectType: kind.startsWith("DECISION") ? "DECISION" : kind.startsWith("COMMENT") ? "COMMENT" : "DISCUSSION",
  subjectId, createdAt: new Date(Date.now() - msAgo), summary,
} });

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
});

test("the digest holds what needs the member, the last day's decisions and others' activity", async () => {
  const [maya, sam, lee] = await Promise.all([user("Maya"), user("Sam"), user("Lee")]);
  const platform = await workspace(sam, [[maya, "MEMBER"], [lee, "MEMBER"]], "Platform");
  const marketing = await workspace(sam, [[maya, "MEMBER"]], "Marketing");
  const quiet = await workspace(maya, [], "Quiet");

  // A review waiting on Maya.
  const proposal = await prisma.decision.create({ data: { workspaceId: platform.id, createdById: sam.id, createdByLabel: "Sam", question: "Offer a free plan", sourceDiscussionTitle: "Pricing", idempotencyKey: suffix() } });
  await prisma.decisionReview.create({ data: { workspaceId: platform.id, decisionId: proposal.id, reviewerId: maya.id, reviewerLabel: "Maya", requestedById: sam.id, requestedByLabel: "Sam" } });
  // A decision finalized 3 hours ago, and one 3 days ago (outside the window).
  const decided = await prisma.decision.create({ data: { workspaceId: marketing.id, createdById: sam.id, createdByLabel: "Sam", question: "Launch on Friday", sourceDiscussionTitle: "Launch", idempotencyKey: suffix(), status: "DECIDED" } });
  await event(marketing, sam, "DECISION_FINALIZED", 3 * HOUR, { question: "Launch on Friday" }, decided.id);
  const old = await prisma.decision.create({ data: { workspaceId: marketing.id, createdById: sam.id, createdByLabel: "Sam", question: "Old choice", sourceDiscussionTitle: "Old", idempotencyKey: suffix(), status: "DECIDED" } });
  await event(marketing, sam, "DECISION_FINALIZED", 72 * HOUR, { question: "Old choice" }, old.id);
  // Activity: others' replies count, Maya's own do not, old ones do not.
  await event(platform, lee, "COMMENT_CREATED", 2 * HOUR);
  await event(platform, lee, "COMMENT_CREATED", 5 * HOUR);
  await event(platform, sam, "DISCUSSION_CREATED", 1 * HOUR);
  await event(platform, maya, "COMMENT_CREATED", 1 * HOUR);
  await event(platform, lee, "COMMENT_CREATED", 30 * HOUR);

  const digest = await buildDigest(maya.id);
  assert.equal(digest.empty, false);
  assert.deepEqual(digest.needs.items.map((item) => [item.kind, item.title]), [["REVIEW_REQUESTED", "Offer a free plan"]]);
  assert.deepEqual(digest.decided.map((item) => item.question), ["Launch on Friday"]);
  assert.deepEqual(digest.activity.map((row) => [row.workspace.name, row.discussions, row.replies, row.decisions]), [["Platform", 1, 2, 0], ["Marketing", 0, 0, 1]]);
  assert.equal(digest.activity.some((row) => row.workspace.id === quiet.id), false, "quiet workspaces are left out");
  assert.equal(digest.subject, "Commons: 1 thing needs you, 1 decision");

  // Turning a workspace off removes everything from it.
  const withoutPlatform = await buildDigest(maya.id, { excludedWorkspaceIds: [platform.id] });
  assert.equal(withoutPlatform.needs.total, 0);
  assert.deepEqual(withoutPlatform.activity.map((row) => row.workspace.name), ["Marketing"]);
});

test("nothing from a workspace the member left, and an empty digest on a quiet day", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(sam, [[maya, "MEMBER"]], "Left behind");
  await event(ws, sam, "DISCUSSION_CREATED", HOUR);
  assert.equal((await buildDigest(maya.id)).empty, false);
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId: maya.id } });
  const digest = await buildDigest(maya.id);
  assert.equal(digest.empty, true);
  assert.deepEqual([digest.needs.total, digest.decided.length, digest.activity.length], [0, 0, 0]);
  assert.equal(await buildDigest("c000000000000000000000000"), null, "an unknown member has no digest");
});

test("the email escapes what members wrote and links every item", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("<b>Sam</b>")]);
  const ws = await workspace(sam, [[maya, "ADMIN"]], "Platform & Co");
  await prisma.decision.create({ data: { workspaceId: ws.id, createdById: sam.id, createdByLabel: "<b>Sam</b>", question: "<script>alert(1)</script> Use queues?", sourceDiscussionTitle: "x", idempotencyKey: suffix() } });
  const digest = await buildDigest(maya.id);
  const { html, text, subject } = renderDigest(digest, { baseUrl: "https://commons.example", unsubscribeAll: "https://commons.example/unsubscribe/abc" });
  assert.ok(!html.includes("<script>"), "no raw script tags");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; Use queues?"));
  assert.ok(html.includes("Platform &amp; Co"));
  assert.ok(html.includes(`https://commons.example/workspace/${ws.id}/decisions/`));
  assert.ok(html.includes("Stop daily digests"));
  assert.ok(text.includes("NEEDS YOU (1)") && text.includes("<script>alert(1)</script> Use queues?"), "the text part is plain");
  assert.equal(subject, "Commons: 1 thing needs you");
});
