import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// "Needs you" against a real database: providers, ordering, permissions,
// membership changes and dismissal scope.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
// Run in a session time zone far from UTC, as a developer's local database
// might, so time comparisons that depend on the session's zone fail here.
const sessionUrl = new URL(databaseUrl);
sessionUrl.searchParams.set("options", "-c TimeZone=Pacific/Kiritimati");
process.env.DATABASE_URL = sessionUrl.toString();
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { homeRouter } = jiti("./routers/home.router.ts");
const { plainExcerpt, rankNeeds } = jiti("../services/home.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const DAY = 24 * 60 * 60 * 1000;

function caller(userId) {
  return homeRouter.createCaller({
    user: { id: userId }, requestId: `home-test-${suffix()}`, headers: new Headers(),
    requestMethod: "POST", ip: null, responseHeaders: new Headers(),
  });
}

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `home_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

async function workspace(owner, members) {
  const ws = await prisma.workspace.create({ data: { name: `WS ${suffix().slice(0, 6)}`, slug: `home-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map(([member, role]) => ({ workspaceId: ws.id, userId: member.id, role })),
  ] });
  return ws;
}

const discussion = (ws, author, title) => prisma.discussion.create({ data: { workspaceId: ws.id, authorId: author.id, title, body: "Body" } });
const notify = (recipient, actor, ws, d, type, createdAt = new Date()) => prisma.notification.create({ data: {
  recipientUserId: recipient.id, actorUserId: actor.id, workspaceId: ws.id, discussionId: d.id, type,
  message: type, dedupeKey: suffix(), createdAt,
} });
const proposal = (ws, author, question, createdAt = new Date(), extra = {}) => prisma.decision.create({ data: {
  workspaceId: ws.id, createdById: author.id, createdByLabel: author.name, question, sourceDiscussionTitle: "Source",
  idempotencyKey: suffix(), createdAt, ...extra,
} });

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("lists mentions, replies to own discussions, waiting proposals and own proposals in urgency order", async () => {
  const [maya, sam, lee] = await Promise.all([user("Maya"), user("Sam"), user("Lee")]);
  const ws = await workspace(lee, [[maya, "ADMIN"], [sam, "MEMBER"]]);
  const mine = await discussion(ws, maya, "Which queue?");
  const theirs = await discussion(ws, sam, "Pricing");
  await notify(maya, sam, ws, theirs, "MENTION");
  await notify(maya, sam, ws, mine, "COMMENT_CREATED", new Date(Date.now() - 1000));
  await notify(maya, sam, ws, theirs, "COMMENT_CREATED"); // a reply in someone else's discussion
  await notify(maya, sam, ws, theirs, "DISCUSSION_CREATED"); // not something Home shows
  const old = await proposal(ws, sam, "Old proposal", new Date(Date.now() - 3 * DAY));
  const fresh = await proposal(ws, sam, "Fresh proposal");
  const own = await proposal(ws, maya, "My proposal");
  await proposal(ws, sam, "Already decided", new Date(), { status: "DECIDED" });
  await proposal(ws, sam, "Deleted proposal", new Date(), { deletedAt: new Date() });

  const { items, total } = await caller(maya.id).needsYou({});
  assert.deepEqual(items.map((i) => [i.kind, i.title]), [
    ["MENTION", "Pricing"],
    ["PROPOSAL_WAITING", "Old proposal"],
    ["REPLY", "Which queue?"],
    ["PROPOSAL_WAITING", "Fresh proposal"],
    ["OWN_PROPOSAL", "My proposal"],
  ]);
  assert.equal(total, 5);
  assert.equal(items[0].actor, "Sam");
  assert.deepEqual(items[0].workspace, { id: ws.id, name: ws.name });
  assert.equal(items[1].decisionId, old.id);
  assert.equal(items[3].decisionId, fresh.id);
  assert.equal(items[4].decisionId, own.id);
  assert.ok(items[0].notificationId && items[2].notificationId);
  assert.equal(items[1].notificationId, null);
});

test("cards carry the words of a mention or reply and a proposal's outcome, reasoning and reviews", async () => {
  const [maya, sam, lee] = await Promise.all([user("Maya"), user("Sam"), user("Lee")]);
  const ws = await workspace(lee, [[maya, "ADMIN"], [sam, "MEMBER"]]);
  const theirs = await discussion(ws, sam, "Logo");
  const mine = await discussion(ws, maya, "Pricing");
  const reply = await prisma.comment.create({ data: { discussionId: mine.id, workspaceId: ws.id, authorId: sam.id, body: "**Flat** pricing reads [simpler](https://example.test)." } });
  await prisma.notification.create({ data: {
    recipientUserId: maya.id, actorUserId: sam.id, workspaceId: ws.id, discussionId: mine.id, commentId: reply.id,
    type: "COMMENT_CREATED", message: "reply", dedupeKey: suffix(),
  } });
  await notify(maya, sam, ws, theirs, "MENTION"); // a mention in the discussion itself: its body
  const asked = await proposal(ws, sam, "Flat $49 a month", new Date(), { outcome: "Flat $49 a month for up to 10 seats.", rationale: "Per-seat pricing makes small teams hesitate." });
  for (const [reviewer, state] of [[maya, "PENDING"], [lee, "APPROVED"]]) {
    await prisma.decisionReview.create({ data: { workspaceId: ws.id, decisionId: asked.id, reviewerId: reviewer.id, reviewerLabel: reviewer.name, requestedByLabel: "Sam", state } });
  }
  await prisma.decisionReview.create({ data: { workspaceId: ws.id, decisionId: asked.id, reviewerLabel: "Gone", requestedByLabel: "Sam", state: "WITHDRAWN" } });

  const { items } = await caller(maya.id).needsYou({});
  const byKind = Object.fromEntries(items.map((item) => [item.kind, item]));
  assert.equal(byKind.REPLY.excerpt, "Flat pricing reads simpler.");
  assert.equal(byKind.MENTION.excerpt, "Body");
  assert.equal(byKind.REVIEW_REQUESTED.outcome, "Flat $49 a month for up to 10 seats.");
  assert.equal(byKind.REVIEW_REQUESTED.rationale, "Per-seat pricing makes small teams hesitate.");
  assert.deepEqual(byKind.REVIEW_REQUESTED.reviews, { approved: 1, requested: 2 });
  assert.equal(byKind.REVIEW_REQUESTED.excerpt, null);
  assert.equal(byKind.MENTION.reviews, null);
  // What acting from Home needs: the version a review answers, and where a reply goes.
  assert.equal(byKind.REVIEW_REQUESTED.decisionVersion, asked.version);
  assert.equal(byKind.REPLY.replyToCommentId, reply.id);
  assert.equal(byKind.MENTION.replyToCommentId, null);
  assert.equal(byKind.MENTION.decisionVersion, null);
});

test("a reply to a comment at the nesting limit goes beside it", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [[sam, "MEMBER"]]);
  const mine = await discussion(ws, maya, "Deep thread");
  const parent = await prisma.comment.create({ data: { discussionId: mine.id, workspaceId: ws.id, authorId: maya.id, body: "Parent", depth: 7 } });
  const deepest = await prisma.comment.create({ data: { discussionId: mine.id, workspaceId: ws.id, authorId: sam.id, body: "At the limit", depth: 8, parentCommentId: parent.id } });
  await prisma.notification.create({ data: {
    recipientUserId: maya.id, actorUserId: sam.id, workspaceId: ws.id, discussionId: mine.id, commentId: deepest.id,
    type: "COMMENT_CREATED", message: "reply", dedupeKey: suffix(),
  } });
  const { items } = await caller(maya.id).needsYou({});
  assert.equal(items.find((item) => item.kind === "REPLY").replyToCommentId, parent.id);
});

test("excerpts drop Markdown and stay short", () => {
  assert.equal(plainExcerpt("# Title\n\n> quoted *text* with `code`\n- item"), "Title quoted text with code item");
  assert.equal(plainExcerpt("![chart](x.png) see [docs](https://x.test)"), "see docs");
  assert.equal(plainExcerpt("@maya_okafor said _this_ and __that__ in snake_case"), "@maya_okafor said this and that in snake_case");
  assert.equal(plainExcerpt("   "), null);
  assert.equal(plainExcerpt(null), null);
  const long = plainExcerpt("word ".repeat(100), 20);
  assert.ok(long.length <= 20 && long.endsWith("…"));
});

test("only owners and admins see proposals waiting for a decision", async () => {
  const [owner, member, author] = await Promise.all([user("Owner"), user("Member"), user("Author")]);
  const ws = await workspace(owner, [[member, "MEMBER"], [author, "MEMBER"]]);
  await proposal(ws, author, "Needs a decision");
  assert.deepEqual((await caller(owner.id).needsYou({})).items.map((i) => i.kind), ["PROPOSAL_WAITING"]);
  assert.deepEqual((await caller(member.id).needsYou({})).items, []);
  assert.deepEqual((await caller(author.id).needsYou({})).items.map((i) => i.kind), ["OWN_PROPOSAL"]);
});

test("items disappear when the user leaves a workspace and never come from other workspaces", async () => {
  const [maya, sam, outsider] = await Promise.all([user("Maya"), user("Sam"), user("Outsider")]);
  const ws = await workspace(sam, [[maya, "ADMIN"]]);
  const other = await workspace(outsider, []);
  const d = await discussion(ws, sam, "Shared");
  await notify(maya, sam, ws, d, "MENTION");
  await proposal(ws, sam, "Pending");
  await proposal(other, outsider, "Not yours");
  assert.equal((await caller(maya.id).needsYou({})).total, 2);
  assert.equal((await caller(outsider.id).needsYou({})).items.some((i) => i.workspace.id === ws.id), false);
  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: ws.id, userId: maya.id } } });
  assert.deepEqual(await caller(maya.id).needsYou({}), { items: [], total: 0 });
});

test("dismissing marks only the user's own mention and reply notifications done", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(sam, [[maya, "MEMBER"]]);
  const mine = await discussion(ws, maya, "Mine");
  const theirs = await discussion(ws, sam, "Theirs");
  const mention = await notify(maya, sam, ws, theirs, "MENTION");
  const reply = await notify(maya, sam, ws, mine, "COMMENT_CREATED");
  const created = await notify(maya, sam, ws, theirs, "DISCUSSION_CREATED");
  const otherReply = await notify(maya, sam, ws, theirs, "COMMENT_CREATED");
  const samsMention = await notify(sam, maya, ws, theirs, "MENTION");

  assert.deepEqual(await caller(maya.id).dismiss({ notificationIds: [mention.id, created.id, samsMention.id] }), { dismissed: 1 });
  assert.deepEqual((await caller(maya.id).needsYou({})).items.map((i) => i.kind), ["REPLY"]);
  assert.deepEqual(await caller(maya.id).dismissAll(), { dismissed: 1 });
  assert.deepEqual((await caller(maya.id).needsYou({})).items, []);

  const readAt = async (n) => (await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt;
  assert.ok(await readAt(reply));
  assert.equal(await readAt(created), null, "other notification kinds are untouched");
  assert.equal(await readAt(otherReply), null, "replies in other people's discussions are untouched");
  assert.equal(await readAt(samsMention), null, "other users' notifications are untouched");
});

test("Home shows 20 items with the total, and all on request", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(sam, [[maya, "MEMBER"]]);
  const d = await discussion(ws, sam, "Busy");
  for (let i = 0; i < 23; i++) await notify(maya, sam, ws, d, "MENTION", new Date(Date.now() - i * 1000));
  const page = await caller(maya.id).needsYou({});
  assert.equal(page.items.length, 20);
  assert.equal(page.total, 23);
  assert.equal((await caller(maya.id).needsYou({ all: true })).items.length, 23);
});

test("ranking puts urgent proposals between mentions and replies", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const at = (msAgo) => new Date(now.getTime() - msAgo);
  const item = (kind, msAgo, id) => ({ id, kind, at: at(msAgo) });
  const order = rankNeeds([
    item("OWN_PROPOSAL", 5 * DAY, "own"), item("REPLY", 10, "reply-new"), item("REPLY", 1000, "reply-old"),
    item("PROPOSAL_WAITING", DAY, "fresh"), item("PROPOSAL_WAITING", 4 * DAY, "oldest"), item("PROPOSAL_WAITING", 3 * DAY, "older"),
    item("MENTION", 50, "mention"),
  ], now).map((i) => i.id);
  assert.deepEqual(order, ["mention", "oldest", "older", "reply-new", "reply-old", "fresh", "own"]);
});

// ---------------------------------------------------------------------------
// Workspace pulse
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
const event = (ws, actor, kind, msAgo) => prisma.activityEvent.create({ data: {
  workspaceId: ws.id, actorUserId: actor?.id ?? null, actorLabel: actor?.name ?? "Gone", kind,
  subjectType: kind.startsWith("DECISION") ? "DECISION" : kind.startsWith("COMMENT") ? "COMMENT" : "DISCUSSION",
  subjectId: `c${suffix().slice(0, 24)}`, createdAt: new Date(Date.now() - msAgo),
} });

test("pulse counts the last seven days per workspace, by kind and by day", async () => {
  const [maya, sam, lee] = await Promise.all([user("Maya"), user("Sam"), user("Lee")]);
  const ws = await workspace(maya, [[sam, "MEMBER"], [lee, "ADMIN"]]);
  await event(ws, sam, "DISCUSSION_CREATED", 1 * HOUR);
  await event(ws, lee, "COMMENT_CREATED", 2 * HOUR);
  await event(ws, sam, "COMMENT_CREATED", 30 * HOUR);
  await event(ws, maya, "DECISION_FINALIZED", 30 * HOUR + 5);
  await event(ws, maya, "DECISION_PROPOSED", 6 * DAY + 12 * HOUR);
  await event(ws, sam, "DISCUSSION_CREATED", 8 * DAY); // outside the window
  await proposal(ws, sam, "Open one");
  await proposal(ws, sam, "Open two");
  await proposal(ws, sam, "Decided", new Date(), { status: "DECIDED" });
  await proposal(ws, sam, "Deleted", new Date(), { deletedAt: new Date() });

  const { workspaces } = await caller(maya.id).pulse();
  const pulse = workspaces.find((w) => w.id === ws.id);
  assert.equal(pulse.role, "OWNER");
  assert.deepEqual(
    [pulse.discussionsStarted, pulse.replies, pulse.decisionsFinalized, pulse.activePeople, pulse.openProposals],
    [1, 2, 1, 3, 2],
  );
  assert.deepEqual(pulse.daily, [1, 0, 0, 0, 0, 2, 2]);
  assert.ok(Date.now() - new Date(pulse.lastActivityAt).getTime() < 1 * HOUR + 60_000);
});

test("pulse counts an event from seconds ago in the last 24 hours, whatever the session time zone", async () => {
  const [zone] = await prisma.$queryRaw`SELECT current_setting('TimeZone') AS tz`;
  assert.equal(zone.tz, "Pacific/Kiritimati", "the suite runs in a non-UTC session");
  const [maya] = await Promise.all([user("Maya")]);
  const ws = await workspace(maya, []);
  await event(ws, maya, "DISCUSSION_CREATED", 5_000);
  const [pulse] = (await caller(maya.id).pulse()).workspaces;
  assert.equal(pulse.discussionsStarted, 1);
  assert.deepEqual(pulse.daily, [0, 0, 0, 0, 0, 0, 1]);
});

test("pulse orders workspaces by recent activity and shows quiet ones last with zeros", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const busy = await workspace(sam, [[maya, "MEMBER"]]);
  const older = await workspace(sam, [[maya, "ADMIN"]]);
  const quiet = await workspace(sam, [[maya, "MEMBER"]]);
  const elsewhere = await workspace(sam, []);
  await event(older, sam, "COMMENT_CREATED", 3 * DAY);
  await event(busy, sam, "COMMENT_CREATED", 1 * HOUR);
  await event(elsewhere, sam, "COMMENT_CREATED", 10);
  const { workspaces } = await caller(maya.id).pulse();
  assert.deepEqual(workspaces.map((w) => w.id), [busy.id, older.id, quiet.id]);
  const silent = workspaces[2];
  assert.equal(silent.lastActivityAt, null);
  assert.deepEqual(silent.daily, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(silent.activePeople, 0);
  assert.equal(workspaces[1].role, "ADMIN");
});

test("pulse keeps an old last activity even when the week was quiet", async () => {
  const [maya] = await Promise.all([user("Maya")]);
  const ws = await workspace(maya, []);
  await event(ws, maya, "COMMENT_CREATED", 20 * DAY);
  const [pulse] = (await caller(maya.id).pulse()).workspaces;
  assert.equal(pulse.replies, 0);
  assert.ok(pulse.lastActivityAt, "last activity is reported");
  assert.ok(Date.now() - new Date(pulse.lastActivityAt).getTime() > 19 * DAY);
});

// ---------------------------------------------------------------------------
// Decided this week
// ---------------------------------------------------------------------------

const decisionEvent = (ws, actor, kind, decision, msAgo, summary = {}) => prisma.activityEvent.create({ data: {
  workspaceId: ws.id, actorUserId: actor.id, actorLabel: actor.name, kind, subjectType: "DECISION",
  subjectId: decision.id, summary: { question: decision.question, ...summary }, createdAt: new Date(Date.now() - msAgo),
} });

test("decided this week lists finalized and replaced decisions, newest first, once each", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(sam, [[maya, "MEMBER"]]);
  const a = await proposal(ws, sam, "Use BullMQ", new Date(), { status: "SUPERSEDED" });
  const b = await proposal(ws, sam, "Use Vercel Queues", new Date(), { status: "DECIDED" });
  const c = await proposal(ws, sam, "Adopt Playwright", new Date(), { status: "DECIDED", outcome: "One **journey** per release." });
  const gone = await proposal(ws, sam, "Deleted later", new Date(), { status: "DECIDED", deletedAt: new Date() });
  const old = await proposal(ws, sam, "Last month", new Date(), { status: "DECIDED" });
  await decisionEvent(ws, sam, "DECISION_FINALIZED", a, 3 * DAY);
  await decisionEvent(ws, maya, "DECISION_SUPERSEDED", a, 1 * DAY, { replacementDecisionId: b.id, replacementQuestion: b.question });
  await decisionEvent(ws, sam, "DECISION_FINALIZED", b, 2 * DAY);
  await decisionEvent(ws, sam, "DECISION_FINALIZED", c, 1 * HOUR);
  await decisionEvent(ws, sam, "DECISION_FINALIZED", gone, 2 * HOUR);
  await decisionEvent(ws, sam, "DECISION_FINALIZED", old, 9 * DAY);
  await decisionEvent(ws, sam, "DECISION_PROPOSED", c, 30); // not a decision being made

  const { decisions } = await caller(maya.id).recentDecisions();
  assert.deepEqual(decisions.map((d) => [d.question, d.action, d.actor]), [
    ["Adopt Playwright", "FINALIZED", "Sam"],
    ["Use BullMQ", "SUPERSEDED", "Maya"],
    ["Use Vercel Queues", "FINALIZED", "Sam"],
  ]);
  assert.deepEqual(decisions[1].replacement, { id: b.id, question: "Use Vercel Queues" });
  assert.equal(decisions[0].replacement, null);
  assert.deepEqual(decisions[0].workspace, { id: ws.id, name: ws.name });
  assert.equal(decisions[0].outcome, "One journey per release.");
  assert.equal(decisions[2].outcome, null);
});

test("decided this week never shows other workspaces and stops at ten", async () => {
  const [maya, outsider] = await Promise.all([user("Maya"), user("Outsider")]);
  const ws = await workspace(maya, []);
  const other = await workspace(outsider, []);
  for (let i = 0; i < 12; i++) {
    const d = await proposal(ws, maya, `Decision ${i}`, new Date(), { status: "DECIDED" });
    await decisionEvent(ws, maya, "DECISION_FINALIZED", d, (i + 1) * HOUR);
  }
  const theirs = await proposal(other, outsider, "Theirs", new Date(), { status: "DECIDED" });
  await decisionEvent(other, outsider, "DECISION_FINALIZED", theirs, 10);
  const { decisions } = await caller(maya.id).recentDecisions();
  assert.equal(decisions.length, 10);
  assert.equal(decisions[0].question, "Decision 0");
  assert.equal(decisions.some((d) => d.question === "Theirs"), false);
  assert.deepEqual((await caller(outsider.id).recentDecisions()).decisions.map((d) => d.question), ["Theirs"]);
});
