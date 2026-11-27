import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Two-step sign-in (settings PRD, FR-11 to FR-13) against a real database and
// Redis: turning it on with a confirming code, recovery codes that work once,
// the code step of signing in, and turning it off with the password and a code.
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
const { base32Decode, hotp, stepAt, sealSecret, openSecret, matchTotp } = jiti("../services/totp.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
const originalIncr = redis.incr.bind(redis);
redis.incr = async (key) => (key.startsWith("ratelimit:") ? 1 : originalIncr(key));

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];

const context = ({ user = null } = {}) => ({
  user, requestId: `two-step-${suffix()}`,
  headers: new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36", "x-vercel-ip-country": "NG" }),
  requestMethod: "POST", ip: "10.0.0.9", responseHeaders: new Headers(),
});
const codeFor = (secret, stepOffset = 0) => hotp(base32Decode(secret), stepAt(Date.now()) + stepOffset);
const kinds = async (userId) => (await prisma.securityEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((e) => e.kind);
// As if the next 30-second window had come: the last used step moves back.
const nextWindow = (userId) => prisma.user.update({ where: { id: userId }, data: { totpLastStep: stepAt(Date.now()) - 2 } });

async function signUp() {
  const id = suffix();
  const credentials = { email: `${id}@example.test`, password: `pw-${id}-long` };
  await authRouter.createCaller(context()).register({ ...credentials, username: `two_${id}` });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
  createdUserIds.push(user.id);
  const security = securityRouter.createCaller(context({ user: { id: user.id } }));
  return { user, credentials, security };
}

async function withTwoStep() {
  const account = await signUp();
  const { secret } = await account.security.beginTwoStep();
  const usedCode = codeFor(secret);
  const { recoveryCodes } = await account.security.enableTwoStep({ code: usedCode });
  return { ...account, secret, recoveryCodes, usedCode };
}

after(async () => {
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("codes follow RFC 6238 and the secret is stored sealed", () => {
  // RFC 6238, appendix B (SHA-1), last six digits.
  const rfc = Buffer.from("12345678901234567890");
  assert.equal(hotp(rfc, Math.floor(59 / 30)), "287082");
  assert.equal(hotp(rfc, Math.floor(1111111109 / 30)), "081804");
  const sealed = sealSecret("JBSWY3DPEHPK3PXP");
  assert.notEqual(sealed, "JBSWY3DPEHPK3PXP");
  assert.equal(openSecret(sealed), "JBSWY3DPEHPK3PXP");
  // One step of drift either way, and never a step already used.
  const secret = "JBSWY3DPEHPK3PXP";
  const now = Date.now();
  assert.equal(matchTotp(secret, codeFor(secret, -1), now, null), stepAt(now) - 1);
  assert.equal(matchTotp(secret, codeFor(secret, 2), now, null), null);
  assert.equal(matchTotp(secret, codeFor(secret), now, stepAt(now)), null);
});

test("turning it on needs a confirming code and gives ten recovery codes once", async () => {
  const { user, security } = await signUp();
  assert.deepEqual(await security.twoStep(), { enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
  const { secret, otpauthUrl } = await security.beginTwoStep();
  assert.match(otpauthUrl, /^otpauth:\/\/totp\/Commons%3A.+\?secret=[A-Z2-7]{32}&issuer=Commons/);
  await assert.rejects(security.enableTwoStep({ code: "000000" === codeFor(secret) ? "111111" : "000000" }), (error) => error.code === "BAD_REQUEST");

  const { recoveryCodes } = await security.enableTwoStep({ code: codeFor(secret) });
  assert.equal(recoveryCodes.length, 10);
  assert.ok(recoveryCodes.every((code) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(code)));
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(stored.totpSecret && !stored.totpSecret.includes(secret));
  const hashes = await prisma.recoveryCode.findMany({ where: { userId: user.id } });
  assert.ok(hashes.every((row) => !recoveryCodes.includes(row.codeHash)));
  assert.equal((await security.twoStep()).recoveryCodesLeft, 10);
  assert.equal((await kinds(user.id)).at(-1), "TWO_STEP_ENABLED");
  await assert.rejects(security.beginTwoStep(), (error) => error.code === "CONFLICT");
});

test("signing in asks for a code after the password; the password alone gives no session", async () => {
  const { user, credentials, secret, usedCode } = await withTwoStep();
  const ctx = context();
  const first = await authRouter.createCaller(ctx).login(credentials);
  assert.equal(first.twoStep, true);
  assert.equal(ctx.responseHeaders.get("set-cookie"), null);
  assert.equal(await prisma.userSession.count({ where: { userId: user.id, endedAt: null } }), 1); // only the sign-up session

  // The code just used to turn it on can't be used again.
  await assert.rejects(authRouter.createCaller(context()).verifyTwoStep({ challengeToken: first.challengeToken, code: usedCode }), (error) => error.code === "UNAUTHORIZED");
  const done = context();
  const signedIn = await authRouter.createCaller(done).verifyTwoStep({ challengeToken: first.challengeToken, code: codeFor(secret, 1) });
  assert.equal(signedIn.success, true);
  assert.match(done.responseHeaders.get("set-cookie") ?? "", /session_token=/);
  assert.equal(await prisma.userSession.count({ where: { userId: user.id, endedAt: null } }), 2);
  // A challenge works once.
  await assert.rejects(authRouter.createCaller(context()).verifyTwoStep({ challengeToken: first.challengeToken, code: codeFor(secret, 1) }), (error) => error.code === "UNAUTHORIZED");
  assert.deepEqual((await kinds(user.id)).slice(-2), ["SIGN_IN_FAILED", "SIGNED_IN"]);
});

test("a recovery code replaces a sign-in code once; five wrong codes end the challenge", async () => {
  const { user, credentials, recoveryCodes } = await withTwoStep();
  const { challengeToken } = await authRouter.createCaller(context()).login(credentials);
  await authRouter.createCaller(context()).verifyTwoStep({ challengeToken, code: recoveryCodes[0].toUpperCase().replace("-", " ") });
  assert.ok((await kinds(user.id)).includes("RECOVERY_CODE_USED"));
  assert.equal(await prisma.recoveryCode.count({ where: { userId: user.id, usedAt: null } }), 9);

  const again = (await authRouter.createCaller(context()).login(credentials)).challengeToken;
  await assert.rejects(authRouter.createCaller(context()).verifyTwoStep({ challengeToken: again, code: recoveryCodes[0] }), /didn't work/);
  for (let i = 0; i < 3; i += 1) await assert.rejects(authRouter.createCaller(context()).verifyTwoStep({ challengeToken: again, code: "000000" }));
  await assert.rejects(authRouter.createCaller(context()).verifyTwoStep({ challengeToken: again, code: "000001" }), /Too many wrong codes/);
  await assert.rejects(authRouter.createCaller(context()).verifyTwoStep({ challengeToken: again, code: recoveryCodes[1] }), /expired/);
});

test("new recovery codes need an authenticator code and replace the old ones", async () => {
  const { user, credentials, secret, recoveryCodes, security } = await withTwoStep();
  await assert.rejects(security.regenerateRecoveryCodes({ code: "12345a" }), (error) => error.code === "BAD_REQUEST");
  await nextWindow(user.id);
  const { recoveryCodes: fresh } = await security.regenerateRecoveryCodes({ code: codeFor(secret) });
  assert.equal(fresh.length, 10);
  assert.equal((await kinds(user.id)).at(-1), "RECOVERY_CODES_REGENERATED");
  const { challengeToken } = await authRouter.createCaller(context()).login(credentials);
  await assert.rejects(authRouter.createCaller(context()).verifyTwoStep({ challengeToken, code: recoveryCodes[2] }));
  await authRouter.createCaller(context()).verifyTwoStep({ challengeToken, code: fresh[0] });
});

test("turning it off needs the password and a code", async () => {
  const { user, credentials, secret, security } = await withTwoStep();
  await nextWindow(user.id);
  await assert.rejects(security.disableTwoStep({ password: "wrong-password-1", code: codeFor(secret) }), (error) => error.code === "FORBIDDEN");
  await assert.rejects(security.disableTwoStep({ password: credentials.password, code: "000000" === codeFor(secret) ? "111111" : "000000" }), (error) => error.code === "FORBIDDEN");
  await security.disableTwoStep({ password: credentials.password, code: codeFor(secret) });
  assert.deepEqual(await security.twoStep(), { enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
  assert.equal(await prisma.recoveryCode.count({ where: { userId: user.id } }), 0);
  assert.equal((await kinds(user.id)).at(-1), "TWO_STEP_DISABLED");
  const plain = await authRouter.createCaller(context()).login(credentials);
  assert.equal(plain.twoStep, false);
});
