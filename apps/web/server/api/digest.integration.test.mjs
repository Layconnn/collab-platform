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

// ---------------------------------------------------------------------------
// Sending: the daily run and the email adapter (PR 3)
// ---------------------------------------------------------------------------

const { runDigest, MAX_ATTEMPTS } = jiti("../services/digest/digest.runner.ts");
const { createResendSender, EmailError } = jiti("../services/email/email.ts");

function fakeSender(plan = () => "ok") {
  const sent = [];
  const sender = async (email) => {
    const outcome = plan(email, sent.length);
    if (outcome instanceof Error) throw outcome;
    sent.push(email);
    return { id: `msg_${sent.length}` };
  };
  return { sender, sent };
}
const run = (options) => runDigest({ delivery: "all", allowlist: [], deadline: Date.now() + 60_000, ignoreSchedule: true, ...options });
const deliveries = (userIds, date) => prisma.digestDelivery.findMany({ where: { userId: { in: userIds }, digestDate: new Date(`${date}T00:00:00.000Z`) } });

async function teamWithNews() {
  const [busy, quiet, sam] = await Promise.all([user("Busy"), user("Quiet"), user("Sam")]);
  const ws = await workspace(sam, [[busy, "MEMBER"]], "Platform");
  await workspace(quiet, [], "Quiet one");
  await event(ws, sam, "DISCUSSION_CREATED", HOUR);
  return { busy, quiet, sam, ws };
}

test("each member gets at most one digest a day, and nothing on a quiet day", async () => {
  const { busy, quiet } = await teamWithNews();
  const ids = [busy.id, quiet.id];
  const first = fakeSender();
  const a = await run({ sender: first.sender, onlyUserIds: ids });
  assert.deepEqual([a.sent, a.skippedEmpty, a.done], [1, 1, false]);
  assert.equal(first.sent[0].to, busy.email);
  assert.match(first.sent[0].subject, /^Commons: /);
  assert.ok(first.sent[0].html.includes("Platform") && first.sent[0].text.includes("IN YOUR WORKSPACES"));

  const again = fakeSender();
  const b = await run({ sender: again.sender, onlyUserIds: ids });
  assert.deepEqual([b.sent, b.done], [0, true], "a second run the same day sends nothing and reports done");
  assert.equal(again.sent.length, 0);
  const rows = await deliveries(ids, a.date);
  assert.deepEqual(rows.map((row) => row.status).sort(), ["SENT", "SKIPPED_EMPTY"]);
});

test("overlapping runs never send twice", async () => {
  const { busy } = await teamWithNews();
  const shared = fakeSender();
  const results = await Promise.all([1, 2, 3].map(() => run({ sender: shared.sender, onlyUserIds: [busy.id] })));
  assert.equal(shared.sent.length, 1);
  assert.equal(results.reduce((sum, r) => sum + r.sent, 0), 1);
});

test("the allow list holds everyone else's digest, and so does a missing sender", async () => {
  const { busy, ws } = await teamWithNews();
  const lee = await user("Lee");
  await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: lee.id, role: "MEMBER" } });
  const { sender, sent } = fakeSender();
  const result = await runDigest({ sender, delivery: "allowlist", allowlist: [` ${busy.email.toUpperCase()} `], deadline: Date.now() + 60_000, ignoreSchedule: true, onlyUserIds: [busy.id, lee.id] });
  assert.deepEqual([result.sent, result.held], [1, 1]);
  assert.deepEqual(sent.map((email) => email.to), [busy.email]);

  const tomorrow = new Date(Date.now() + 24 * HOUR);
  const unconfigured = await runDigest({ sender: null, delivery: "all", allowlist: [], deadline: Date.now() + 60_000, ignoreSchedule: true, now: tomorrow, onlyUserIds: [lee.id] });
  const [row] = await deliveries([lee.id], unconfigured.date);
  assert.ok(row, "a row is recorded for tomorrow");
  assert.ok(["HELD", "SKIPPED_EMPTY"].includes(row.status));
});

test("without a sender, a digest with news is held and says why", async () => {
  const { busy } = await teamWithNews();
  const result = await runDigest({ sender: null, delivery: "all", allowlist: [], deadline: Date.now() + 60_000, ignoreSchedule: true, onlyUserIds: [busy.id] });
  assert.equal(result.held, 1);
  const [row] = await deliveries([busy.id], result.date);
  assert.deepEqual([row.status, row.error], ["HELD", "Email is not configured."]);
});

test("temporary failures are retried up to three times; rejected addresses are not", async () => {
  const { busy, ws } = await teamWithNews();
  const lee = await user("Lee");
  await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: lee.id, role: "MEMBER" } });
  const ids = [busy.id, lee.id];
  const flaky = fakeSender((email) => (email.to === busy.email ? new EmailError("Resend 429: slow down", 429, true) : new EmailError("Resend 422: invalid to", 422, false)));
  let result = await run({ sender: flaky.sender, onlyUserIds: ids });
  assert.equal(result.failed, 2);
  let rows = await deliveries(ids, result.date);
  const byUser = Object.fromEntries(rows.map((row) => [row.userId, row]));
  assert.deepEqual([byUser[busy.id].attempts, byUser[lee.id].attempts], [1, MAX_ATTEMPTS], "a rejected address is not retried");
  assert.match(byUser[busy.id].error, /429/);

  const healthy = fakeSender();
  result = await run({ sender: healthy.sender, onlyUserIds: ids });
  assert.deepEqual(healthy.sent.map((email) => email.to), [busy.email]);
  rows = await deliveries(ids, result.date);
  const after = Object.fromEntries(rows.map((row) => [row.userId, row]));
  assert.deepEqual([after[busy.id].status, after[busy.id].attempts, after[lee.id].status], ["SENT", 2, "FAILED"]);
});

test("a run stops at its deadline and the next call carries on", async () => {
  const { busy } = await teamWithNews();
  const { sender, sent } = fakeSender();
  const stopped = await run({ sender, deadline: Date.now() - 1, onlyUserIds: [busy.id] });
  assert.deepEqual([stopped.sent, stopped.done], [0, false]);
  const next = await run({ sender, onlyUserIds: [busy.id] });
  assert.equal(next.sent, 1);
  assert.equal(sent.length, 1);
});

test("the Resend adapter sends the expected request and classifies errors", async () => {
  const calls = [];
  const ok = createResendSender({ apiKey: "re_test", from: "Commons <digest@commons.test>", fetchImpl: async (url, init) => { calls.push([url, init]); return new Response(JSON.stringify({ id: "abc" }), { status: 200 }); } });
  assert.deepEqual(await ok({ to: "maya@example.test", subject: "S", html: "<p>H</p>", text: "T", headers: { "List-Unsubscribe": "<https://x>" } }), { id: "abc" });
  const [url, init] = calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.headers.authorization, "Bearer re_test");
  assert.deepEqual(JSON.parse(init.body), { from: "Commons <digest@commons.test>", to: ["maya@example.test"], subject: "S", html: "<p>H</p>", text: "T", headers: { "List-Unsubscribe": "<https://x>" } });

  const limited = createResendSender({ apiKey: "k", fetchImpl: async () => new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 }) });
  await assert.rejects(limited({ to: "a@b.c", subject: "s", html: "h", text: "t" }), (error) => error instanceof EmailError && error.retryable && /429/.test(error.message));
  const rejected = createResendSender({ apiKey: "k", fetchImpl: async () => new Response(JSON.stringify({ message: "Invalid to field" }), { status: 422 }) });
  await assert.rejects(rejected({ to: "bad", subject: "s", html: "h", text: "t" }), (error) => error instanceof EmailError && !error.retryable);
});

test("the run endpoint refuses callers without the shared secret", async () => {
  const { env } = jiti("../env.ts");
  const { POST } = jiti("../../app/api/digest/run/route.ts");
  const call = (authorization) => POST(new Request("https://commons.test/api/digest/run", { method: "POST", headers: authorization ? { authorization } : {} }));
  const saved = env.DIGEST_RUN_SECRET;
  try {
    env.DIGEST_RUN_SECRET = undefined;
    assert.equal((await call("Bearer anything")).status, 503, "not configured yet");
    env.DIGEST_RUN_SECRET = "s".repeat(40);
    assert.equal((await call()).status, 401);
    assert.equal((await call("Bearer wrong")).status, 401);
    assert.equal((await call(`Bearer ${"t".repeat(40)}`)).status, 401, "same length, wrong secret");
  } finally {
    env.DIGEST_RUN_SECRET = saved;
  }
});

// ---------------------------------------------------------------------------
// Preferences and unsubscribe (PR 4)
// ---------------------------------------------------------------------------

const { createUnsubscribeToken, readUnsubscribeToken, UNSUBSCRIBE_TTL_MS } = jiti("../services/digest/digest.tokens.ts");
const { digestPreferences, digestSettingsFor } = jiti("../services/digest/digest.preferences.ts");

test("unsubscribe tokens are scoped, expire, and break when changed", () => {
  const now = new Date("2031-01-01T00:00:00Z");
  const all = createUnsubscribeToken({ userId: "u1", scope: "all" }, now);
  const ws = createUnsubscribeToken({ userId: "u1", scope: "workspace", workspaceId: "w1" }, now);
  assert.deepEqual(readUnsubscribeToken(all, now), { userId: "u1", scope: "all" });
  assert.deepEqual(readUnsubscribeToken(ws, now), { userId: "u1", scope: "workspace", workspaceId: "w1" });
  assert.equal(readUnsubscribeToken(all, new Date(now.getTime() + UNSUBSCRIBE_TTL_MS + 1)), null, "expired");
  const [payload, signature] = all.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "someone-else", s: "all", e: now.getTime() + 1e9 })).toString("base64url");
  assert.equal(readUnsubscribeToken(`${forged}.${signature}`, now), null, "a changed payload fails");
  assert.equal(readUnsubscribeToken(`${payload}.${signature.slice(0, -2)}xx`, now), null, "a changed signature fails");
  assert.equal(readUnsubscribeToken("not-a-token", now), null);
  assert.equal(readUnsubscribeToken(`${all}.extra`, now), null);
});

test("preferences turn the digest off, leave out a workspace, and only for the member's own workspaces", async () => {
  const [maya, sam, outsider] = await Promise.all([user("Maya"), user("Sam"), user("Out")]);
  const platform = await workspace(sam, [[maya, "MEMBER"]], "Platform");
  const other = await workspace(outsider, [], "Other");
  let prefs = await digestPreferences.get(maya.id);
  assert.equal(prefs.enabled, true, "on by default");
  assert.deepEqual(prefs.workspaces.map((w) => [w.name, w.included]), [["Platform", true]]);
  prefs = await digestPreferences.setWorkspace(maya.id, platform.id, false);
  assert.deepEqual(prefs.workspaces.map((w) => w.included), [false]);
  await digestPreferences.setWorkspace(maya.id, platform.id, false);
  assert.equal(await prisma.digestWorkspaceOptOut.count({ where: { userId: maya.id } }), 1, "idempotent");
  await assert.rejects(digestPreferences.setWorkspace(maya.id, other.id, false), (error) => error.code === "NOT_FOUND");
  prefs = await digestPreferences.setEnabled(maya.id, false);
  assert.equal(prefs.enabled, false);
  assert.deepEqual(await digestSettingsFor(maya.id), { enabled: false, excludedWorkspaceIds: [platform.id] });
});

test("links in the email stop digests without signing in, and can be undone", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(sam, [[maya, "MEMBER"]], "Marketing");
  const wsToken = createUnsubscribeToken({ userId: maya.id, scope: "workspace", workspaceId: ws.id });
  assert.deepEqual(await digestPreferences.describeToken(wsToken), { scope: "workspace", workspaceName: "Marketing" });
  await digestPreferences.applyToken(wsToken);
  assert.deepEqual((await digestSettingsFor(maya.id)).excludedWorkspaceIds, [ws.id]);
  await digestPreferences.applyToken(wsToken, true);
  assert.deepEqual((await digestSettingsFor(maya.id)).excludedWorkspaceIds, []);
  const allToken = createUnsubscribeToken({ userId: maya.id, scope: "all" });
  await digestPreferences.applyToken(allToken);
  assert.equal((await digestSettingsFor(maya.id)).enabled, false);
  await assert.rejects(digestPreferences.applyToken("bad.token"), (error) => error.code === "BAD_REQUEST");
});

test("the run skips members who turned it off and leaves out workspaces they excluded", async () => {
  const { busy, ws, sam } = await teamWithNews();
  const second = await workspace(sam, [[busy, "MEMBER"]], "Second");
  await event(second, sam, "COMMENT_CREATED", HOUR);
  await digestPreferences.setWorkspace(busy.id, second.id, false);
  const first = fakeSender();
  await run({ sender: first.sender, onlyUserIds: [busy.id] });
  const email = first.sent[0];
  assert.ok(email.html.includes("Platform") && !email.html.includes("Second"), "an excluded workspace is left out");
  assert.match(email.headers["List-Unsubscribe"], /^<http.+\/api\/digest\/unsubscribe\?token=.+>$/);
  assert.equal(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(email.html.includes("Stop daily digests") && email.html.includes("Stop digests for Platform"));

  await digestPreferences.setEnabled(busy.id, false);
  const later = fakeSender();
  const result = await run({ sender: later.sender, now: new Date(Date.now() + 24 * HOUR), onlyUserIds: [busy.id] });
  assert.deepEqual([result.skippedOff, later.sent.length], [1, 0]);
  void ws;
});

test("one-click unsubscribe works by POST only; opening the link changes nothing", async () => {
  const [maya] = await Promise.all([user("Maya")]);
  const { POST, GET } = jiti("../../app/api/digest/unsubscribe/route.ts");
  const token = createUnsubscribeToken({ userId: maya.id, scope: "all" });
  const url = `https://commons.test/api/digest/unsubscribe?token=${token}`;
  const opened = await GET(new Request(url));
  assert.equal(opened.status, 303);
  assert.match(opened.headers.get("location"), /\/unsubscribe\//);
  assert.equal((await digestSettingsFor(maya.id)).enabled, true, "a GET does not unsubscribe");
  assert.equal((await POST(new Request(url, { method: "POST", body: "List-Unsubscribe=One-Click" }))).status, 200);
  assert.equal((await digestSettingsFor(maya.id)).enabled, false);
  assert.equal((await POST(new Request("https://commons.test/api/digest/unsubscribe?token=bad", { method: "POST" }))).status, 400);
});
