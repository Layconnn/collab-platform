import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import createJiti from "jiti";

const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-123456789";

// Load Prisma's runtime with Node's own loader. jiti marks built-ins such as
// node:path as ES modules without a real default export, and Prisma's bundled
// interop then reads path.default.sep as undefined while formatting errors.
const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { decisionRouter } = jiti("./routers/decision.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "");
const key = () => randomUUID();
const createdUserIds = [];

function caller(userId) {
  return decisionRouter.createCaller({
    user: { id: userId },
    requestId: `decision-test-${suffix()}`,
    headers: new Headers(),
    requestMethod: "POST",
    ip: null,
    responseHeaders: new Headers(),
  });
}

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `decision_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}

async function fixture() {
  const [owner, admin, author, other, outsider] = await Promise.all([
    user("Owner"), user("Admin"), user("Author"), user("Other"), user("Outsider"),
  ]);
  const workspace = await prisma.workspace.create({
    data: { name: "Decision integration", slug: `decision-${suffix()}`, ownerId: owner.id },
  });
  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspace.id, userId: owner.id, role: "OWNER" },
      { workspaceId: workspace.id, userId: admin.id, role: "ADMIN" },
      { workspaceId: workspace.id, userId: author.id, role: "MEMBER" },
      { workspaceId: workspace.id, userId: other.id, role: "MEMBER" },
    ],
  });
  const discussion = await prisma.discussion.create({
    data: { workspaceId: workspace.id, authorId: owner.id, title: "Original context", body: "A meaningful technical question" },
  });
  return { owner, admin, author, other, outsider, workspace, discussion };
}

function proposal(f, overrides = {}) {
  return {
    workspaceId: f.workspace.id,
    sourceDiscussionId: f.discussion.id,
    question: "Which storage should we use?",
    outcome: "Use PostgreSQL",
    rationale: "Transactions and constraints fit the workflow",
    alternatives: "A separate document store",
    followUp: "Measure query latency",
    idempotencyKey: key(),
    ...overrides,
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function finalized(f, question, actorId = f.owner.id) {
  const created = await caller(f.author.id).create(proposal(f, { question }));
  return caller(actorId).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: created.version });
}

function supersession(f, old, replacement, overrides = {}) {
  return {
    workspaceId: f.workspace.id, oldDecisionId: old.id, replacementDecisionId: replacement.id,
    expectedOldVersion: old.version, expectedReplacementVersion: replacement.version,
    reason: "Requirements changed after deployment.", ...overrides,
  };
}

function supersedeInProcess(userId, input) {
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, [fileURLToPath(new URL("./decision.supersession.worker.mjs", import.meta.url)), userId, JSON.stringify(input)], {
      env: { ...process.env, DECISION_TEST_DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = ""; let errors = "";
    worker.stdout.setEncoding("utf8"); worker.stderr.setEncoding("utf8");
    worker.stdout.on("data", (chunk) => { output += chunk; });
    worker.stderr.on("data", (chunk) => { errors += chunk; });
    worker.on("error", reject);
    worker.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`Worker exited ${code}: ${errors}`)));
  });
}

after(async () => {
  for (const id of createdUserIds.reverse()) {
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
  redis.disconnect();
});

test("roles, author permissions, revisions, and finalized immutability", async () => {
  const f = await fixture();
  const created = await caller(f.author.id).create(proposal(f));
  assert.equal(created.status, "PROPOSED");
  assert.equal(created.version, 1);
  assert.equal(created.createdByLabel, "Author");
  assert.equal((await caller(f.owner.id).getById({ workspaceId: f.workspace.id, decisionId: created.id })).id, created.id);
  assert.equal((await caller(f.admin.id).listByWorkspace({ workspaceId: f.workspace.id })).items.length, 1);
  assert.equal((await caller(f.other.id).getById({ workspaceId: f.workspace.id, decisionId: created.id })).id, created.id);
  await expectCode(caller(f.outsider.id).getById({ workspaceId: f.workspace.id, decisionId: created.id }), "NOT_FOUND");
  await expectCode(caller(f.outsider.id).listByWorkspace({ workspaceId: f.workspace.id }), "NOT_FOUND");
  await expectCode(caller(f.other.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 1, question: "Changed" }), "FORBIDDEN");
  await expectCode(caller(f.author.id).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 1 }), "FORBIDDEN");
  const edited = await caller(f.author.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 1, alternatives: null });
  assert.equal(edited.version, 2);
  assert.equal(edited.alternatives, null);
  const managerEdit = await caller(f.admin.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 2, rationale: "Verified transaction behavior" });
  assert.equal(managerEdit.version, 3);
  const finalized = await caller(f.owner.id).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 3 });
  assert.equal(finalized.status, "DECIDED");
  assert.equal(finalized.version, 4);
  assert.ok(finalized.decidedAt);
  await expectCode(caller(f.owner.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 4, outcome: "Change history" }), "CONFLICT");
  await expectCode(caller(f.owner.id).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 4 }), "CONFLICT");
  const history = await caller(f.other.id).revisions({ workspaceId: f.workspace.id, decisionId: created.id });
  assert.deepEqual(history.items.map((r) => [r.version, r.action, r.actorLabel]), [
    [1, "CREATE", "Author"], [2, "EDIT", "Author"], [3, "EDIT", "Admin"], [4, "FINALIZE", "Owner"],
  ]);
  assert.equal(history.items[0].rationale, "Transactions and constraints fit the workflow");
  assert.equal(history.items[3].rationale, "Verified transaction behavior");
  assert.equal(history.nextCursor, null);
  assert.equal((await caller(f.owner.id).create(proposal(f))).status, "PROPOSED");
  assert.equal((await caller(f.admin.id).create(proposal(f))).status, "PROPOSED");
});

test("idempotent retries survive source deletion and reject changed content", async () => {
  const f = await fixture();
  const input = proposal(f, { question: "  Which storage?  " });
  const first = await caller(f.author.id).create(input);
  const beforeDelete = await caller(f.author.id).create({ ...input, question: "Which storage?" });
  assert.equal(beforeDelete.id, first.id);
  await prisma.discussion.delete({ where: { id: f.discussion.id } });
  const afterDelete = await caller(f.author.id).create(input);
  assert.equal(afterDelete.id, first.id);
  assert.equal(afterDelete.sourceDiscussionId, null);
  assert.equal(afterDelete.sourceDiscussionTitle, "Original context");
  await expectCode(caller(f.author.id).create({ ...input, outcome: "Use SQLite" }), "CONFLICT");
  const anotherSource = await prisma.discussion.create({
    data: { workspaceId: f.workspace.id, authorId: f.owner.id, title: "Different source", body: "Other context" },
  });
  await expectCode(caller(f.author.id).create({ ...input, sourceDiscussionId: anotherSource.id }), "CONFLICT");
  assert.equal(await prisma.decision.count({ where: { workspaceId: f.workspace.id } }), 1);
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: first.id } }), 1);
  const finalized = await caller(f.admin.id).finalize({ workspaceId: f.workspace.id, decisionId: first.id, expectedVersion: 1 });
  assert.equal(finalized.status, "DECIDED");
  assert.equal(finalized.sourceDiscussionId, null);
  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: f.workspace.id, userId: f.author.id } } });
  await expectCode(caller(f.author.id).getById({ workspaceId: f.workspace.id, decisionId: first.id }), "NOT_FOUND");
  await expectCode(caller(f.author.id).revisions({ workspaceId: f.workspace.id, decisionId: first.id }), "NOT_FOUND");
  await expectCode(caller(f.author.id).listByWorkspace({ workspaceId: f.workspace.id }), "NOT_FOUND");
  await expectCode(caller(f.author.id).edit({ workspaceId: f.workspace.id, decisionId: first.id, expectedVersion: 2, question: "Revoked" }), "NOT_FOUND");
  await expectCode(caller(f.author.id).finalize({ workspaceId: f.workspace.id, decisionId: first.id, expectedVersion: 2 }), "NOT_FOUND");
  await expectCode(caller(f.author.id).create(input), "NOT_FOUND");
});

test("cross-workspace IDs do not reveal decisions or discussions", async () => {
  const first = await fixture();
  const second = await fixture();
  const created = await caller(first.author.id).create(proposal(first));
  await expectCode(caller(first.author.id).create(proposal(first, { sourceDiscussionId: second.discussion.id })), "NOT_FOUND");
  const substituted = { workspaceId: second.workspace.id, decisionId: created.id };
  await expectCode(caller(second.owner.id).getById(substituted), "NOT_FOUND");
  await expectCode(caller(second.owner.id).revisions(substituted), "NOT_FOUND");
  await expectCode(caller(second.owner.id).edit({ ...substituted, expectedVersion: 1, question: "Wrong tenant" }), "NOT_FOUND");
  await expectCode(caller(second.owner.id).finalize({ ...substituted, expectedVersion: 1 }), "NOT_FOUND");
  await expectCode(caller(first.outsider.id).getById({ workspaceId: first.workspace.id, decisionId: created.id }), "NOT_FOUND");
});

test("concurrent creation commits one decision and one initial revision", async () => {
  const f = await fixture();
  const input = proposal(f);
  const [a, b] = await Promise.all([caller(f.author.id).create(input), caller(f.author.id).create(input)]);
  assert.equal(a.id, b.id);
  assert.equal(await prisma.decision.count({ where: { workspaceId: f.workspace.id } }), 1);
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: a.id } }), 1);
  const different = proposal(f);
  const results = await Promise.allSettled([
    caller(f.author.id).create(different),
    caller(f.author.id).create({ ...different, question: "Different question" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.code === "CONFLICT").length, 1);
});

test("creation keys are isolated by actor and workspace", async () => {
  const first = await fixture();
  const second = await fixture();
  await prisma.workspaceMember.create({
    data: { workspaceId: second.workspace.id, userId: first.author.id, role: "MEMBER" },
  });
  const sharedKey = key();
  const a = await caller(first.author.id).create(proposal(first, { idempotencyKey: sharedKey }));
  const b = await caller(first.other.id).create(proposal(first, { idempotencyKey: sharedKey }));
  const c = await caller(first.author.id).create(proposal(second, { idempotencyKey: sharedKey }));
  assert.equal(new Set([a.id, b.id, c.id]).size, 3);
  assert.equal(b.createdById, first.other.id);
  assert.equal(c.workspaceId, second.workspace.id);
});

test("concurrent edits and finalizations reject stale versions without extra revisions", async () => {
  const f = await fixture();
  const created = await caller(f.author.id).create(proposal(f));
  const edit = (question) => caller(f.author.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 1, question });
  const edits = await Promise.allSettled([edit("First edit"), edit("Second edit")]);
  assert.equal(edits.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(edits.filter((r) => r.status === "rejected" && r.reason.code === "CONFLICT").length, 1);
  await expectCode(edit("Stale edit"), "CONFLICT");
  const finalize = () => caller(f.admin.id).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 2 });
  const finalizations = await Promise.allSettled([finalize(), finalize()]);
  assert.equal(finalizations.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(finalizations.filter((r) => r.status === "rejected" && r.reason.code === "CONFLICT").length, 1);
  const history = await caller(f.owner.id).revisions({ workspaceId: f.workspace.id, decisionId: created.id });
  assert.deepEqual(history.items.map((r) => r.action), ["CREATE", "EDIT", "FINALIZE"]);
  assert.deepEqual(history.items.map((r) => r.version), [1, 2, 3]);
  assert.equal((await prisma.decision.findUnique({ where: { id: created.id } })).version, 3);
  const another = await caller(f.author.id).create(proposal(f));
  const mixed = await Promise.allSettled([
    caller(f.author.id).edit({ workspaceId: f.workspace.id, decisionId: another.id, expectedVersion: 1, question: "Competing edit" }),
    caller(f.owner.id).finalize({ workspaceId: f.workspace.id, decisionId: another.id, expectedVersion: 1 }),
  ]);
  assert.equal(mixed.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(mixed.filter((r) => r.status === "rejected" && r.reason.code === "CONFLICT").length, 1);
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: another.id } }), 2);
});

test("deleted authors retain attribution snapshots and managers can finish proposals", async () => {
  const f = await fixture();
  const created = await caller(f.author.id).create(proposal(f));
  await prisma.user.delete({ where: { id: f.author.id } });
  const detail = await caller(f.owner.id).getById({ workspaceId: f.workspace.id, decisionId: created.id });
  assert.equal(detail.createdById, null);
  assert.equal(detail.createdByLabel, "Author");
  const edited = await caller(f.admin.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 1, question: "Preserved question" });
  assert.equal(edited.version, 2);
  await caller(f.owner.id).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 2 });
  const history = await caller(f.owner.id).revisions({ workspaceId: f.workspace.id, decisionId: created.id });
  assert.equal(history.items[0].actorUserId, null);
  assert.equal(history.items[0].actorLabel, "Author");
});

test("list and revision pagination are bounded, stable, and filtered", async () => {
  const f = await fixture();
  const created = [];
  for (let i = 0; i < 4; i++) created.push(await caller(f.author.id).create(proposal(f, { question: `Question ${i}` })));
  await caller(f.owner.id).finalize({ workspaceId: f.workspace.id, decisionId: created[0].id, expectedVersion: 1 });
  const first = await caller(f.owner.id).listByWorkspace({ workspaceId: f.workspace.id, take: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  const inserted = await caller(f.author.id).create(proposal(f, { question: "Inserted after first page" }));
  const second = await caller(f.owner.id).listByWorkspace({ workspaceId: f.workspace.id, take: 2, cursor: first.nextCursor });
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((d) => d.id)).size, 4);
  assert.equal([...first.items, ...second.items].some((d) => d.id === inserted.id), false);
  const filtered = await caller(f.owner.id).listByWorkspace({ workspaceId: f.workspace.id, status: "DECIDED" });
  assert.deepEqual(filtered.items.map((d) => d.id), [created[0].id]);
  const page = await caller(f.owner.id).revisions({ workspaceId: f.workspace.id, decisionId: created[0].id, take: 1 });
  assert.equal(page.items[0].version, 1);
  assert.equal(page.nextCursor, 1);
  const finalPage = await caller(f.owner.id).revisions({ workspaceId: f.workspace.id, decisionId: created[0].id, take: 1, cursor: page.nextCursor });
  assert.equal(finalPage.items[0].version, 2);
  assert.equal(finalPage.nextCursor, null);
});

test("validation and service errors retain safe tRPC codes", async () => {
  const f = await fixture();
  await expectCode(caller(f.author.id).create(proposal(f, { question: " " })), "BAD_REQUEST");
  await expectCode(caller(f.author.id).listByWorkspace({ workspaceId: f.workspace.id, take: 101 }), "BAD_REQUEST");
  const created = await caller(f.author.id).create(proposal(f, { outcome: undefined, rationale: undefined }));
  await expectCode(caller(f.owner.id).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 1 }), "BAD_REQUEST");
  await expectCode(caller(f.owner.id).finalize({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 2 }), "CONFLICT");
  await expectCode(caller(f.author.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 1 }), "BAD_REQUEST");
  await expectCode(caller(f.author.id).edit({ workspaceId: f.workspace.id, decisionId: created.id, expectedVersion: 2, question: "Stale" }), "CONFLICT");
});

test("owners and admins can form an immutable A to B to C chain with revision snapshots", async () => {
  const f = await fixture();
  const a = await finalized(f, "First choice");
  const b = await finalized(f, "Second choice");
  const c = await finalized(f, "Third choice");
  await caller(f.owner.id).supersede(supersession(f, a, b));
  const bAfter = await caller(f.other.id).getById({ workspaceId: f.workspace.id, decisionId: b.id });
  assert.equal(bAfter.previousDecision.id, a.id);
  assert.equal(bAfter.status, "DECIDED");
  assert.equal(bAfter.version, b.version + 1);
  await caller(f.admin.id).supersede(supersession(f, bAfter, c, { reason: "A further change was approved." }));
  const [old, middle, current] = await Promise.all([a.id, b.id, c.id].map((decisionId) => caller(f.other.id).getById({ workspaceId: f.workspace.id, decisionId })));
  assert.equal(old.status, "SUPERSEDED");
  assert.equal(middle.status, "SUPERSEDED");
  assert.equal(current.status, "DECIDED");
  assert.equal(old.replacementDecision.id, b.id);
  assert.equal(middle.replacementDecision.id, c.id);
  assert.equal(current.previousDecision.id, b.id);
  assert.equal(old.supersession.authorizedByLabel, "Owner");
  assert.equal(middle.supersession.authorizedByLabel, "Admin");
  assert.equal(old.outcome, a.outcome);
  assert.equal(old.rationale, a.rationale);
  assert.equal(middle.outcome, b.outcome);
  assert.equal(middle.rationale, b.rationale);
  const supersededList = await caller(f.other.id).listByWorkspace({ workspaceId: f.workspace.id, status: "SUPERSEDED" });
  const currentList = await caller(f.other.id).listByWorkspace({ workspaceId: f.workspace.id, status: "DECIDED" });
  assert.deepEqual(new Set(supersededList.items.map((item) => item.id)), new Set([a.id, b.id]));
  assert.deepEqual(currentList.items.map((item) => item.id), [c.id]);
  const history = await caller(f.other.id).replacementHistory({ workspaceId: f.workspace.id, decisionId: b.id });
  assert.deepEqual(history.items.map((item) => item.id), [a.id, b.id, c.id]);
  assert.equal(history.effectiveDecisionId, c.id);
  assert.equal(history.truncated, false);
  const oldRevisions = await caller(f.other.id).revisions({ workspaceId: f.workspace.id, decisionId: a.id });
  const currentRevisions = await caller(f.other.id).revisions({ workspaceId: f.workspace.id, decisionId: c.id });
  assert.deepEqual(oldRevisions.items.map((item) => item.action), ["CREATE", "FINALIZE", "SUPERSEDE"]);
  assert.equal(oldRevisions.items[2].status, "SUPERSEDED");
  assert.equal(oldRevisions.items[2].outcome, a.outcome);
  assert.equal(currentRevisions.items[2].action, "SUPERSEDE");
  assert.equal(currentRevisions.items[2].status, "DECIDED");
});

test("supersession rejects unauthorized, inaccessible and invalid pairs without partial writes", async () => {
  const f = await fixture();
  const other = await fixture();
  const a = await finalized(f, "First choice");
  const b = await finalized(f, "Second choice");
  const draft = await caller(f.author.id).create(proposal(f, { question: "Still a proposal" }));
  const foreign = await finalized(other, "Other tenant choice");
  const valid = supersession(f, a, b);
  await expectCode(caller(f.author.id).supersede(valid), "FORBIDDEN");
  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: f.workspace.id, userId: f.admin.id } } });
  await expectCode(caller(f.admin.id).supersede(valid), "NOT_FOUND");
  await expectCode(caller(f.owner.id).supersede({ ...valid, replacementDecisionId: foreign.id }), "NOT_FOUND");
  await expectCode(caller(other.owner.id).supersede({ ...valid, workspaceId: other.workspace.id }), "NOT_FOUND");
  await expectCode(caller(f.owner.id).replacementHistory({ workspaceId: f.workspace.id, decisionId: foreign.id }), "NOT_FOUND");
  await expectCode(caller(f.owner.id).supersede(supersession(f, draft, b)), "CONFLICT");
  await expectCode(caller(f.owner.id).supersede(supersession(f, a, draft)), "CONFLICT");
  await expectCode(caller(f.owner.id).supersede(supersession(f, a, a)), "BAD_REQUEST");
  await expectCode(caller(f.owner.id).supersede(supersession(f, a, b, { reason: " " })), "BAD_REQUEST");
  await expectCode(caller(f.owner.id).supersede(supersession(f, a, b, { reason: "Too short" })), "BAD_REQUEST");
  assert.equal(await prisma.decisionSupersession.count({ where: { workspaceId: f.workspace.id } }), 0);
  assert.equal((await prisma.decision.findUnique({ where: { id: a.id } })).status, "DECIDED");
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: a.id } }), 2);
});

test("linear links reject duplicate successors, predecessors, cycles and stale versions", async () => {
  const f = await fixture();
  const a = await finalized(f, "First"); const b = await finalized(f, "Second"); const c = await finalized(f, "Third"); const d = await finalized(f, "Fourth");
  await expectCode(caller(f.owner.id).supersede(supersession(f, a, b, { expectedOldVersion: 1 })), "CONFLICT");
  await caller(f.owner.id).supersede(supersession(f, a, b));
  await expectCode(caller(f.owner.id).supersede(supersession(f, a, c, { expectedOldVersion: a.version + 1 })), "CONFLICT");
  await expectCode(caller(f.owner.id).supersede(supersession(f, c, b, { expectedReplacementVersion: b.version + 1 })), "CONFLICT");
  await expectCode(caller(f.owner.id).supersede(supersession(f, b, a, { expectedOldVersion: b.version + 1, expectedReplacementVersion: a.version + 1 })), "CONFLICT");
  await caller(f.owner.id).supersede(supersession(f, c, d));
  await expectCode(caller(f.owner.id).supersede(supersession(f, b, c, { expectedOldVersion: b.version + 1, expectedReplacementVersion: c.version + 1 })), "CONFLICT");
  assert.equal(await prisma.decisionSupersession.count({ where: { workspaceId: f.workspace.id } }), 2);
});

test("concurrent managers create at most one successor and preserve atomic revisions", async () => {
  const f = await fixture();
  const a = await finalized(f, "First"); const b = await finalized(f, "Second"); const c = await finalized(f, "Third");
  const results = await Promise.allSettled([
    caller(f.owner.id).supersede(supersession(f, a, b)),
    caller(f.admin.id).supersede(supersession(f, a, c)),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.code === "CONFLICT").length, 1);
  assert.equal(await prisma.decisionSupersession.count({ where: { workspaceId: f.workspace.id } }), 1);
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: a.id } }), 3);
  const loser = results[0].status === "fulfilled" ? c : b;
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: loser.id } }), 2);
  assert.equal((await prisma.decision.findUnique({ where: { id: loser.id } })).version, 2);
});

test("separate server processes cannot create competing successors", async () => {
  const f = await fixture();
  const a = await finalized(f, "Process race source"); const b = await finalized(f, "Process race first"); const c = await finalized(f, "Process race second");
  const outcomes = await Promise.all([
    supersedeInProcess(f.owner.id, supersession(f, a, b)),
    supersedeInProcess(f.admin.id, supersession(f, a, c)),
  ]);
  assert.deepEqual(outcomes.sort(), ["CONFLICT", "OK"]);
  assert.equal(await prisma.decisionSupersession.count({ where: { workspaceId: f.workspace.id } }), 1);
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: a.id } }), 3);
});

test("candidate selection is bounded, manager-only and hides linked or foreign decisions", async () => {
  const f = await fixture(); const other = await fixture();
  const a = await finalized(f, "First"); const b = await finalized(f, "Second"); const c = await finalized(f, "Third");
  const foreign = await finalized(other, "Foreign");
  await expectCode(caller(f.author.id).replacementCandidates({ workspaceId: f.workspace.id, oldDecisionId: a.id }), "FORBIDDEN");
  await expectCode(caller(f.owner.id).replacementCandidates({ workspaceId: f.workspace.id, oldDecisionId: foreign.id }), "NOT_FOUND");
  const page = await caller(f.owner.id).replacementCandidates({ workspaceId: f.workspace.id, oldDecisionId: a.id, take: 1 });
  assert.equal(page.items.length, 1); assert.ok(page.nextCursor);
  await caller(f.owner.id).supersede(supersession(f, a, b));
  const remaining = await caller(f.owner.id).replacementCandidates({ workspaceId: f.workspace.id, oldDecisionId: c.id });
  assert.equal(remaining.items.some((item) => [a.id, b.id, foreign.id].includes(item.id)), false);
});

test("replacement history is capped and does not expose inaccessible workspace chains", async () => {
  const f = await fixture();
  const chain = [];
  for (let i = 0; i < 21; i++) chain.push(await finalized(f, `Choice ${i}`));
  let previous = chain[0];
  for (const next of chain.slice(1)) {
    await caller(f.owner.id).supersede(supersession(f, previous, next));
    previous = { ...next, version: next.version + 1 };
  }
  const history = await caller(f.other.id).replacementHistory({ workspaceId: f.workspace.id, decisionId: chain[0].id });
  assert.equal(history.items.length, 20);
  assert.equal(history.truncated, true);
  assert.equal(history.effectiveDecisionId, null);
  await prisma.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: f.workspace.id, userId: f.other.id } } });
  await expectCode(caller(f.other.id).replacementHistory({ workspaceId: f.workspace.id, decisionId: chain[0].id }), "NOT_FOUND");
});

test("authorizer deletion preserves attribution and workspace deletion removes actual service-created chains", async () => {
  const f = await fixture();
  const a = await finalized(f, "Original"); const b = await finalized(f, "Replacement");
  await caller(f.admin.id).supersede(supersession(f, a, b));
  await prisma.user.delete({ where: { id: f.admin.id } });
  const link = await prisma.decisionSupersession.findUnique({ where: { workspaceId_previousDecisionId: { workspaceId: f.workspace.id, previousDecisionId: a.id } } });
  assert.equal(link.authorizedById, null);
  assert.equal(link.authorizedByLabel, "Admin");
  const revisions = await caller(f.owner.id).revisions({ workspaceId: f.workspace.id, decisionId: a.id });
  assert.equal(revisions.items[2].actorUserId, null);
  assert.equal(revisions.items[2].actorLabel, "Admin");
  await prisma.workspace.delete({ where: { id: f.workspace.id } });
  assert.equal(await prisma.decision.count({ where: { workspaceId: f.workspace.id } }), 0);
  assert.equal(await prisma.decisionRevision.count({ where: { decisionId: a.id } }), 0);
  assert.equal(await prisma.decisionSupersession.count({ where: { workspaceId: f.workspace.id } }), 0);
});
