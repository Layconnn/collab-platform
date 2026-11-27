import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Your profile (settings PRD, FR-1 and FR-2) against a real database: the
// display name, username availability, the 30-day cool-down, taken names and
// fresh member lists after a change.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { profileRouter } = jiti("./routers/profile.router.ts");
const { workspaceRouter } = jiti("./routers/workspace.router.ts");
const { authRouter } = jiti("./routers/auth.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];
const DAY = 24 * 60 * 60 * 1000;

const context = (userId) => ({
  user: { id: userId }, requestId: `profile-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});
const profile = (userId) => profileRouter.createCaller(context(userId));

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `prof_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("the display name saves, trims, and clears back to the username", async () => {
  const maya = await user("Maya");
  assert.equal((await profile(maya.id).update({ name: "  Maya Okafor  " })).name, "Maya Okafor");
  assert.equal((await profile(maya.id).update({ name: "" })).name, null);
  const me = await authRouter.createCaller(context(maya.id)).me();
  assert.equal(me.name, null);
  assert.equal(me.usernameChangedAt, null);
});

test("availability explains invalid, taken, your own and free names", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const short = await profile(maya.id).usernameAvailable({ username: "a" });
  assert.equal(short.reason, "invalid");
  assert.equal(typeof short.message, "string");
  assert.equal((await profile(maya.id).usernameAvailable({ username: "has space" })).reason, "invalid");
  assert.equal((await profile(maya.id).usernameAvailable({ username: sam.username.toUpperCase() })).reason, "taken");
  assert.equal((await profile(maya.id).usernameAvailable({ username: maya.username })).reason, "yours");
  const free = await profile(maya.id).usernameAvailable({ username: `Free_${suffix()}` });
  assert.equal(free.available, true);
  assert.equal(free.username, free.username.toLowerCase());
});

test("a username changes once every 30 days, never to a taken name", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  await assert.rejects(profile(maya.id).changeUsername({ username: sam.username }), (error) => error.code === "CONFLICT");
  await assert.rejects(profile(maya.id).changeUsername({ username: maya.username }), (error) => error.code === "BAD_REQUEST");

  const next = `maya_${suffix()}`;
  const changed = await profile(maya.id).changeUsername({ username: next.toUpperCase() });
  assert.equal(changed.username, next);
  await assert.rejects(profile(maya.id).changeUsername({ username: `maya_${suffix()}` }), (error) => error.code === "FORBIDDEN");

  // 31 days later it is allowed again.
  await prisma.user.update({ where: { id: maya.id }, data: { usernameChangedAt: new Date(Date.now() - 31 * DAY) } });
  const again = `maya_${suffix()}`;
  assert.equal((await profile(maya.id).changeUsername({ username: again })).username, again);
});

test("two quick changes cannot both pass the cool-down", async () => {
  const maya = await user("Maya");
  const results = await Promise.allSettled([`a_${suffix()}`, `b_${suffix()}`].map((username) => profile(maya.id).changeUsername({ username })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
});

test("member lists show the new name at once", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await prisma.workspace.create({ data: { name: "Profile", slug: `prof-${suffix()}`, ownerId: maya.id } });
  await prisma.workspaceMember.createMany({ data: [{ workspaceId: ws.id, userId: maya.id, role: "OWNER" }, { workspaceId: ws.id, userId: sam.id, role: "MEMBER" }] });
  const members = () => workspaceRouter.createCaller(context(maya.id)).listMembers({ workspaceId: ws.id, take: 20 });
  await members(); // cached now
  const next = `samuel_${suffix()}`;
  await profile(sam.id).update({ name: "Samuel" });
  await profile(sam.id).changeUsername({ username: next });
  const row = (await members()).items.find((item) => (item.user?.id ?? item.userId) === sam.id);
  const shown = row.user ?? row;
  assert.equal(shown.name, "Samuel");
  assert.equal(shown.username, next);
});
