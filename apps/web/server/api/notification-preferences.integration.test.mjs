import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Notification preferences (settings PRD, FR-4 to FR-7) against a real
// database: kinds turned off, workspace levels including "only what involves
// me", levels going with the membership, and the hourly digest taking each
// member at their own hour and day.
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
const { planNotificationDeliveries } = jiti("../services/notification.service.ts");
const { runDigest, zoneClock } = jiti("../services/digest/digest.runner.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];

const context = (userId) => ({
  user: { id: userId }, requestId: `notif-prefs-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});
const prefs = (userId) => preferencesRouter.createCaller(context(userId));

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `np_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

async function team() {
  const people = await Promise.all(["Maya", "Sam", "Lee", "Kofi", "Ada"].map(user));
  const [maya] = people;
  const ws = await prisma.workspace.create({ data: { name: "Platform", slug: `np-${suffix()}`, ownerId: maya.id } });
  await prisma.workspaceMember.createMany({ data: people.map((p, i) => ({ workspaceId: ws.id, userId: p.id, role: i ? "MEMBER" : "OWNER" })) });
  return { ws, people };
}

const recipients = (deliveries) => new Map(deliveries.map((d) => [d.recipientUserId, d.type]));

test("kinds turned off and workspace levels filter who hears about a new discussion", async () => {
  const { ws, people: [maya, sam, lee, kofi, ada] } = await team();
  await prefs(sam.id).update({ mutedKinds: ["DISCUSSION_CREATED"] });
  await prefs(lee.id).setNotificationLevel({ workspaceId: ws.id, level: "INVOLVED" });
  await prefs(ada.id).setNotificationLevel({ workspaceId: ws.id, level: "NONE" });
  const d = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: maya.id, title: "Queues", body: `Thoughts @${lee.username} and @${ada.username}?` } });

  const heard = recipients(await planNotificationDeliveries({
    kind: "discussion_created", requestId: "r", actorUserId: maya.id, workspaceId: ws.id, discussionId: d.id, title: d.title, body: d.body,
  }));
  assert.equal(heard.has(sam.id), false); // turned new discussions off
  assert.equal(heard.get(lee.id), "MENTION"); // involved: a mention still reaches him
  assert.equal(heard.has(ada.id), false); // nothing from this workspace, even a mention
  assert.equal(heard.get(kofi.id), "DISCUSSION_CREATED");
});

test("only what involves me keeps replies to you and in discussions you started", async () => {
  const { ws, people: [maya, sam, lee, kofi] } = await team();
  const d = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: maya.id, title: "Logo", body: "A or B?" } });
  await prisma.discussionFollow.createMany({ data: [maya, sam, lee].map((p) => ({ workspaceId: ws.id, discussionId: d.id, userId: p.id })) });
  for (const p of [maya, sam, lee]) await prefs(p.id).setNotificationLevel({ workspaceId: ws.id, level: "INVOLVED" });
  const leesComment = await prisma.comment.create({ data: { discussionId: d.id, workspaceId: ws.id, authorId: lee.id, body: "B" } });

  const reply = (parentCommentId, body) => planNotificationDeliveries({
    kind: "comment_created", requestId: "r", actorUserId: kofi.id, workspaceId: ws.id, discussionId: d.id, commentId: `c${suffix()}`, body, parentCommentId,
  });
  const toLee = recipients(await reply(leesComment.id, "Agreed"));
  assert.deepEqual([...toLee.keys()].sort(), [lee.id, maya.id].sort()); // Lee: a reply to him; Maya: her discussion
  const topLevel = recipients(await reply(null, "Me too"));
  assert.deepEqual([...topLevel.keys()], [maya.id]);

  // Back to everything: Sam hears replies in discussions he follows again.
  await prefs(sam.id).setNotificationLevel({ workspaceId: ws.id, level: "ALL" });
  assert.equal(await prisma.workspaceNotificationLevel.count({ where: { workspaceId: ws.id, userId: sam.id } }), 0);
  assert.ok(recipients(await reply(null, "Again")).has(sam.id));
});

test("review and invite notifications follow kinds and levels too", async () => {
  const { ws, people: [maya, sam, lee] } = await team();
  await prefs(sam.id).update({ mutedKinds: ["REVIEW_REQUESTED"] });
  await prefs(lee.id).setNotificationLevel({ workspaceId: ws.id, level: "INVOLVED" });
  const heard = recipients(await planNotificationDeliveries({
    kind: "decision_review", requestId: "r", actorUserId: maya.id, workspaceId: ws.id, decisionId: `d${suffix()}`, question: "Q",
    type: "REVIEW_REQUESTED", recipientUserIds: [sam.id, lee.id], message: "Review", occurredAt: new Date().toISOString(),
  }));
  assert.deepEqual([...heard.keys()], [lee.id]);
});

test("levels list every workspace, refuse others, and leave with the membership", async () => {
  const { ws, people: [maya, sam] } = await team();
  const outsider = await user("Outsider");
  await prefs(sam.id).setNotificationLevel({ workspaceId: ws.id, level: "NONE" });
  assert.deepEqual(await prefs(sam.id).notificationLevels(), [{ workspaceId: ws.id, name: "Platform", level: "NONE" }]);
  await assert.rejects(prefs(outsider.id).setNotificationLevel({ workspaceId: ws.id, level: "NONE" }), (error) => error.code === "NOT_FOUND");
  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: ws.id, userId: sam.id } } });
  assert.equal(await prisma.workspaceNotificationLevel.count({ where: { userId: sam.id } }), 0);
  assert.equal(maya.id.length > 0, true);
});

test("the digest takes each member at their own hour, on their own calendar day", async () => {
  const { people: [maya, sam, lee] } = await team();
  await prefs(maya.id).update({ timeZone: "Asia/Tokyo", digestHour: 8 }); // UTC+9
  await prefs(lee.id).update({ timeZone: "UTC", digestHour: 6 });
  // sam never chose: 06:00 UTC.
  const only = [maya.id, sam.id, lee.id];
  const run = (now) => runDigest({ sender: null, delivery: "all", allowlist: [], deadline: Date.now() + 60_000, now, onlyUserIds: only });
  const days = async (userId) => (await prisma.digestDelivery.findMany({ where: { userId }, select: { digestDate: true } })).map((row) => row.digestDate.toISOString().slice(0, 10));

  // 23:30 UTC on 26 Nov is 08:30 on 27 Nov in Tokyo.
  await run(new Date("2026-11-26T23:30:00Z"));
  assert.deepEqual(await days(maya.id), ["2026-11-27"]);
  assert.deepEqual(await days(sam.id), []);
  // 06:10 UTC: Sam and Lee are due; Maya already had her day.
  await run(new Date("2026-11-27T06:10:00Z"));
  assert.deepEqual(await days(sam.id), ["2026-11-27"]);
  assert.deepEqual(await days(lee.id), ["2026-11-27"]);
  assert.deepEqual(await days(maya.id), ["2026-11-27"]);
  // An hour nobody chose: nobody.
  const quiet = await run(new Date("2026-11-27T13:00:00Z"));
  assert.equal(quiet.done, true);
  assert.deepEqual(zoneClock(new Date("2026-11-26T23:30:00Z"), "Asia/Tokyo"), { date: "2026-11-27", hour: 8 });
  await assert.rejects(prefs(maya.id).update({ timeZone: "Mars/Olympus" }), (error) => error.code === "BAD_REQUEST");
});
