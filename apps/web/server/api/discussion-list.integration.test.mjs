import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// The discussions list against a real database: what each row shows beyond
// its title (replies, the last reply, who took part, the decision it led to),
// read fresh even when the page itself comes from the cache.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { discussionRouter } = jiti("./routers/discussion.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

// An in-memory cache, so the second read is served from it.
const store = new Map();
redis.get = async (key) => store.get(key) ?? null;
redis.set = async (key, value) => { store.set(key, value); return "OK"; };
redis.setex = async (key, _ttl, value) => { store.set(key, value); return "OK"; };

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const HOUR = 60 * 60 * 1000;

function caller(userId) {
  return discussionRouter.createCaller({
    user: { id: userId }, requestId: `list-test-${suffix()}`, headers: new Headers(),
    requestMethod: "GET", ip: null, responseHeaders: new Headers(),
  });
}

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `list_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("rows carry replies, the last reply, other participants and the latest decision", async () => {
  const [maya, sam, lee, kofi, ada] = await Promise.all([user("Maya"), user("Sam"), user("Lee"), user("Kofi"), user("Ada")]);
  const ws = await prisma.workspace.create({ data: { name: "List", slug: `list-${suffix()}`, ownerId: maya.id } });
  await prisma.workspaceMember.createMany({ data: [maya, sam, lee, kofi, ada].map((u, i) => ({ workspaceId: ws.id, userId: u.id, role: i ? "MEMBER" : "OWNER" })) });
  const busy = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: maya.id, title: "Busy", body: "Body" } });
  const quiet = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: sam.id, title: "Quiet", body: "Body" } });
  const reply = (author, hoursAgo) => prisma.comment.create({ data: { discussionId: busy.id, workspaceId: ws.id, authorId: author.id, body: "Reply", createdAt: new Date(Date.now() - hoursAgo * HOUR) } });
  await reply(sam, 5);
  await reply(maya, 4); // the author is not listed as a participant
  await reply(lee, 3);
  await reply(sam, 2);
  await reply(kofi, 6);
  const latest = await reply(ada, 1);
  const decision = (status, hoursAgo, extra = {}) => prisma.decision.create({ data: {
    workspaceId: ws.id, sourceWorkspaceId: ws.id, sourceDiscussionId: busy.id, sourceDiscussionTitle: "Busy",
    createdById: maya.id, createdByLabel: "Maya", question: `Q ${status}`, status, idempotencyKey: suffix(),
    createdAt: new Date(Date.now() - hoursAgo * HOUR), ...extra,
  } });
  await decision("SUPERSEDED", 9);
  const current = await decision("DECIDED", 8);
  await decision("PROPOSED", 7, { deletedAt: new Date() }); // deleted decisions do not count

  const { items } = await caller(maya.id).listByWorkspace({ workspaceId: ws.id });
  const busyRow = items.find((item) => item.id === busy.id);
  assert.equal(busyRow.replies, 6);
  assert.equal(new Date(busyRow.lastReplyAt).getTime(), latest.createdAt.getTime());
  assert.deepEqual(busyRow.participants.map((p) => p.name), ["Ada", "Sam", "Lee"]);
  assert.deepEqual(busyRow.decision, { id: current.id, status: "DECIDED" });
  const quietRow = items.find((item) => item.id === quiet.id);
  assert.deepEqual([quietRow.replies, quietRow.lastReplyAt, quietRow.participants, quietRow.decision], [0, null, [], null]);

  // A new reply shows up even though the page itself is now cached.
  await prisma.comment.create({ data: { discussionId: quiet.id, workspaceId: ws.id, authorId: lee.id, body: "First" } });
  const again = await caller(maya.id).listByWorkspace({ workspaceId: ws.id });
  assert.equal(again.items.find((item) => item.id === quiet.id).replies, 1);
  assert.equal(typeof again.items[0].createdAt.getTime, "function");
});

test("outsiders cannot list a workspace's discussions", async () => {
  const [owner, outsider] = await Promise.all([user("Owner"), user("Outsider")]);
  const ws = await prisma.workspace.create({ data: { name: "Closed", slug: `closed-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: owner.id, role: "OWNER" } });
  await assert.rejects(caller(outsider.id).listByWorkspace({ workspaceId: ws.id }), (error) => ["FORBIDDEN", "NOT_FOUND"].includes(error.code));
});
