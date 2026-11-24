import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Saved items against a real database: idempotent saves, privacy, leaving a
// workspace, deleted subjects, pagination and tenant isolation.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { savedRouter } = jiti("./routers/saved.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const caller = (user) => savedRouter.createCaller({
  user: { id: user.id }, requestId: `saved-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `sv_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}
async function workspace(owner, members, name = `WS ${suffix().slice(0, 6)}`) {
  const ws = await prisma.workspace.create({ data: { name, slug: `saved-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map((member) => ({ workspaceId: ws.id, userId: member.id, role: "MEMBER" })),
  ] });
  return ws;
}
const discussion = (ws, author, title = "Which queue?") => prisma.discussion.create({ data: { workspaceId: ws.id, authorId: author.id, title, body: "**Vercel Queues** or BullMQ?" } });
const reply = (ws, d, author) => prisma.comment.create({ data: { workspaceId: ws.id, discussionId: d.id, authorId: author.id, body: "Vercel Queues.", depth: 0 } });
const decision = (ws, author, question = "Use Vercel Queues") => prisma.decision.create({ data: {
  workspaceId: ws.id, createdById: author.id, createdByLabel: author.name, question, sourceDiscussionTitle: "Source", idempotencyKey: suffix(),
} });

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => { assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`); return true; });
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("saving is idempotent, private, and lists newest first across workspaces", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const platform = await workspace(maya, [sam], "Platform");
  const marketing = await workspace(maya, [], "Marketing");
  const d = await discussion(platform, sam);
  const r = await reply(platform, d, sam);
  const dec = await decision(marketing, maya);

  await caller(maya).set({ workspaceId: platform.id, discussionId: d.id, saved: true });
  await caller(maya).set({ workspaceId: platform.id, discussionId: d.id, saved: true });
  await caller(maya).set({ workspaceId: platform.id, commentId: r.id, saved: true });
  const ids = await caller(maya).set({ workspaceId: marketing.id, decisionId: dec.id, saved: true });
  assert.deepEqual(ids, { discussionIds: [], commentIds: [], decisionIds: [dec.id] }, "ids are per workspace");
  assert.deepEqual(await caller(maya).idsInWorkspace({ workspaceId: platform.id }), { discussionIds: [d.id], commentIds: [r.id], decisionIds: [] });

  const list = await caller(maya).list({ take: 20 });
  assert.deepEqual(list.items.map((item) => [item.type, item.workspace.name]), [["DECISION", "Marketing"], ["REPLY", "Platform"], ["DISCUSSION", "Platform"]]);
  assert.equal(list.items[1].href, `/workspace/${platform.id}/discussions/${d.id}#comment-${r.id}`);
  assert.equal(list.items[2].excerpt, "Vercel Queues or BullMQ?", "excerpts drop Markdown syntax");
  assert.deepEqual(list.items[0].target, { decisionId: dec.id });
  assert.equal((await caller(sam).list({ take: 20 })).items.length, 0, "saved items are private");

  await caller(maya).set({ workspaceId: platform.id, discussionId: d.id, saved: false });
  await caller(maya).set({ workspaceId: platform.id, discussionId: d.id, saved: false });
  assert.equal((await caller(maya).list({ take: 20 })).items.length, 2);
});

test("leaving a workspace hides its saved items, and deleted subjects disappear", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(sam, [maya]);
  const d = await discussion(ws, sam);
  const r = await reply(ws, d, sam);
  const dec = await decision(ws, sam);
  await caller(maya).set({ workspaceId: ws.id, commentId: r.id, saved: true });
  await caller(maya).set({ workspaceId: ws.id, decisionId: dec.id, saved: true });

  await prisma.decision.update({ where: { id: dec.id }, data: { deletedAt: new Date() } });
  assert.deepEqual((await caller(maya).list({ take: 20 })).items.map((item) => item.type), ["REPLY"], "deleted decisions are hidden");
  await prisma.comment.delete({ where: { id: r.id } });
  assert.equal(await prisma.savedItem.count({ where: { commentId: r.id } }), 0, "deleted replies take their saved items");

  await caller(maya).set({ workspaceId: ws.id, discussionId: d.id, saved: true });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId: maya.id } });
  assert.equal((await caller(maya).list({ take: 20 })).items.length, 0, "items from a workspace she left are hidden");
  await rejects(caller(maya).idsInWorkspace({ workspaceId: ws.id }), "NOT_FOUND");
});

test("saved items stay inside their workspace", async () => {
  const [maya, outsider] = await Promise.all([user("Maya"), user("Out")]);
  const ws = await workspace(maya, []);
  const other = await workspace(outsider, []);
  const d = await discussion(ws, maya);
  const dec = await decision(ws, maya);
  await rejects(caller(outsider).set({ workspaceId: ws.id, discussionId: d.id, saved: true }), "NOT_FOUND");
  await rejects(caller(outsider).set({ workspaceId: other.id, discussionId: d.id, saved: true }), "NOT_FOUND");
  await rejects(caller(outsider).set({ workspaceId: other.id, decisionId: dec.id, saved: true }), "NOT_FOUND");
  await assert.rejects(prisma.savedItem.create({ data: { userId: outsider.id, workspaceId: other.id, decisionId: dec.id } }), "the database refuses a decision from another workspace");
  await assert.rejects(prisma.savedItem.create({ data: { userId: maya.id, workspaceId: ws.id, discussionId: d.id, decisionId: dec.id } }), "the database refuses two targets");
  await assert.rejects(caller(maya).set({ workspaceId: ws.id, saved: true }));
});

test("the Saved list pages without repeats", async () => {
  const [maya] = await Promise.all([user("Maya")]);
  const ws = await workspace(maya, []);
  const discussions = [];
  for (let n = 0; n < 5; n += 1) discussions.push(await discussion(ws, maya, `Topic ${n}`));
  for (const d of discussions) await caller(maya).set({ workspaceId: ws.id, discussionId: d.id, saved: true });
  const first = await caller(maya).list({ take: 2 });
  const second = await caller(maya).list({ take: 2, cursor: first.nextCursor });
  const third = await caller(maya).list({ take: 2, cursor: second.nextCursor });
  const titles = [...first.items, ...second.items, ...third.items].map((item) => item.title);
  assert.deepEqual(titles, ["Topic 4", "Topic 3", "Topic 2", "Topic 1", "Topic 0"]);
  assert.equal(third.nextCursor, null);
});
