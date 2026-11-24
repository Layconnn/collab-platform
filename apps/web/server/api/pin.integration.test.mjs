import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Pinned replies against a real database: who may pin, the three-pin limit
// under concurrency, idempotency, events, deletion and tenant isolation.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { pinRouter } = jiti("./routers/pin.router.ts");
const { excerpt } = jiti("../services/pin.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const caller = (user) => pinRouter.createCaller({
  user: { id: user.id }, requestId: `pin-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `pin_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}
async function workspace(owner, members) {
  const ws = await prisma.workspace.create({ data: { name: `WS ${suffix().slice(0, 6)}`, slug: `pin-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map(([member, role]) => ({ workspaceId: ws.id, userId: member.id, role })),
  ] });
  return ws;
}
const discussion = (ws, author) => prisma.discussion.create({ data: { workspaceId: ws.id, authorId: author.id, title: "Which queue?", body: "Body" } });
const reply = (ws, d, author, body = "Vercel Queues, because it costs nothing.") =>
  prisma.comment.create({ data: { workspaceId: ws.id, discussionId: d.id, authorId: author.id, body, depth: 0 } });

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => { assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`); return true; });
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("the discussion's author and managers pin; other members cannot", async () => {
  const [owner, sam, lee, ada] = await Promise.all([user("Olu"), user("Sam"), user("Lee"), user("Ada")]);
  const ws = await workspace(owner, [[sam, "MEMBER"], [lee, "MEMBER"], [ada, "ADMIN"]]);
  const d = await discussion(ws, sam);
  const r1 = await reply(ws, d, lee), r2 = await reply(ws, d, lee, "Second");

  await rejects(caller(lee).set({ workspaceId: ws.id, commentId: r1.id, pinned: true }), "FORBIDDEN");
  const bySam = await caller(sam).set({ workspaceId: ws.id, commentId: r1.id, pinned: true });
  assert.deepEqual(bySam.items.map((item) => [item.commentId, item.author, item.pinnedBy]), [[r1.id, "Lee", "Sam"]]);
  assert.equal(bySam.canPin, true);
  await caller(ada).set({ workspaceId: ws.id, commentId: r2.id, pinned: true });
  assert.equal((await caller(lee).list({ workspaceId: ws.id, discussionId: d.id })).canPin, false, "members see pins but cannot change them");
});

test("pins are idempotent, recorded, and limited to three even when requested at once", async () => {
  const [owner, sam] = await Promise.all([user("Olu"), user("Sam")]);
  const ws = await workspace(owner, [[sam, "MEMBER"]]);
  const d = await discussion(ws, sam);
  const replies = await Promise.all([1, 2, 3, 4, 5].map((n) => reply(ws, d, owner, `Reply ${n}`)));

  await caller(sam).set({ workspaceId: ws.id, commentId: replies[0].id, pinned: true });
  await caller(sam).set({ workspaceId: ws.id, commentId: replies[0].id, pinned: true });
  const results = await Promise.allSettled(replies.slice(1).map((r) => caller(owner).set({ workspaceId: ws.id, commentId: r.id, pinned: true })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "CONFLICT"));
  assert.equal(await prisma.comment.count({ where: { discussionId: d.id, pinnedAt: { not: null } } }), 3);

  await caller(sam).set({ workspaceId: ws.id, commentId: replies[0].id, pinned: false });
  await caller(sam).set({ workspaceId: ws.id, commentId: replies[0].id, pinned: false });
  const events = await prisma.activityEvent.findMany({ where: { workspaceId: ws.id, kind: { in: ["COMMENT_PINNED", "COMMENT_UNPINNED"] } } });
  assert.deepEqual(events.map((e) => e.kind).sort(), ["COMMENT_PINNED", "COMMENT_PINNED", "COMMENT_PINNED", "COMMENT_UNPINNED"].sort());
  assert.equal(events[0].summary.discussionId, d.id);
});

test("deleting a pinned reply removes its pin", async () => {
  const [owner] = await Promise.all([user("Olu")]);
  const ws = await workspace(owner, []);
  const d = await discussion(ws, owner);
  const r = await reply(ws, d, owner);
  await caller(owner).set({ workspaceId: ws.id, commentId: r.id, pinned: true });
  await prisma.comment.delete({ where: { id: r.id } });
  assert.deepEqual((await caller(owner).list({ workspaceId: ws.id, discussionId: d.id })).items, []);
});

test("pins stay inside their workspace", async () => {
  const [owner, outsider] = await Promise.all([user("Olu"), user("Out")]);
  const ws = await workspace(owner, []);
  const other = await workspace(outsider, []);
  const d = await discussion(ws, owner);
  const r = await reply(ws, d, owner);
  await rejects(caller(outsider).list({ workspaceId: ws.id, discussionId: d.id }), "NOT_FOUND");
  await rejects(caller(outsider).set({ workspaceId: ws.id, commentId: r.id, pinned: true }), "NOT_FOUND");
  await rejects(caller(outsider).set({ workspaceId: other.id, commentId: r.id, pinned: true }), "NOT_FOUND");
  await rejects(caller(outsider).list({ workspaceId: other.id, discussionId: d.id }), "NOT_FOUND");
});

test("excerpts read as plain text", () => {
  assert.equal(excerpt("**Use** [Vercel Queues](https://vercel.com) for `now`.\n\n```ts\nconst x = 1;\n```\n- cheap"), "Use Vercel Queues for now. [code] cheap");
  assert.equal(excerpt("x".repeat(200)).length, 160);
});
