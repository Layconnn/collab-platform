import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import createJiti from "jiti";

// Search against a real database with the real indexes: ranking, tenant
// isolation, filters, highlighting and pagination.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { searchRouter } = jiti("./routers/search.router.ts");
const { HIGHLIGHT_START, HIGHLIGHT_END } = jiti("../services/search.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
// A word unique to this run, so results never include other suites' data.
const tag = `zq${suffix().slice(0, 10)}`;
const createdUserIds = [];
const f = {};

function caller(userId) {
  return searchRouter.createCaller({
    user: { id: userId }, requestId: `search-test-${suffix()}`, headers: new Headers(),
    requestMethod: "GET", ip: null, responseHeaders: new Headers(),
  });
}
const search = (userId, input) => caller(userId).query({ ...input, query: input.query.replaceAll("TAG", tag) });

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `search_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

before(async () => {
  [f.owner, f.member, f.outsider] = await Promise.all([user("Owner"), user("Member"), user("Outsider")]);
  f.ws = await prisma.workspace.create({ data: { name: "Platform", slug: `search-${suffix()}`, ownerId: f.owner.id } });
  f.other = await prisma.workspace.create({ data: { name: "Secret", slug: `secret-${suffix()}`, ownerId: f.outsider.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: f.ws.id, userId: f.owner.id, role: "OWNER" },
    { workspaceId: f.ws.id, userId: f.member.id, role: "MEMBER" },
    { workspaceId: f.other.id, userId: f.outsider.id, role: "OWNER" },
  ] });
  f.discussion = await prisma.discussion.create({ data: {
    workspaceId: f.ws.id, authorId: f.member.id, title: `${tag} worker queue choice`, body: "We keep losing notifications when the worker sleeps.",
  } });
  f.comment = await prisma.comment.create({ data: {
    workspaceId: f.ws.id, discussionId: f.discussion.id, authorId: f.owner.id, body: `Vercel queues avoid the ${tag} worker entirely.`,
  } });
  f.decision = await prisma.decision.create({ data: {
    workspaceId: f.ws.id, sourceWorkspaceId: f.ws.id, sourceDiscussionId: f.discussion.id, sourceDiscussionTitle: f.discussion.title,
    createdById: f.owner.id, createdByLabel: "Owner", question: `Use Vercel Queues for the ${tag} worker`,
    outcome: "Publish one job per event.", rationale: "Free on our plan.", status: "DECIDED", idempotencyKey: suffix(),
  } });
  f.deleted = await prisma.decision.create({ data: {
    workspaceId: f.ws.id, createdByLabel: "Owner", sourceDiscussionTitle: "x", question: `Deleted ${tag} worker plan`,
    idempotencyKey: suffix(), deletedAt: new Date(),
  } });
  f.secret = await prisma.discussion.create({ data: {
    workspaceId: f.other.id, authorId: f.outsider.id, title: `${tag} worker secret roadmap`, body: "Not for Platform.",
  } });
});

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("finds decisions, discussions and comments, decisions first", async () => {
  const { items } = await search(f.member.id, { query: "TAG worker" });
  assert.deepEqual(items.map((i) => [i.type, i.id]), [["DECISION", f.decision.id], ["DISCUSSION", f.discussion.id], ["COMMENT", f.comment.id]]);
  const comment = items.find((i) => i.type === "COMMENT");
  assert.equal(comment.title, f.discussion.title);
  assert.equal(comment.discussionId, f.discussion.id);
  assert.equal(comment.author, "Owner");
  assert.deepEqual(items[0].workspace, { id: f.ws.id, name: "Platform" });
  assert.equal(items[0].status, "DECIDED");
});

test("never returns another workspace's content, even when asked for it", async () => {
  const mine = await search(f.member.id, { query: "TAG secret" });
  assert.equal(mine.items.length, 0);
  const named = await search(f.member.id, { query: "TAG", workspaceId: f.other.id });
  assert.equal(named.items.length, 0);
  const theirs = await search(f.outsider.id, { query: "TAG" });
  assert.deepEqual(theirs.items.map((i) => i.id), [f.secret.id]);
});

test("soft-deleted decisions stay out of results", async () => {
  const { items } = await search(f.owner.id, { query: "TAG plan" });
  assert.equal(items.some((i) => i.id === f.deleted.id), false);
});

test("prefixes, phrases and exclusions", async () => {
  const prefix = await search(f.member.id, { query: "TAG work" });
  assert.ok(prefix.items.some((i) => i.id === f.decision.id), "work matches worker");
  const phrase = await search(f.member.id, { query: 'TAG "vercel queues"' });
  assert.deepEqual(phrase.items.map((i) => i.type).sort(), ["COMMENT", "DECISION"]);
  const excluded = await search(f.member.id, { query: "TAG worker -vercel" });
  assert.deepEqual(excluded.items.map((i) => i.id), [f.discussion.id]);
});

test("filters by type, status, author and date", async () => {
  const ids = async (input) => (await search(f.member.id, { query: "TAG worker", ...input })).items.map((i) => i.id);
  assert.deepEqual(await ids({ types: ["COMMENT"] }), [f.comment.id]);
  assert.deepEqual(await ids({ status: "DECIDED" }), [f.decision.id]);
  assert.deepEqual(await ids({ status: "PROPOSED" }), []);
  assert.deepEqual(await ids({ authorId: f.member.id }), [f.discussion.id]);
  assert.deepEqual(await ids({ updatedAfter: new Date(Date.now() + 60_000) }), []);
  assert.deepEqual(await ids({ workspaceId: f.ws.id, types: ["DISCUSSION", "DECISION"] }), [f.decision.id, f.discussion.id]);
});

test("snippets mark the matched words", async () => {
  const { items } = await search(f.member.id, { query: "TAG notifications" });
  const discussion = items.find((i) => i.id === f.discussion.id);
  assert.ok(discussion.snippet.includes(`${HIGHLIGHT_START}notifications${HIGHLIGHT_END}`), discussion.snippet);
  assert.ok(discussion.snippet.replaceAll(HIGHLIGHT_START, "").replaceAll(HIGHLIGHT_END, "").length <= 161);
});

test("pagination returns every result once", async () => {
  const first = await search(f.member.id, { query: "TAG worker", take: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  const second = await search(f.member.id, { query: "TAG worker", take: 2, cursor: first.nextCursor });
  const all = [...first.items, ...second.items].map((i) => i.id);
  assert.deepEqual(all, [f.decision.id, f.discussion.id, f.comment.id]);
  assert.equal(second.nextCursor, null);
});

test("short, empty and hostile queries return nothing without errors", async () => {
  for (const query of ["", " ", "a", "-TAG", "&|!:*", "')); DROP TABLE \"Discussion\"; --"]) {
    const { items } = await search(f.member.id, { query });
    assert.deepEqual(items, [], `query ${query}`);
  }
  assert.ok((await prisma.discussion.count({ where: { id: f.discussion.id } })) === 1, "the table is still there");
});

test("search uses the full-text indexes", async () => {
  await prisma.$executeRawUnsafe("SET enable_seqscan = off");
  const plan = await prisma.$queryRawUnsafe(`EXPLAIN SELECT id FROM "Discussion" d WHERE d."searchVector" @@ to_tsquery('simple', 'worker')`);
  await prisma.$executeRawUnsafe("SET enable_seqscan = on");
  assert.match(plan.map((row) => row["QUERY PLAN"]).join("\n"), /Discussion_searchVector_idx/);
});
