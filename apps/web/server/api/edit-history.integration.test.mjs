import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Edit history on messages (edit history PRD, #200) against a real database:
// each edit keeps the version it replaced, a save that changes nothing keeps
// nothing, concurrent edits number their versions in order, history is for
// members only, and deleting a message deletes its history.
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
const { commentRouter } = jiti("./routers/comment.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
const { notificationQueue } = jiti("../queue/notification.queue.ts");
notificationQueue.add = async (_name, _payload, options) => ({ id: options?.jobId });
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];

const context = (userId) => ({
  user: { id: userId }, requestId: `history-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});
const discussions = (userId) => discussionRouter.createCaller(context(userId));
const comments = (userId) => commentRouter.createCaller(context(userId));

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `hist_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

async function workspace(owner, members) {
  const ws = await prisma.workspace.create({ data: { name: "History", slug: `hist-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [owner, ...members].map((u, i) => ({ workspaceId: ws.id, userId: u.id, role: i ? "MEMBER" : "OWNER" })) });
  return ws;
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  await notificationQueue.close();
  redis.disconnect();
});

test("discussion edits keep each replaced version, by whoever made the edit", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: sam.id, title: "Which queue?", body: "First draft" } });

  const first = await discussions(sam.id).update({ discussionId: discussion.id, title: "Which queue for jobs?" });
  assert.equal(first.editCount, 1);
  // Saving the same text again is not an edit.
  const same = await discussions(sam.id).update({ discussionId: discussion.id, title: "Which queue for jobs?", body: "First draft" });
  assert.equal(same.editCount, 1);
  // A manager's edit is recorded under the manager's name.
  await discussions(maya.id).update({ discussionId: discussion.id, body: "Second draft" });

  const history = await discussions(sam.id).history({ discussionId: discussion.id });
  assert.equal(history.total, 3);
  assert.deepEqual(
    history.versions.map((v) => [v.version, v.current, v.title, v.body, v.byLabel]),
    [
      [3, true, "Which queue for jobs?", "Second draft", "Maya"],
      [2, false, "Which queue for jobs?", "First draft", "Sam"],
      [1, false, "Which queue?", "First draft", "Sam"],
    ],
  );
  assert.equal(new Date(history.versions[2].at).getTime(), discussion.createdAt.getTime());

  const fresh = await discussions(sam.id).getById({ discussionId: discussion.id });
  assert.equal(fresh.editCount, 2);
});

test("reply edits keep their history, and deleting the reply deletes it", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: maya.id, title: "Favicon", body: "Body" } });
  const reply = await prisma.comment.create({ data: { discussionId: discussion.id, workspaceId: ws.id, authorId: sam.id, body: "B is fine, but only if we drop the favicon" } });
  // Pinning moves updatedAt but is not an edit (FR-3).
  await prisma.comment.update({ where: { id: reply.id }, data: { pinnedAt: new Date(), pinnedById: maya.id } });

  const unchanged = await comments(sam.id).getById({ commentId: reply.id });
  assert.equal(unchanged.editCount, 0);

  const edited = await comments(sam.id).update({ commentId: reply.id, body: "B is fine" });
  assert.equal(edited.editCount, 1);
  const history = await comments(maya.id).history({ commentId: reply.id });
  assert.deepEqual(history.versions.map((v) => [v.version, v.body, v.byLabel, "title" in v]), [
    [2, "B is fine", "Sam", false],
    [1, "B is fine, but only if we drop the favicon", "Sam", false],
  ]);

  await comments(sam.id).remove({ commentId: reply.id });
  assert.equal(await prisma.commentRevision.count({ where: { commentId: reply.id } }), 0);
});

test("concurrent edits number their versions in order", async () => {
  const [maya] = await Promise.all([user("Maya")]);
  const ws = await workspace(maya, []);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: maya.id, title: "Race", body: "Zero" } });
  await Promise.all(["One", "Two", "Three"].map((body) => discussions(maya.id).update({ discussionId: discussion.id, body })));
  const revisions = await prisma.discussionRevision.findMany({ where: { discussionId: discussion.id }, orderBy: { version: "asc" } });
  assert.deepEqual(revisions.map((r) => r.version), [1, 2, 3]);
  assert.equal(revisions[0].body, "Zero");
  const row = await prisma.discussion.findUniqueOrThrow({ where: { id: discussion.id } });
  assert.equal(row.editCount, 3);
  // Every replaced version is a distinct earlier body.
  assert.equal(new Set([...revisions.map((r) => r.body), row.body]).size, 4);
});

test("history is for members of the workspace only", async () => {
  const [maya, outsider] = await Promise.all([user("Maya"), user("Outsider")]);
  const ws = await workspace(maya, []);
  await workspace(outsider, []);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: maya.id, title: "Private", body: "Body" } });
  const reply = await prisma.comment.create({ data: { discussionId: discussion.id, workspaceId: ws.id, authorId: maya.id, body: "Reply" } });

  await assert.rejects(discussions(outsider.id).history({ discussionId: discussion.id }), (error) => error.code === "FORBIDDEN");
  await assert.rejects(comments(outsider.id).history({ commentId: reply.id }), (error) => error.code === "NOT_FOUND");

  // Deleting the discussion deletes its history and its replies' history.
  await discussions(maya.id).update({ discussionId: discussion.id, body: "Edited" });
  await comments(maya.id).update({ commentId: reply.id, body: "Edited reply" });
  await discussions(maya.id).remove({ discussionId: discussion.id });
  assert.equal(await prisma.discussionRevision.count({ where: { discussionId: discussion.id } }), 0);
  assert.equal(await prisma.commentRevision.count({ where: { discussionId: discussion.id } }), 0);
});
