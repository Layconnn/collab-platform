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
const { createMemoryStorage, setStorageForTests } = jiti("../services/files/storage.ts");
const storage = createMemoryStorage();
setStorageForTests(storage);
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
  setStorageForTests(undefined);
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

// A tiny WebP header and a JPEG header, enough for the type check.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

test("a photo is checked before it is used, and replacing it deletes the old one", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const first = await profile(maya.id).photoUpload({ contentType: "image/webp", size: WEBP.length });
  assert.match(first.key, new RegExp(`^avatars/${maya.id}/[a-f0-9]{32}\.webp$`));

  // Not uploaded yet.
  await assert.rejects(profile(maya.id).setPhoto({ key: first.key }), (error) => error.code === "BAD_REQUEST");
  // Someone else's key.
  const theirs = await profile(sam.id).photoUpload({ contentType: "image/webp", size: WEBP.length });
  storage.put(theirs.key, WEBP, "image/webp");
  await assert.rejects(profile(maya.id).setPhoto({ key: theirs.key }), (error) => error.code === "FORBIDDEN");
  // Not really an image: rejected and removed from storage.
  storage.put(first.key, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "image/webp");
  await assert.rejects(profile(maya.id).setPhoto({ key: first.key }), (error) => error.code === "BAD_REQUEST");
  assert.equal(storage.objects.has(first.key), false);

  const good = await profile(maya.id).photoUpload({ contentType: "image/webp", size: WEBP.length });
  storage.put(good.key, WEBP, "image/webp");
  await profile(maya.id).setPhoto({ key: good.key });
  assert.equal((await authRouter.createCaller(context(maya.id)).me()).avatarKey, good.key);

  // Safari sends JPEG; the new photo replaces the old, which is deleted.
  const jpeg = await profile(maya.id).photoUpload({ contentType: "image/jpeg", size: JPEG.length });
  assert.ok(jpeg.key.endsWith(".jpg"));
  storage.put(jpeg.key, JPEG, "image/jpeg");
  await profile(maya.id).setPhoto({ key: jpeg.key });
  assert.equal(storage.objects.has(good.key), false);

  await profile(maya.id).removePhoto();
  assert.equal((await authRouter.createCaller(context(maya.id)).me()).avatarKey, null);
  assert.equal(storage.objects.has(jpeg.key), false);
});

test("member lists carry the photo", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await prisma.workspace.create({ data: { name: "Photos", slug: `photo-${suffix()}`, ownerId: maya.id } });
  await prisma.workspaceMember.createMany({ data: [{ workspaceId: ws.id, userId: maya.id, role: "OWNER" }, { workspaceId: ws.id, userId: sam.id, role: "MEMBER" }] });
  const members = () => workspaceRouter.createCaller(context(maya.id)).listMembers({ workspaceId: ws.id, take: 20 });
  await members();
  const upload = await profile(sam.id).photoUpload({ contentType: "image/webp", size: WEBP.length });
  storage.put(upload.key, WEBP, "image/webp");
  await profile(sam.id).setPhoto({ key: upload.key });
  assert.equal((await members()).items.find((item) => item.userId === sam.id).user.avatarKey, upload.key);
});

