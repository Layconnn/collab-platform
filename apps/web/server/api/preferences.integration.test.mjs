import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Preferences that follow you (settings PRD, FR-15, FR-16) against a real
// database: defaults, saving, the database's allowed values, the default
// workspace, the last workspace and where Commons opens.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { preferencesRouter } = jiti("./routers/preferences.router.ts");
const { preferencesService } = jiti("../services/preferences.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];

const context = (userId) => ({
  user: { id: userId }, requestId: `prefs-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});
const prefs = (userId) => preferencesRouter.createCaller(context(userId));

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `pref_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

async function workspace(owner, members = []) {
  const ws = await prisma.workspace.create({ data: { name: "Prefs", slug: `prefs-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [owner, ...members].map((u, i) => ({ workspaceId: ws.id, userId: u.id, role: i ? "MEMBER" : "OWNER" })) });
  return ws;
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("defaults until saved, then the saved values everywhere", async () => {
  const maya = await user("Maya");
  const fresh = await prefs(maya.id).get();
  assert.deepEqual(fresh, { theme: "system", motion: "system", density: "comfortable", startPage: "home", defaultWorkspaceId: null, lastWorkspaceId: null, saved: false });
  await prefs(maya.id).update({ theme: "dark" });
  const saved = await prefs(maya.id).update({ motion: "reduce", density: "compact" });
  assert.equal(saved.theme, "dark");
  assert.equal(saved.motion, "reduce");
  assert.equal(saved.saved, true);
  await assert.rejects(prefs(maya.id).update({ theme: "sepia" }), (error) => error.code === "BAD_REQUEST");
  // The database refuses values the API would never send.
  await assert.rejects(prisma.userPreference.update({ where: { userId: maya.id }, data: { density: "huge" } }));
});

test("the default workspace must be one of yours, and Commons opens there", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const mine = await workspace(maya);
  const theirs = await workspace(sam);
  await assert.rejects(prefs(maya.id).update({ defaultWorkspaceId: theirs.id }), (error) => error.code === "NOT_FOUND");
  await prefs(maya.id).update({ defaultWorkspaceId: mine.id, startPage: "default" });
  assert.equal(await preferencesService.startPath(maya.id), `/workspace/${mine.id}`);
  // Deleting the workspace clears the default; Home again.
  await prisma.workspace.delete({ where: { id: mine.id } });
  assert.equal((await prefs(maya.id).get()).defaultWorkspaceId, null);
  assert.equal(await preferencesService.startPath(maya.id), "/workspace");
});

test("the last workspace is remembered only when Commons opens on it", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const first = await workspace(maya, [sam]);
  const second = await workspace(maya, [sam]);
  await prefs(sam.id).update({ startPage: "home" });
  await prefs(sam.id).visit({ workspaceId: first.id });
  assert.equal((await prefs(sam.id).get()).lastWorkspaceId, null);

  await prefs(sam.id).update({ startPage: "last" });
  await prefs(sam.id).visit({ workspaceId: second.id });
  assert.equal(await preferencesService.startPath(sam.id), `/workspace/${second.id}`);
  // Removed from the workspace: Home.
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: second.id, userId: sam.id } });
  assert.equal(await preferencesService.startPath(sam.id), "/workspace");
  await assert.rejects(prefs(sam.id).visit({ workspaceId: second.id }), (error) => error.code === "NOT_FOUND");
});

test("a person with no preferences starts on Home", async () => {
  const lee = await user("Lee");
  assert.equal(await preferencesService.startPath(lee.id), "/workspace");
});
