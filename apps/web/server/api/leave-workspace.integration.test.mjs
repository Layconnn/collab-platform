import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Leaving a workspace (settings PRD, FR-14) against a real database and Redis:
// a member or admin leaves on their own, an owner is told to transfer
// ownership first, and the workspace's activity says who left.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { workspaceRouter } = jiti("./routers/workspace.router.ts");
const { preferencesRouter } = jiti("./routers/preferences.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
const originalIncr = redis.incr.bind(redis);
redis.incr = async (key) => (key.startsWith("ratelimit:") ? 1 : originalIncr(key));

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];

const context = (userId) => ({
  user: { id: userId }, requestId: `leave-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});
const workspaces = (userId) => workspaceRouter.createCaller(context(userId));

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `lv_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

async function team() {
  const [maya, sam, lee] = await Promise.all(["Maya", "Sam", "Lee"].map(user));
  const ws = await prisma.workspace.create({ data: { name: "Platform", slug: `lv-${suffix()}`, ownerId: maya.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: maya.id, role: "OWNER" },
    { workspaceId: ws.id, userId: sam.id, role: "MEMBER" },
    { workspaceId: ws.id, userId: lee.id, role: "ADMIN" },
  ] });
  return { ws, maya, sam, lee };
}

const listed = async (userId) => (await workspaces(userId).listForUser({ take: 20 })).items.map((item) => item.workspaceId);

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("a member leaves: access ends, settings for that workspace go, and the activity says so", async () => {
  const { ws, maya, sam } = await team();
  await preferencesRouter.createCaller(context(sam.id)).update({ startPage: "default", defaultWorkspaceId: ws.id });
  await preferencesRouter.createCaller(context(sam.id)).setNotificationLevel({ workspaceId: ws.id, level: "INVOLVED" });
  await prisma.userPreference.update({ where: { userId: sam.id }, data: { lastWorkspaceId: ws.id } });
  assert.deepEqual(await listed(sam.id), [ws.id]); // cached now

  assert.deepEqual(await workspaces(sam.id).leave({ workspaceId: ws.id }), { success: true });
  assert.equal(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, userId: sam.id } }), 0);
  assert.deepEqual(await listed(sam.id), []);
  await assert.rejects(workspaces(sam.id).getById({ workspaceId: ws.id }), (error) => error.code === "NOT_FOUND" || error.code === "FORBIDDEN");
  assert.equal(await prisma.workspaceNotificationLevel.count({ where: { userId: sam.id } }), 0);
  const prefs = await prisma.userPreference.findUniqueOrThrow({ where: { userId: sam.id } });
  assert.equal(prefs.defaultWorkspaceId, null);
  assert.equal(prefs.lastWorkspaceId, null);

  const event = await prisma.activityEvent.findFirstOrThrow({ where: { workspaceId: ws.id, kind: "MEMBER_REMOVED" } });
  assert.equal(event.actorUserId, sam.id);
  assert.equal(event.subjectId, sam.id);
  assert.deepEqual(event.summary, { member: "Sam", previousRole: "MEMBER", left: true });
  // The rest of the team carries on.
  assert.equal(await prisma.workspaceMember.count({ where: { workspaceId: ws.id } }), 2);
  assert.ok((await listed(maya.id)).includes(ws.id));
});

test("an admin can leave; an owner is told to transfer ownership first", async () => {
  const { ws, maya, lee } = await team();
  await assert.rejects(workspaces(maya.id).leave({ workspaceId: ws.id }), (error) => error.code === "CONFLICT" && /Transfer ownership/.test(error.message));
  assert.equal(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, userId: maya.id } }), 1);

  await workspaces(lee.id).leave({ workspaceId: ws.id });
  assert.equal(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, userId: lee.id } }), 0);

  // After a transfer, the former owner can leave.
  await workspaces(maya.id).transferOwnership({ workspaceId: ws.id, newOwnerUserId: (await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: ws.id, role: "MEMBER" } })).userId });
  await workspaces(maya.id).leave({ workspaceId: ws.id });
  assert.equal(await prisma.workspaceMember.count({ where: { workspaceId: ws.id, role: "OWNER" } }), 1);
});

test("leaving a workspace you're not in, or twice, is not found", async () => {
  const { ws, sam } = await team();
  const outsider = await user("Outsider");
  await assert.rejects(workspaces(outsider.id).leave({ workspaceId: ws.id }), (error) => error.code === "NOT_FOUND");
  await workspaces(sam.id).leave({ workspaceId: ws.id });
  await assert.rejects(workspaces(sam.id).leave({ workspaceId: ws.id }), (error) => error.code === "NOT_FOUND");
});
