import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Reactions against a real database: idempotent toggles, one query per
// discussion, tenant isolation, cascades and the database's own checks.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { reactionRouter } = jiti("./routers/reaction.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const caller = (user) => reactionRouter.createCaller({
  user: { id: user.id }, requestId: `reaction-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `react_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}
async function workspace(owner, members) {
  const ws = await prisma.workspace.create({ data: { name: `WS ${suffix().slice(0, 6)}`, slug: `react-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map((member) => ({ workspaceId: ws.id, userId: member.id, role: "MEMBER" })),
  ] });
  return ws;
}
const discussion = (ws, author) => prisma.discussion.create({ data: { workspaceId: ws.id, authorId: author.id, title: "Which queue?", body: "Body" } });
const comment = (ws, d, author) => prisma.comment.create({ data: { workspaceId: ws.id, discussionId: d.id, authorId: author.id, body: "Reply", depth: 0 } });

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => { assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`); return true; });
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("reacting is idempotent and shows counts, the viewer's own and who reacted", async () => {
  const [maya, sam, lee] = await Promise.all([user("Maya"), user("Sam"), user("Lee")]);
  const ws = await workspace(maya, [sam, lee]);
  const d = await discussion(ws, maya);

  await caller(sam).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👍", active: true });
  await caller(sam).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👍", active: true });
  await caller(lee).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👍", active: true });
  const result = await caller(maya).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👀", active: true });
  assert.deepEqual(result.reactions.map((r) => [r.emoji, r.count, r.mine]), [["👍", 2, false], ["👀", 1, true]]);
  assert.deepEqual(result.reactions[0].people.sort(), ["Lee", "Sam"]);

  const asSam = await caller(sam).forDiscussion({ workspaceId: ws.id, discussionId: d.id });
  assert.deepEqual(asSam.discussion[0].people[0], "You", "the viewer comes first, as You");
  assert.equal(asSam.discussion[0].mine, true);

  await caller(sam).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👍", active: false });
  await caller(sam).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👍", active: false });
  assert.equal(await prisma.reaction.count({ where: { discussionId: d.id, emoji: "👍" } }), 1);
});

test("one request returns reactions for the discussion and every reply", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const d = await discussion(ws, maya);
  const [first, second] = [await comment(ws, d, sam), await comment(ws, d, maya)];
  const nested = await prisma.comment.create({ data: { workspaceId: ws.id, discussionId: d.id, authorId: sam.id, body: "Nested", depth: 1, parentCommentId: first.id } });
  await caller(maya).set({ workspaceId: ws.id, commentId: first.id, emoji: "🎉", active: true });
  await caller(sam).set({ workspaceId: ws.id, commentId: nested.id, emoji: "✅", active: true });
  await caller(sam).set({ workspaceId: ws.id, discussionId: d.id, emoji: "❤️", active: true });

  const all = await caller(maya).forDiscussion({ workspaceId: ws.id, discussionId: d.id });
  assert.deepEqual(all.discussion.map((r) => r.emoji), ["❤️"]);
  assert.deepEqual(Object.keys(all.comments).sort(), [first.id, nested.id].sort());
  assert.equal(all.comments[second.id], undefined);
  assert.deepEqual(all.comments[nested.id].map((r) => [r.emoji, r.mine]), [["✅", false]]);
});

test("reactions stay inside their workspace", async () => {
  const [maya, sam, outsider] = await Promise.all([user("Maya"), user("Sam"), user("Out")]);
  const ws = await workspace(maya, [sam]);
  const other = await workspace(outsider, []);
  const d = await discussion(ws, maya);
  const c = await comment(ws, d, sam);
  await caller(sam).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👍", active: true });

  await rejects(caller(outsider).forDiscussion({ workspaceId: ws.id, discussionId: d.id }), "NOT_FOUND");
  await rejects(caller(outsider).set({ workspaceId: ws.id, discussionId: d.id, emoji: "👍", active: true }), "NOT_FOUND");
  // A member of another workspace cannot reach this discussion or reply through their own workspace id.
  await rejects(caller(outsider).set({ workspaceId: other.id, discussionId: d.id, emoji: "👍", active: true }), "NOT_FOUND");
  await rejects(caller(outsider).set({ workspaceId: other.id, commentId: c.id, emoji: "👍", active: true }), "NOT_FOUND");
  await rejects(caller(outsider).forDiscussion({ workspaceId: other.id, discussionId: d.id }), "NOT_FOUND");
  assert.equal(await prisma.reaction.count({ where: { discussionId: d.id } }), 1);
});

test("only the eight emoji, and one target per reaction", async () => {
  const [maya] = await Promise.all([user("Maya")]);
  const ws = await workspace(maya, []);
  const d = await discussion(ws, maya);
  const c = await comment(ws, d, maya);
  await assert.rejects(caller(maya).set({ workspaceId: ws.id, discussionId: d.id, emoji: "💩", active: true }));
  await assert.rejects(caller(maya).set({ workspaceId: ws.id, discussionId: d.id, commentId: c.id, emoji: "👍", active: true }));
  await assert.rejects(prisma.reaction.create({ data: { workspaceId: ws.id, discussionId: d.id, userId: maya.id, emoji: "💩" } }), "the database refuses other emoji");
  await assert.rejects(prisma.reaction.create({ data: { workspaceId: ws.id, discussionId: d.id, commentId: c.id, userId: maya.id, emoji: "👍" } }), "the database refuses two targets");
});

test("reactions go with their reply or discussion", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const d = await discussion(ws, maya);
  const c = await comment(ws, d, sam);
  await caller(maya).set({ workspaceId: ws.id, commentId: c.id, emoji: "🚀", active: true });
  await caller(sam).set({ workspaceId: ws.id, discussionId: d.id, emoji: "🤔", active: true });
  await prisma.comment.delete({ where: { id: c.id } });
  assert.equal(await prisma.reaction.count({ where: { commentId: c.id } }), 0);
  await prisma.discussion.delete({ where: { id: d.id } });
  assert.equal(await prisma.reaction.count({ where: { discussionId: d.id } }), 0);
});
