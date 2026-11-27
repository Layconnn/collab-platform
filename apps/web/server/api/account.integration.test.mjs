import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Your data (settings PRD, FR-17 to FR-19) against a real database and Redis:
// downloading it, closing the account with a grace period that signing in
// ends, and erasing it after 30 days while its content stays in the workspace
// as "Former member".
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { authRouter } = jiti("./routers/auth.router.ts");
const { securityRouter } = jiti("./routers/security.router.ts");
const { workspaceRouter } = jiti("./routers/workspace.router.ts");
const { accountService } = jiti("../services/account.service.ts");
const { base32Decode, hotp, stepAt } = jiti("../services/totp.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
const originalIncr = redis.incr.bind(redis);
redis.incr = async (key) => (key.startsWith("ratelimit:") ? 1 : originalIncr(key));

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];
const DAY = 24 * 60 * 60 * 1000;

const context = (user = null) => ({
  user, requestId: `account-${suffix()}`,
  headers: new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36" }),
  requestMethod: "POST", ip: "10.0.0.7", responseHeaders: new Headers(),
});
const kinds = async (userId) => (await prisma.securityEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((e) => e.kind);

async function signUp(name) {
  const id = suffix();
  const credentials = { email: `${id}@example.test`, password: `pw-${id}-long` };
  await authRouter.createCaller(context()).register({ ...credentials, username: `acc_${id}` });
  const user = await prisma.user.update({ where: { email: credentials.email }, data: { name } });
  createdUserIds.push(user.id);
  const session = await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } });
  const me = { id: user.id, sessionId: session.id };
  return { user, credentials, security: securityRouter.createCaller(context(me)), workspaces: workspaceRouter.createCaller(context(me)) };
}

async function teamWith(member) {
  const owner = await signUp("Maya");
  const ws = await owner.workspaces.create({ name: "Platform", slug: `acc-${suffix()}` });
  await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: member.user.id, role: "MEMBER" } });
  return { owner, ws };
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("downloading your data gives everything you put in, once an hour", async () => {
  const sam = await signUp("Sam");
  const { ws } = await teamWith(sam);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: sam.user.id, title: "Queues", body: "Hosted or our own?" } });
  await prisma.comment.create({ data: { workspaceId: ws.id, discussionId: discussion.id, authorId: sam.user.id, body: "Hosted." } });
  await prisma.savedItem.create({ data: { userId: sam.user.id, workspaceId: ws.id, discussionId: discussion.id } });

  const data = await sam.security.exportData();
  assert.equal(data.format, "commons-export");
  assert.equal(data.profile.email, sam.credentials.email);
  assert.equal(data.profile.twoStepSignIn, false);
  assert.equal("passwordHash" in data.profile, false);
  assert.deepEqual(data.memberships.map((m) => [m.workspace, m.role]), [["Platform", "MEMBER"]]);
  assert.deepEqual(data.discussions.map((d) => d.title), ["Queues"]);
  assert.deepEqual(data.replies.map((c) => c.body), ["Hosted."]);
  assert.equal(data.savedItems.length, 1);
  assert.equal((await kinds(sam.user.id)).at(-1), "DATA_EXPORTED");
  assert.doesNotThrow(() => JSON.stringify(data));

  // One export an hour (the real limiter this time).
  redis.incr = originalIncr;
  try {
    await redis.del(`ratelimit:security.exportData:user:${sam.user.id}`);
    await sam.security.exportData();
    await assert.rejects(sam.security.exportData(), (error) => error.code === "TOO_MANY_REQUESTS");
  } finally {
    redis.incr = async (key) => (key.startsWith("ratelimit:") ? 1 : originalIncr(key));
  }
});

test("closing needs the password, is refused while you own a workspace, and signs you out everywhere", async () => {
  const sam = await signUp("Sam");
  const { owner, ws } = await teamWith(sam);
  await assert.rejects(sam.security.closeAccount({ password: "wrong-password-1" }), (error) => error.code === "FORBIDDEN");
  await assert.rejects(owner.security.closeAccount({ password: owner.credentials.password }), (error) => error.code === "CONFLICT" && /Platform/.test(error.message));

  const ctx = context({ id: sam.user.id, sessionId: (await prisma.userSession.findFirstOrThrow({ where: { userId: sam.user.id } })).id });
  const result = await securityRouter.createCaller(ctx).closeAccount({ password: sam.credentials.password });
  assert.equal(result.closed, true);
  assert.match(ctx.responseHeaders.get("set-cookie") ?? "", /session_token=;/);
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: sam.user.id } })).closedAt);
  assert.equal(await prisma.userSession.count({ where: { userId: sam.user.id, endedAt: null } }), 0);
  assert.equal((await redis.smembers(`auth:user-sessions:${sam.user.id}`)).length, 0);
  assert.equal((await kinds(sam.user.id)).at(-1), "ACCOUNT_CLOSED");
  // A closed account can't be handed a workspace.
  await assert.rejects(owner.workspaces.transferOwnership({ workspaceId: ws.id, newOwnerUserId: sam.user.id }), (error) => error.code === "CONFLICT");

  // Signing in during the grace period restores it.
  await authRouter.createCaller(context()).login(sam.credentials);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: sam.user.id } })).closedAt, null);
  assert.equal((await kinds(sam.user.id)).at(-1), "ACCOUNT_RESTORED");
});

test("with two-step on, closing also needs a code", async () => {
  const sam = await signUp("Sam");
  const { secret } = await sam.security.beginTwoStep();
  await sam.security.enableTwoStep({ code: hotp(base32Decode(secret), stepAt(Date.now())) });
  await prisma.user.update({ where: { id: sam.user.id }, data: { totpLastStep: stepAt(Date.now()) - 2 } });
  await assert.rejects(sam.security.closeAccount({ password: sam.credentials.password }), (error) => error.code === "BAD_REQUEST");
  await assert.rejects(sam.security.closeAccount({ password: sam.credentials.password, code: "000000" === hotp(base32Decode(secret), stepAt(Date.now())) ? "111111" : "000000" }), (error) => error.code === "FORBIDDEN");
  await sam.security.closeAccount({ password: sam.credentials.password, code: hotp(base32Decode(secret), stepAt(Date.now())) });
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: sam.user.id } })).closedAt);
});

test("after 30 days the account is erased; its content stays as Former member", async () => {
  const sam = await signUp("Sam Okoro");
  const { ws } = await teamWith(sam);
  const discussion = await prisma.discussion.create({ data: { workspaceId: ws.id, authorId: sam.user.id, title: "Logo", body: "A or B?" } });
  const reply = await prisma.comment.create({ data: { workspaceId: ws.id, discussionId: discussion.id, authorId: sam.user.id, body: "B." } });
  await prisma.discussionFollow.create({ data: { workspaceId: ws.id, discussionId: discussion.id, userId: sam.user.id } });
  await prisma.activityEvent.create({ data: { workspaceId: ws.id, actorUserId: sam.user.id, actorLabel: "Sam Okoro", kind: "DISCUSSION_CREATED", subjectType: "DISCUSSION", subjectId: discussion.id, summary: { title: "Logo" } } });
  await sam.security.closeAccount({ password: sam.credentials.password });

  // Not yet: 29 days in.
  const early = await accountService.eraseClosedAccounts({ storage: null, deadline: Date.now() + 30_000, now: new Date(Date.now() + 29 * DAY) });
  assert.equal(early.erased, 0);

  const done = await accountService.eraseClosedAccounts({ storage: null, deadline: Date.now() + 30_000, now: new Date(Date.now() + 31 * DAY) });
  assert.ok(done.erased >= 1);
  const erased = await prisma.user.findUniqueOrThrow({ where: { id: sam.user.id } });
  assert.equal(erased.name, "Former member");
  assert.ok(erased.erasedAt);
  assert.equal(erased.passwordHash, null);
  assert.ok(!erased.email.includes("example.test"));
  assert.match(erased.username, /^former_[a-z0-9]+$/);
  for (const [model, where] of [["userSession", { userId: sam.user.id }], ["securityEvent", { userId: sam.user.id }], ["discussionFollow", { userId: sam.user.id }], ["workspaceMember", { userId: sam.user.id }]]) {
    assert.equal(await prisma[model].count({ where }), 0, model);
  }
  // The content stays, with the name gone.
  assert.ok(await prisma.discussion.findUnique({ where: { id: discussion.id } }));
  assert.ok(await prisma.comment.findUnique({ where: { id: reply.id } }));
  const events = await prisma.activityEvent.findMany({ where: { workspaceId: ws.id, actorUserId: sam.user.id } });
  assert.ok(events.every((event) => event.actorLabel === "Former member"));
  assert.ok(events.some((event) => event.kind === "MEMBER_REMOVED" && event.summary.member === "Former member"));
  // Signing in no longer works.
  await assert.rejects(authRouter.createCaller(context()).login(sam.credentials), (error) => error.code === "UNAUTHORIZED");
  // Running again erases nothing more.
  assert.equal((await accountService.eraseClosedAccounts({ storage: null, deadline: Date.now() + 30_000, now: new Date(Date.now() + 31 * DAY) })).erased, 0);
});
