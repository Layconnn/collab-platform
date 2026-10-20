import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import pg from "pg";

const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}

const target = new URL(databaseUrl);
if (!target.pathname.endsWith("_decision_test")) {
  throw new Error("Decision schema tests refuse databases without a _decision_test suffix.");
}

const { Client } = pg;
const id = () => randomUUID();

async function inRollback(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    // Force deferred foreign-key checks before the fixture transaction rolls back.
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}

async function expectConstraint(client, sql, values, code) {
  await client.query("SAVEPOINT expected_constraint");
  try {
    await assert.rejects((async () => {
      await client.query(sql, values);
      // Deferred foreign keys reject at transaction end unless checked here.
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    })(), (error) => error.code === code);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_constraint");
    await client.query("RELEASE SAVEPOINT expected_constraint");
  }
}

async function user(client, label) {
  const userId = id();
  await client.query(
    'INSERT INTO "User" ("id", "email", "username", "name", "updatedAt") VALUES ($1, $2, $3, $4, now())',
    [userId, `${userId}@example.test`, `u_${userId.replaceAll("-", "")}`, label],
  );
  return userId;
}

async function workspace(client, ownerId) {
  const workspaceId = id();
  await client.query(
    'INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "updatedAt") VALUES ($1, $2, $3, $4, now())',
    [workspaceId, "Decision test", `decision-${workspaceId}`, ownerId],
  );
  return workspaceId;
}

async function discussion(client, workspaceId, authorId, title = "Original discussion") {
  const discussionId = id();
  await client.query(
    'INSERT INTO "Discussion" ("id", "workspaceId", "authorId", "title", "body", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
    [discussionId, workspaceId, authorId, title, "Context and trade-offs"],
  );
  return discussionId;
}

async function decision(client, { workspaceId, discussionId, creatorId, status = "PROPOSED", title = "Original discussion" }) {
  const decisionId = id();
  await client.query(
    `INSERT INTO "Decision" (
      "id", "workspaceId", "sourceWorkspaceId", "sourceDiscussionId", "sourceDiscussionTitle",
      "createdById", "createdByLabel", "question", "outcome", "rationale", "status",
      "idempotencyKey", "decidedAt", "updatedAt"
    ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
    [decisionId, workspaceId, discussionId, title, creatorId, "Original author", "Which approach?", "Use the simpler design", "Lower risk", status, id(), status === "PROPOSED" ? null : new Date()],
  );
  return decisionId;
}

async function revision(client, decisionId, version, actorUserId, status = "PROPOSED") {
  await client.query(
    `INSERT INTO "DecisionRevision" (
      "id", "decisionId", "version", "action", "actorUserId", "actorLabel",
      "question", "outcome", "rationale", "status"
    ) VALUES ($1, $2, $3, 'CREATE', $4, 'Original author', 'Which approach?', 'Use the simpler design', 'Lower risk', $5)`,
    [id(), decisionId, version, actorUserId, status],
  );
}

async function supersession(client, workspaceId, previousDecisionId, replacementDecisionId, authorizerId) {
  await client.query(
    `INSERT INTO "DecisionSupersession" (
      "id", "workspaceId", "previousDecisionId", "replacementDecisionId",
      "reason", "authorizedById", "authorizedByLabel"
    ) VALUES ($1, $2, $3, $4, 'New evidence', $5, 'Original author')`,
    [id(), workspaceId, previousDecisionId, replacementDecisionId, authorizerId],
  );
}

test("deleting a source preserves proposed and finalized decisions with title snapshots", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const workspaceId = await workspace(client, ownerId);
  const discussionId = await discussion(client, workspaceId, ownerId);
  const proposedId = await decision(client, { workspaceId, discussionId, creatorId: ownerId });
  const decidedId = await decision(client, { workspaceId, discussionId, creatorId: ownerId, status: "DECIDED" });
  await revision(client, proposedId, 1, ownerId);
  await revision(client, decidedId, 1, ownerId, "DECIDED");

  await client.query('DELETE FROM "Discussion" WHERE "id" = $1', [discussionId]);
  const rows = await client.query(
    'SELECT "id", "status", "sourceWorkspaceId", "sourceDiscussionId", "sourceDiscussionTitle", "question", "outcome", "rationale" FROM "Decision" WHERE "id" IN ($1, $2)',
    [proposedId, decidedId],
  );
  assert.equal(rows.rowCount, 2);
  for (const row of rows.rows) {
    assert.equal(row.sourceWorkspaceId, null);
    assert.equal(row.sourceDiscussionId, null);
    assert.equal(row.sourceDiscussionTitle, "Original discussion");
    assert.equal(row.question, "Which approach?");
    assert.equal(row.outcome, "Use the simpler design");
    assert.equal(row.rationale, "Lower risk");
  }
  assert.deepEqual(new Set(rows.rows.map((row) => row.status)), new Set(["PROPOSED", "DECIDED"]));
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "DecisionRevision" WHERE "decisionId" IN ($1, $2)', [proposedId, decidedId])).rows[0].count, 2);
}));

test("source constraints reject cross-workspace and half-detached references", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const first = await workspace(client, ownerId);
  const second = await workspace(client, ownerId);
  const discussionId = await discussion(client, first, ownerId);
  const decisionId = await decision(client, { workspaceId: first, discussionId, creatorId: ownerId });

  await expectConstraint(client,
    `INSERT INTO "Decision" ("id", "workspaceId", "sourceWorkspaceId", "sourceDiscussionId", "sourceDiscussionTitle", "createdByLabel", "question", "idempotencyKey", "updatedAt") VALUES ($1, $2, $3, $4, 'Title', 'Owner', 'Question', $5, now())`,
    [id(), second, first, discussionId, id()], "23514");
  await expectConstraint(client,
    'UPDATE "Decision" SET "workspaceId" = $1 WHERE "id" = $2', [second, decisionId], "23514");
  await expectConstraint(client,
    'UPDATE "Decision" SET "sourceWorkspaceId" = NULL WHERE "id" = $1', [decisionId], "23514");
  await expectConstraint(client,
    'UPDATE "Decision" SET "sourceDiscussionId" = $1 WHERE "id" = $2', [id(), decisionId], "23503");
}));

test("supersession constraints enforce tenant scope, distinct decisions, and a linear chain", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const first = await workspace(client, ownerId);
  const second = await workspace(client, ownerId);
  const firstDiscussion = await discussion(client, first, ownerId);
  const secondDiscussion = await discussion(client, second, ownerId);
  const a = await decision(client, { workspaceId: first, discussionId: firstDiscussion, creatorId: ownerId, status: "DECIDED" });
  const b = await decision(client, { workspaceId: first, discussionId: firstDiscussion, creatorId: ownerId, status: "DECIDED" });
  const c = await decision(client, { workspaceId: first, discussionId: firstDiscussion, creatorId: ownerId, status: "DECIDED" });
  const foreign = await decision(client, { workspaceId: second, discussionId: secondDiscussion, creatorId: ownerId, status: "DECIDED" });

  await expectConstraint(client,
    `INSERT INTO "DecisionSupersession" ("id", "workspaceId", "previousDecisionId", "replacementDecisionId", "reason", "authorizedByLabel") VALUES ($1, $2, $3, $4, 'Reason', 'Owner')`,
    [id(), first, a, foreign], "23503");
  await expectConstraint(client,
    `INSERT INTO "DecisionSupersession" ("id", "workspaceId", "previousDecisionId", "replacementDecisionId", "reason", "authorizedByLabel") VALUES ($1, $2, $3, $3, 'Reason', 'Owner')`,
    [id(), first, a], "23514");
  await supersession(client, first, a, b, ownerId);
  await expectConstraint(client,
    `INSERT INTO "DecisionSupersession" ("id", "workspaceId", "previousDecisionId", "replacementDecisionId", "reason", "authorizedByLabel") VALUES ($1, $2, $3, $4, 'Reason', 'Owner')`,
    [id(), first, a, c], "23505");
  await expectConstraint(client,
    `INSERT INTO "DecisionSupersession" ("id", "workspaceId", "previousDecisionId", "replacementDecisionId", "reason", "authorizedByLabel") VALUES ($1, $2, $3, $4, 'Reason', 'Owner')`,
    [id(), first, c, b], "23505");
  await supersession(client, first, b, c, ownerId);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "DecisionSupersession" WHERE "workspaceId" = $1', [first])).rows[0].count, 2);
}));

test("revision versions and create idempotency keys are unique", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const workspaceId = await workspace(client, ownerId);
  const discussionId = await discussion(client, workspaceId, ownerId);
  const decisionId = await decision(client, { workspaceId, discussionId, creatorId: ownerId });
  await revision(client, decisionId, 1, ownerId);
  await expectConstraint(client,
    `INSERT INTO "DecisionRevision" ("id", "decisionId", "version", "action", "actorLabel", "question", "status") VALUES ($1, $2, 1, 'EDIT', 'Owner', 'Question', 'PROPOSED')`,
    [id(), decisionId], "23505");
  const key = (await client.query('SELECT "idempotencyKey" FROM "Decision" WHERE "id" = $1', [decisionId])).rows[0].idempotencyKey;
  await expectConstraint(client,
    `INSERT INTO "Decision" ("id", "workspaceId", "sourceDiscussionTitle", "createdByLabel", "question", "idempotencyKey", "updatedAt") VALUES ($1, $2, 'Title', 'Owner', 'Question', $3, now())`,
    [id(), workspaceId, key], "23505");
}));

test("workspace deletion removes decisions, revisions, and an A to B to C chain", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const workspaceId = await workspace(client, ownerId);
  const discussionId = await discussion(client, workspaceId, ownerId);
  const a = await decision(client, { workspaceId, discussionId, creatorId: ownerId, status: "SUPERSEDED" });
  const b = await decision(client, { workspaceId, discussionId, creatorId: ownerId, status: "SUPERSEDED" });
  const c = await decision(client, { workspaceId, discussionId, creatorId: ownerId, status: "DECIDED" });
  for (const decisionId of [a, b, c]) await revision(client, decisionId, 1, ownerId, "DECIDED");
  await supersession(client, workspaceId, a, b, ownerId);
  await supersession(client, workspaceId, b, c, ownerId);

  await client.query('DELETE FROM "Workspace" WHERE "id" = $1', [workspaceId]);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "Decision" WHERE "id" IN ($1, $2, $3)', [a, b, c])).rows[0].count, 0);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "DecisionRevision" WHERE "decisionId" IN ($1, $2, $3)', [a, b, c])).rows[0].count, 0);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "DecisionSupersession" WHERE "workspaceId" = $1', [workspaceId])).rows[0].count, 0);
}));

test("deleting a nonowner user detaches source and actor IDs but preserves historical labels", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const actorId = await user(client, "Author to remove");
  const workspaceId = await workspace(client, ownerId);
  const discussionId = await discussion(client, workspaceId, actorId);
  const a = await decision(client, { workspaceId, discussionId, creatorId: actorId, status: "SUPERSEDED" });
  const b = await decision(client, { workspaceId, discussionId, creatorId: actorId, status: "DECIDED" });
  await revision(client, a, 1, actorId, "DECIDED");
  await supersession(client, workspaceId, a, b, actorId);

  await client.query('DELETE FROM "User" WHERE "id" = $1', [actorId]);
  const remaining = (await client.query('SELECT "createdById", "createdByLabel", "sourceDiscussionId", "sourceDiscussionTitle" FROM "Decision" WHERE "id" = $1', [a])).rows[0];
  assert.equal(remaining.createdById, null);
  assert.equal(remaining.createdByLabel, "Original author");
  assert.equal(remaining.sourceDiscussionId, null);
  assert.equal(remaining.sourceDiscussionTitle, "Original discussion");
  const history = (await client.query('SELECT "actorUserId", "actorLabel" FROM "DecisionRevision" WHERE "decisionId" = $1', [a])).rows[0];
  assert.equal(history.actorUserId, null);
  assert.equal(history.actorLabel, "Original author");
  const link = (await client.query('SELECT "authorizedById", "authorizedByLabel" FROM "DecisionSupersession" WHERE "previousDecisionId" = $1', [a])).rows[0];
  assert.equal(link.authorizedById, null);
  assert.equal(link.authorizedByLabel, "Original author");
}));

test("removing an ordinary workspace membership does not erase its decision history", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const memberId = await user(client, "Member");
  const workspaceId = await workspace(client, ownerId);
  await client.query(
    'INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "updatedAt") VALUES ($1, $2, $3, now())',
    [id(), workspaceId, memberId],
  );
  const discussionId = await discussion(client, workspaceId, memberId);
  const decisionId = await decision(client, { workspaceId, discussionId, creatorId: memberId });
  await revision(client, decisionId, 1, memberId);

  await client.query('DELETE FROM "WorkspaceMember" WHERE "workspaceId" = $1 AND "userId" = $2', [workspaceId, memberId]);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "Decision" WHERE "id" = $1', [decisionId])).rows[0].count, 1);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "DecisionRevision" WHERE "decisionId" = $1', [decisionId])).rows[0].count, 1);
}));

test("deleting only a revision actor nulls its user reference and retains the revision", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner");
  const actorId = await user(client, "Revision actor");
  const workspaceId = await workspace(client, ownerId);
  const discussionId = await discussion(client, workspaceId, ownerId);
  const decisionId = await decision(client, { workspaceId, discussionId, creatorId: ownerId });
  await revision(client, decisionId, 1, actorId);

  await client.query('DELETE FROM "User" WHERE "id" = $1', [actorId]);
  const remaining = (await client.query('SELECT "actorUserId", "actorLabel" FROM "DecisionRevision" WHERE "decisionId" = $1', [decisionId])).rows[0];
  assert.equal(remaining.actorUserId, null);
  assert.equal(remaining.actorLabel, "Original author");
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "Decision" WHERE "id" = $1', [decisionId])).rows[0].count, 1);
}));

test("deleting a workspace owner cascades through the owned workspace and decision history", async () => inRollback(async (client) => {
  const ownerId = await user(client, "Owner to remove");
  const workspaceId = await workspace(client, ownerId);
  const discussionId = await discussion(client, workspaceId, ownerId);
  const decisionId = await decision(client, { workspaceId, discussionId, creatorId: ownerId, status: "DECIDED" });
  await revision(client, decisionId, 1, ownerId, "DECIDED");

  await client.query('DELETE FROM "User" WHERE "id" = $1', [ownerId]);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "Workspace" WHERE "id" = $1', [workspaceId])).rows[0].count, 0);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "Decision" WHERE "id" = $1', [decisionId])).rows[0].count, 0);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "DecisionRevision" WHERE "decisionId" = $1', [decisionId])).rows[0].count, 0);
}));

test("owner deletion removes an owned replacement chain and preserves another workspace", async () => inRollback(async (client) => {
  const departingOwnerId = await user(client, "Departing owner");
  const survivingOwnerId = await user(client, "Surviving owner");
  const ownedWorkspaceId = await workspace(client, departingOwnerId);
  const survivingWorkspaceId = await workspace(client, survivingOwnerId);
  const ownedDiscussionId = await discussion(client, ownedWorkspaceId, departingOwnerId);
  const survivingDiscussionId = await discussion(client, survivingWorkspaceId, departingOwnerId);
  const a = await decision(client, { workspaceId: ownedWorkspaceId, discussionId: ownedDiscussionId, creatorId: departingOwnerId, status: "SUPERSEDED" });
  const b = await decision(client, { workspaceId: ownedWorkspaceId, discussionId: ownedDiscussionId, creatorId: departingOwnerId, status: "SUPERSEDED" });
  const c = await decision(client, { workspaceId: ownedWorkspaceId, discussionId: ownedDiscussionId, creatorId: departingOwnerId, status: "DECIDED" });
  const survivingDecisionId = await decision(client, { workspaceId: survivingWorkspaceId, discussionId: survivingDiscussionId, creatorId: departingOwnerId, status: "DECIDED" });
  for (const decisionId of [a, b, c, survivingDecisionId]) await revision(client, decisionId, 1, departingOwnerId, "DECIDED");
  await supersession(client, ownedWorkspaceId, a, b, departingOwnerId);
  await supersession(client, ownedWorkspaceId, b, c, departingOwnerId);

  await client.query('DELETE FROM "User" WHERE "id" = $1', [departingOwnerId]);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "Workspace" WHERE "id" = $1', [ownedWorkspaceId])).rows[0].count, 0);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "Decision" WHERE "workspaceId" = $1', [ownedWorkspaceId])).rows[0].count, 0);
  assert.equal((await client.query('SELECT count(*)::int AS count FROM "DecisionSupersession" WHERE "workspaceId" = $1', [ownedWorkspaceId])).rows[0].count, 0);
  const surviving = (await client.query('SELECT "createdById", "createdByLabel", "sourceDiscussionId", "sourceDiscussionTitle" FROM "Decision" WHERE "id" = $1', [survivingDecisionId])).rows[0];
  assert.equal(surviving.createdById, null);
  assert.equal(surviving.createdByLabel, "Original author");
  assert.equal(surviving.sourceDiscussionId, null);
  assert.equal(surviving.sourceDiscussionTitle, "Original discussion");
  assert.equal((await client.query('SELECT "actorUserId" FROM "DecisionRevision" WHERE "decisionId" = $1', [survivingDecisionId])).rows[0].actorUserId, null);
}));
