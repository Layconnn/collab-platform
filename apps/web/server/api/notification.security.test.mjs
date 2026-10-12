import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

import createJiti from "jiti";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5433/my_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-123456789";

const jiti = createJiti(import.meta.url);
const { notificationService } = jiti("../services/notification.service.ts");
const { notificationRouter } = jiti("./routers/notification.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis, redisCache } = jiti("../cache/redis.ts");
const { notificationQueue, enqueueNotificationJob } = jiti("../queue/notification.queue.ts");

const userA = "c000000000000000000000001";
const userB = "c000000000000000000000002";
const workspaceA = "c000000000000000000000003";
const workspaceB = "c000000000000000000000004";
const discussionA = "c000000000000000000000005";
const context = { requestId: "notification-security-test" };

const originalFindMany = prisma.notification.findMany.bind(prisma.notification);
const originalUpdateMany = prisma.notification.updateMany.bind(prisma.notification);
const originalCacheGet = redisCache.getJSON.bind(redisCache);
const originalCacheSet = redisCache.setJSON.bind(redisCache);
const originalQueueAdd = notificationQueue.add.bind(notificationQueue);

const state = {
  members: new Set(),
  notifications: [],
  lastQuery: null,
  cacheReads: 0,
};

function notification(id, workspaceId, recipientUserId, readAt = null) {
  return {
    id,
    recipientUserId,
    workspaceId,
    discussionId: discussionA,
    commentId: null,
    type: "MENTION",
    message: "You were mentioned in a discussion.",
    readAt,
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    actor: { id: userB, name: null, username: "colleague", email: "private@example.test" },
  };
}

beforeEach(() => {
  state.members.clear();
  state.notifications = [];
  state.lastQuery = null;
  state.cacheReads = 0;
});

prisma.notification.findMany = async ({ where, take, skip, cursor, select }) => {
  state.lastQuery = where;
  let rows = state.notifications
    .filter((row) => row.recipientUserId === where.recipientUserId)
    .filter((row) => state.members.has(`${row.workspaceId}:${where.workspace.members.some.userId}`))
    .filter((row) => !Object.hasOwn(where, "readAt") || row.readAt === where.readAt)
    .sort((a, b) => b.id.localeCompare(a.id));
  if (cursor) {
    const index = rows.findIndex((row) => row.id === cursor.id);
    rows = index >= 0 ? rows.slice(index + (skip ?? 0)) : [];
  }
  return rows.slice(0, take).map((row) => {
    const result = {};
    for (const key of Object.keys(select)) {
      result[key] = key === "actor"
        ? Object.fromEntries(Object.keys(select.actor.select).map((field) => [field, row.actor[field]]))
        : row[key];
    }
    return result;
  });
};

prisma.notification.updateMany = async ({ where, data }) => {
  let count = 0;
  for (const row of state.notifications) {
    if (row.recipientUserId !== where.recipientUserId) continue;
    if (where.id && row.id !== where.id) continue;
    if (where.workspaceId && row.workspaceId !== where.workspaceId) continue;
    if (Object.hasOwn(where, "readAt") && row.readAt !== where.readAt) continue;
    row.readAt = data.readAt;
    count += 1;
  }
  return { count };
};

redisCache.getJSON = async () => {
  state.cacheReads += 1;
  return { items: [notification("c000000000000000000000010", workspaceA, userA)], nextCursor: null };
};
redisCache.setJSON = async () => {
  throw new Error("Notification feed must not be cached without a fresh membership check.");
};

after(async () => {
  prisma.notification.findMany = originalFindMany;
  prisma.notification.updateMany = originalUpdateMany;
  redisCache.getJSON = originalCacheGet;
  redisCache.setJSON = originalCacheSet;
  notificationQueue.add = originalQueueAdd;
  await notificationQueue.close();
  await prisma.$disconnect();
  redis.disconnect();
});

test("queue job IDs are stable and BullMQ-safe while preserving the database dedupe key", async () => {
  const calls = [];
  notificationQueue.add = async (...args) => {
    calls.push(args);
    return { id: args[2].jobId };
  };
  const payload = {
    dedupeKey: `notification:MENTION:${userA}:${workspaceA}:${discussionA}:none`,
    recipientUserId: userA,
    actorUserId: userB,
    workspaceId: workspaceA,
    discussionId: discussionA,
    commentId: null,
    type: "MENTION",
    message: "You were mentioned in a discussion.",
    metadata: null,
  };

  await enqueueNotificationJob(payload);
  await enqueueNotificationJob(payload);
  assert.equal(calls.length, 2);
  assert.match(calls[0][2].jobId, /^[0-9a-f]{64}$/);
  assert.equal(calls[0][2].jobId, calls[1][2].jobId);
  assert.equal(calls[0][1].dedupeKey, payload.dedupeKey);
});

test("a revoked member cannot receive stale Redis data or another recipient's notifications", async () => {
  state.members.add(`${workspaceA}:${userA}`);
  state.members.add(`${workspaceB}:${userA}`);
  const a = notification("c000000000000000000000011", workspaceA, userA);
  const b = notification("c000000000000000000000012", workspaceB, userA);
  const other = notification("c000000000000000000000013", workspaceB, userB);
  state.notifications.push(a, b, other);

  const before = await notificationService.listForUser(userA, { take: 20, unreadOnly: false }, context);
  assert.deepEqual(before.items.map((item) => item.id), [b.id, a.id]);
  assert.equal(Object.hasOwn(before.items[0].actor, "email"), false);
  assert.equal(before.items[0].actor.username, "colleague");

  state.members.delete(`${workspaceA}:${userA}`);
  const afterRemoval = await notificationService.listForUser(userA, { take: 20, unreadOnly: false }, context);
  assert.deepEqual(afterRemoval.items.map((item) => item.id), [b.id]);
  assert.equal(state.lastQuery.recipientUserId, userA);
  assert.deepEqual(state.lastQuery.workspace.members.some, { userId: userA });
  assert.equal(state.cacheReads, 0);
});

test("historical records remain stored but are hidden after revocation", async () => {
  const row = notification("c000000000000000000000014", workspaceA, userA);
  state.notifications.push(row);
  const page = await notificationService.listForUser(userA, { take: 20, unreadOnly: false }, context);
  assert.deepEqual(page.items, []);
  assert.equal(state.notifications.length, 1);
  assert.equal((await notificationService.markAsRead(userA, { notificationId: row.id }, context)).success, true);
  assert.ok(row.readAt instanceof Date);
  await assert.rejects(
    notificationService.markAsRead(userB, { notificationId: row.id }, context),
    (error) => error?.code === "NOT_FOUND",
  );
});

test("unread pagination and bulk read use only the recipient's notifications", async () => {
  state.members.add(`${workspaceA}:${userA}`);
  const ids = ["c000000000000000000000015", "c000000000000000000000016", "c000000000000000000000017"];
  state.notifications.push(...ids.map((id) => notification(id, workspaceA, userA)));
  state.notifications.push(notification("c000000000000000000000018", workspaceA, userB));

  const first = await notificationService.listForUser(userA, { take: 2, unreadOnly: true }, context);
  assert.deepEqual(first.items.map((item) => item.id), [ids[2], ids[1]]);
  assert.equal(first.nextCursor, ids[1]);
  const second = await notificationService.listForUser(userA, { take: 2, cursor: first.nextCursor, unreadOnly: true }, context);
  assert.deepEqual(second.items.map((item) => item.id), [ids[0]]);
  assert.equal(second.nextCursor, null);
  assert.equal(state.lastQuery.readAt, null);

  const marked = await notificationService.markAllAsRead(userA, { workspaceId: workspaceA }, context);
  assert.equal(marked.updatedCount, 3);
  const unread = await notificationService.listForUser(userA, { take: 20, unreadOnly: true }, context);
  assert.deepEqual(unread.items, []);
  assert.equal(state.notifications.find((row) => row.recipientUserId === userB).readAt, null);
});

test("the notification route rejects an unauthenticated caller", async () => {
  const caller = notificationRouter.createCaller({
    user: null,
    requestId: "anonymous-notifications",
    headers: new Headers(),
    requestMethod: "POST",
    ip: null,
    responseHeaders: new Headers(),
  });
  await assert.rejects(
    caller.listForUser({ take: 20, unreadOnly: false }),
    (error) => error?.code === "UNAUTHORIZED",
  );
});
