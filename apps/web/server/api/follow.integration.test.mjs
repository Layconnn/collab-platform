import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Follow and mute against a real database: automatic follows, who hears about
// replies, idempotent controls and tenant isolation.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { appRouter } = jiti("./root.ts");
const { planNotificationDeliveries } = jiti("../services/notification.service.ts");
const { notificationQueue } = jiti("../queue/notification.queue.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
notificationQueue.add = async (_name, _payload, options) => ({ id: options.jobId });

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const caller = (user) => appRouter.createCaller({
  user: { id: user.id }, requestId: `follow-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});

async function user(name) {
  const unique = suffix().slice(0, 20);
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `f_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}
async function workspace(owner, members) {
  const ws = await prisma.workspace.create({ data: { name: `WS ${suffix().slice(0, 6)}`, slug: `follow-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map((member) => ({ workspaceId: ws.id, userId: member.id, role: "MEMBER" })),
  ] });
  return ws;
}
const status = async (user, ws, d) => (await caller(user).follow.get({ workspaceId: ws.id, discussionId: d.id })).status;
const replyEvent = (ws, d, actor, body) => ({
  kind: "comment_created", requestId: suffix(), actorUserId: actor.id, workspaceId: ws.id, discussionId: d.id,
  commentId: `c${suffix().slice(0, 24)}`, body, parentCommentId: null,
});

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => { assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`); return true; });
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await notificationQueue.close();
  await prisma.$disconnect();
  redis.disconnect();
});

test("starting a discussion or replying follows it, but replying never undoes a mute", async () => {
  const [maya, sam, lee] = await Promise.all([user("Maya"), user("Sam"), user("Lee")]);
  const ws = await workspace(maya, [sam, lee]);
  const d = await caller(maya).discussion.create({ workspaceId: ws.id, title: "Which queue?", body: "Vercel Queues or BullMQ?" });
  assert.equal(await status(maya, ws, d), "FOLLOWING");
  assert.equal(await status(sam, ws, d), "NONE");

  await caller(sam).comment.create({ discussionId: d.id, body: "Vercel Queues." });
  assert.equal(await status(sam, ws, d), "FOLLOWING");

  await caller(lee).follow.set({ workspaceId: ws.id, discussionId: d.id, status: "MUTED" });
  await caller(lee).comment.create({ discussionId: d.id, body: "Muted, but replying anyway." });
  assert.equal(await status(lee, ws, d), "MUTED");
  const view = await caller(maya).follow.get({ workspaceId: ws.id, discussionId: d.id });
  assert.equal(view.followers, 2, "Maya and Sam follow; Lee muted");
});

test("replies notify followers and mentions, not every member", async () => {
  const [maya, sam, lee, kim, gone] = await Promise.all([user("Maya"), user("Sam"), user("Lee"), user("Kim"), user("Gone")]);
  const ws = await workspace(maya, [sam, lee, kim, gone]);
  const d = await caller(maya).discussion.create({ workspaceId: ws.id, title: "Pricing", body: "Free plan?" });
  await caller(lee).follow.set({ workspaceId: ws.id, discussionId: d.id, status: "MUTED" });
  await caller(gone).follow.set({ workspaceId: ws.id, discussionId: d.id, status: "FOLLOWING" });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId: gone.id } });

  // Sam replies: Maya follows; Kim does not follow; Lee muted; Gone left.
  let deliveries = await planNotificationDeliveries(replyEvent(ws, d, sam, "Yes, for teams under five."));
  assert.deepEqual(deliveries.map((row) => [row.recipientUserId, row.type]), [[maya.id, "COMMENT_CREATED"]]);

  // Mentions reach non-followers and muted members.
  deliveries = await planNotificationDeliveries(replyEvent(ws, d, sam, `@${kim.username} and @${lee.username}, thoughts?`));
  const byUser = Object.fromEntries(deliveries.map((row) => [row.recipientUserId, row.type]));
  assert.deepEqual(byUser, { [maya.id]: "COMMENT_CREATED", [kim.id]: "MENTION", [lee.id]: "MENTION" });

  // The person replying never notifies themselves.
  deliveries = await planNotificationDeliveries(replyEvent(ws, d, maya, "Thanks."));
  assert.equal(deliveries.some((row) => row.recipientUserId === maya.id), false);
});

test("follow controls are idempotent and stay inside the workspace", async () => {
  const [maya, sam, outsider] = await Promise.all([user("Maya"), user("Sam"), user("Out")]);
  const ws = await workspace(maya, [sam]);
  const other = await workspace(outsider, []);
  const d = await caller(maya).discussion.create({ workspaceId: ws.id, title: "Roadmap", body: "H2 order" });

  for (const next of ["FOLLOWING", "FOLLOWING", "MUTED", "MUTED", "FOLLOWING", "NONE", "NONE"]) {
    const result = await caller(sam).follow.set({ workspaceId: ws.id, discussionId: d.id, status: next });
    assert.equal(result.status, next);
  }
  assert.equal(await prisma.discussionFollow.count({ where: { discussionId: d.id, userId: sam.id } }), 0);

  await rejects(caller(outsider).follow.get({ workspaceId: ws.id, discussionId: d.id }), "NOT_FOUND");
  await rejects(caller(outsider).follow.set({ workspaceId: ws.id, discussionId: d.id, status: "FOLLOWING" }), "NOT_FOUND");
  await rejects(caller(outsider).follow.set({ workspaceId: other.id, discussionId: d.id, status: "FOLLOWING" }), "NOT_FOUND");
  await assert.rejects(prisma.discussionFollow.create({ data: { workspaceId: other.id, discussionId: d.id, userId: outsider.id } }), "the database refuses a follow in the wrong workspace");
});

test("follows go with their discussion", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const d = await caller(maya).discussion.create({ workspaceId: ws.id, title: "Short lived", body: "Body" });
  await caller(sam).follow.set({ workspaceId: ws.id, discussionId: d.id, status: "FOLLOWING" });
  await prisma.discussion.delete({ where: { id: d.id } });
  assert.equal(await prisma.discussionFollow.count({ where: { discussionId: d.id } }), 0);
});
