import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Reads the activity log against a real database: ordering, keyset pagination
// and subject availability are exactly what in-memory fakes get wrong.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

// Load Prisma's runtime with Node's own loader (see decision.integration.test.mjs).
const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { activityRouter } = jiti("./routers/activity.router.ts");
const { recordActivity } = jiti("../services/activity.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];

function caller(userId) {
  return activityRouter.createCaller({
    user: { id: userId },
    requestId: `activity-test-${suffix()}`,
    headers: new Headers(),
    requestMethod: "GET",
    ip: null,
    responseHeaders: new Headers(),
  });
}

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `activity_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

async function workspaceWith(owner, members = []) {
  const workspace = await prisma.workspace.create({ data: { name: "Activity", slug: `activity-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({
    data: [{ workspaceId: workspace.id, userId: owner.id, role: "OWNER" }, ...members.map((m) => ({ workspaceId: workspace.id, userId: m.id, role: "MEMBER" }))],
  });
  return workspace;
}

// Events are written the way services write them, one per change.
function record(workspaceId, actor, kind, subjectType, subjectId, summary) {
  return prisma.$transaction((tx) => recordActivity(tx, { workspaceId, actorUserId: actor.id, kind, subjectType, subjectId, summary }));
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("members read events newest first; outsiders get NOT_FOUND", async () => {
  const [owner, member, outsider] = await Promise.all([user("Owner"), user("Member"), user("Outsider")]);
  const ws = await workspaceWith(owner, [member]);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: member.id, title: "Queues", body: "Which one?" } });
  await record(ws.id, member, "DISCUSSION_CREATED", "DISCUSSION", discussion.id, { title: "Queues" });
  await record(ws.id, owner, "DISCUSSION_UPDATED", "DISCUSSION", discussion.id, { title: "Queues" });

  const { items, nextCursor } = await caller(member.id).listByWorkspace({ workspaceId: ws.id });
  assert.deepEqual(items.map((i) => [i.kind, i.actor.label]), [["DISCUSSION_UPDATED", "Owner"], ["DISCUSSION_CREATED", "Member"]]);
  assert.equal(items[0].available, true);
  assert.deepEqual(items[0].discussion, { id: discussion.id, title: "Queues" });
  assert.equal(nextCursor, null);
  await expectCode(caller(outsider.id).listByWorkspace({ workspaceId: ws.id }), "NOT_FOUND");
});

test("keyset pagination returns every event once, in order", async () => {
  const owner = await user("Owner");
  const ws = await workspaceWith(owner);
  for (let index = 0; index < 7; index++) {
    await record(ws.id, owner, "WORKSPACE_UPDATED", "WORKSPACE", ws.id, { name: `Name ${index}` });
  }
  const seen = [];
  let cursor;
  do {
    const page = await caller(owner.id).listByWorkspace({ workspaceId: ws.id, take: 3, cursor });
    seen.push(...page.items.map((i) => i.summary.name));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(seen, ["Name 6", "Name 5", "Name 4", "Name 3", "Name 2", "Name 1", "Name 0"]);
});

test("a cursor from another workspace is rejected and leaks nothing", async () => {
  const owner = await user("Owner");
  const [mine, theirs] = await Promise.all([workspaceWith(owner), workspaceWith(await user("Other owner"))]);
  await record(mine.id, owner, "WORKSPACE_UPDATED", "WORKSPACE", mine.id, { name: "Mine" });
  const foreign = await prisma.activityEvent.create({
    data: { workspaceId: theirs.id, actorLabel: "Other owner", kind: "WORKSPACE_UPDATED", subjectType: "WORKSPACE", subjectId: theirs.id, summary: { name: "Theirs" } },
  });
  await expectCode(caller(owner.id).listByWorkspace({ workspaceId: mine.id, cursor: foreign.id }), "BAD_REQUEST");
});

test("filters narrow to one kind of activity", async () => {
  const owner = await user("Owner");
  const ws = await workspaceWith(owner);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: owner.id, title: "Mixed", body: "Body" } });
  await record(ws.id, owner, "DISCUSSION_CREATED", "DISCUSSION", discussion.id, { title: "Mixed" });
  await record(ws.id, owner, "MEMBER_ADDED", "MEMBER", owner.id, { member: "Owner", role: "MEMBER" });
  await record(ws.id, owner, "DECISION_PROPOSED", "DECISION", "c" + suffix().slice(0, 24), { question: "Gone already?", status: "PROPOSED" });

  const kinds = async (filter) => (await caller(owner.id).listByWorkspace({ workspaceId: ws.id, filter })).items.map((i) => i.kind);
  assert.deepEqual(await kinds("discussions"), ["DISCUSSION_CREATED"]);
  assert.deepEqual(await kinds("members"), ["MEMBER_ADDED"]);
  assert.deepEqual(await kinds("decisions"), ["DECISION_PROPOSED"]);
  assert.deepEqual(await kinds("comments"), []);
  assert.equal((await kinds("all")).length, 3);
});

test("deleted subjects stay listed but unavailable; comments resolve their discussion", async () => {
  const [owner, member] = await Promise.all([user("Owner"), user("Member")]);
  const ws = await workspaceWith(owner, [member]);
  const kept = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: owner.id, title: "Kept", body: "Body" } });
  const removed = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: owner.id, title: "Removed", body: "Body" } });
  const comment = await prisma.comment.create({ data: { workspaceId: ws.id, discussionId: kept.id, authorId: member.id, body: "Reply" } });
  const decision = await prisma.decision.create({
    data: { workspaceId: ws.id, sourceDiscussionTitle: "Kept", createdByLabel: "Owner", question: "Soft deleted?", idempotencyKey: suffix(), deletedAt: new Date() },
  });
  await record(ws.id, owner, "DISCUSSION_CREATED", "DISCUSSION", removed.id, { title: "Removed" });
  await record(ws.id, member, "COMMENT_CREATED", "COMMENT", comment.id, { discussionId: kept.id });
  await record(ws.id, owner, "DECISION_DELETED", "DECISION", decision.id, { question: "Soft deleted?" });
  await record(ws.id, owner, "MEMBER_REMOVED", "MEMBER", member.id, { member: "Member", previousRole: "MEMBER" });
  await prisma.discussion.delete({ where: { id: removed.id } });
  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: ws.id, userId: member.id } } });

  const { items } = await caller(owner.id).listByWorkspace({ workspaceId: ws.id });
  const byKind = Object.fromEntries(items.map((i) => [i.kind, i]));
  assert.equal(byKind.DISCUSSION_CREATED.available, false);
  assert.equal(byKind.DISCUSSION_CREATED.discussion, null);
  assert.equal(byKind.DISCUSSION_CREATED.summary.title, "Removed");
  assert.equal(byKind.COMMENT_CREATED.available, true);
  assert.deepEqual(byKind.COMMENT_CREATED.discussion, { id: kept.id, title: "Kept" });
  assert.equal(byKind.DECISION_DELETED.available, false);
  assert.equal(byKind.MEMBER_REMOVED.available, false);
});

test("a removed member can no longer read the workspace's activity", async () => {
  const [owner, member] = await Promise.all([user("Owner"), user("Member")]);
  const ws = await workspaceWith(owner, [member]);
  await record(ws.id, owner, "WORKSPACE_UPDATED", "WORKSPACE", ws.id, { name: "Before" });
  assert.equal((await caller(member.id).listByWorkspace({ workspaceId: ws.id })).items.length, 1);
  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: ws.id, userId: member.id } } });
  await expectCode(caller(member.id).listByWorkspace({ workspaceId: ws.id }), "NOT_FOUND");
});
