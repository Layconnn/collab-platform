import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Changing your email (settings PRD, FR-20) against a real database and Redis:
// the password and a 6-digit code to the new address, 5 attempts, a notice to
// the old address, and the allowlist until the sending domain exists.
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
const { emailChangeService } = jiti("../services/email-change.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
const originalIncr = redis.incr.bind(redis);
redis.incr = async (key) => (key.startsWith("ratelimit:") ? 1 : originalIncr(key));

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];
const context = (user = null) => ({
  user, requestId: `email-${suffix()}`, headers: new Headers(), requestMethod: "POST", ip: "10.0.0.8", responseHeaders: new Headers(),
});

// A sender that keeps what it was asked to send.
function inbox() {
  const sent = [];
  const sender = async (email) => { sent.push(email); return { id: `msg-${sent.length}` }; };
  const codeFor = (to) => sent.filter((email) => email.to === to).at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
  return { sent, sender, codeFor };
}

async function signUp() {
  const id = suffix();
  const credentials = { email: `${id}@example.test`, password: `pw-${id}-long` };
  await authRouter.createCaller(context()).register({ ...credentials, username: `em_${id}` });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
  createdUserIds.push(user.id);
  return { user, credentials };
}

after(async () => {
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("the code sent to the new address changes the email, and the old address is told", async () => {
  const { user, credentials } = await signUp();
  const newEmail = `new-${suffix()}@example.test`;
  const mail = inbox();
  const settings = { sender: mail.sender, delivery: "all", allowlist: [] };

  await assert.rejects(emailChangeService.request(user.id, { email: newEmail, password: "wrong-password-1" }, settings), (error) => error.code === "FORBIDDEN");
  assert.equal(mail.sent.length, 0);
  const { pending } = await emailChangeService.request(user.id, { email: newEmail.toUpperCase(), password: credentials.password }, settings);
  assert.equal(pending.email, newEmail);
  assert.deepEqual((await emailChangeService.status(user.id, settings)).pending.email, newEmail);
  const code = mail.codeFor(newEmail);
  assert.match(code, /^\d{6}$/);
  // Only a hash is stored.
  assert.ok(!(await redis.get(`auth:email-change:${user.id}`)).includes(code));

  await assert.rejects(emailChangeService.confirm(user.id, { code: code === "000000" ? "111111" : "000000" }, {}, settings), (error) => error.code === "FORBIDDEN");
  assert.deepEqual(await emailChangeService.confirm(user.id, { code }, {}, settings), { email: newEmail });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email, newEmail);
  const notice = mail.sent.find((email) => email.to === credentials.email);
  assert.match(notice.subject, /was changed/);
  assert.ok(!notice.text.includes(newEmail)); // masked
  assert.equal((await prisma.securityEvent.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } })).kind, "EMAIL_CHANGED");
  assert.equal((await emailChangeService.status(user.id, settings)).pending, null);

  // Signing in now uses the new address.
  await authRouter.createCaller(context()).login({ email: newEmail, password: credentials.password });
  await assert.rejects(authRouter.createCaller(context()).login(credentials), (error) => error.code === "UNAUTHORIZED");
});

test("five wrong codes end the request; a taken or unchanged address is refused", async () => {
  const { user, credentials } = await signUp();
  const other = await signUp();
  const mail = inbox();
  const settings = { sender: mail.sender, delivery: "all", allowlist: [] };
  await assert.rejects(emailChangeService.request(user.id, { email: other.credentials.email, password: credentials.password }, settings), (error) => error.code === "CONFLICT");
  await assert.rejects(emailChangeService.request(user.id, { email: credentials.email, password: credentials.password }, settings), (error) => error.code === "BAD_REQUEST");

  const newEmail = `new-${suffix()}@example.test`;
  await emailChangeService.request(user.id, { email: newEmail, password: credentials.password }, settings);
  const wrong = mail.codeFor(newEmail) === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i += 1) await assert.rejects(emailChangeService.confirm(user.id, { code: wrong }, {}, settings), (error) => error.code === "FORBIDDEN");
  await assert.rejects(emailChangeService.confirm(user.id, { code: wrong }, {}, settings), /Too many wrong codes/);
  await assert.rejects(emailChangeService.confirm(user.id, { code: mail.codeFor(newEmail) }, {}, settings), /expired/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email, credentials.email);

  // Cancelling drops a pending change.
  await emailChangeService.request(user.id, { email: newEmail, password: credentials.password }, settings);
  await emailChangeService.cancel(user.id);
  assert.equal((await emailChangeService.status(user.id, settings)).pending, null);
});

test("until the domain exists, codes only go to allowlisted addresses", async () => {
  const { user, credentials } = await signUp();
  const mail = inbox();
  const allowed = `allowed-${suffix()}@example.test`;
  const settings = { sender: mail.sender, delivery: "allowlist", allowlist: [` ${allowed.toUpperCase()} `] };
  assert.equal((await emailChangeService.status(user.id, settings)).sending, "allowlist");
  await assert.rejects(emailChangeService.request(user.id, { email: `other-${suffix()}@example.test`, password: credentials.password }, settings), (error) => error.code === "PRECONDITION_FAILED");
  await emailChangeService.request(user.id, { email: allowed, password: credentials.password }, settings);
  await emailChangeService.confirm(user.id, { code: mail.codeFor(allowed) }, {}, settings);
  // The old address isn't on the list, so no notice was sent to it.
  assert.equal(mail.sent.filter((email) => email.to === credentials.email).length, 0);

  // With no email set up at all, the router says so.
  const caller = securityRouter.createCaller(context({ id: user.id }));
  assert.equal((await caller.emailChange()).sending, "off");
  await assert.rejects(caller.requestEmailChange({ email: `x-${suffix()}@example.test`, password: credentials.password }), (error) => error.code === "PRECONDITION_FAILED");
});
