import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Sessions and the security log (settings PRD, FR-8 to FR-10) against a real
// database and Redis: sessions recorded with device and country, listed with
// the current one first, signed out one at a time or all at once, closed when
// they expire, and every security event logged for 90 days.
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
const { profileRouter } = jiti("./routers/profile.router.ts");
const { sessionService, recordSecurityEvent } = jiti("../services/session.service.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
const originalIncr = redis.incr.bind(redis);
redis.incr = async (key) => (key.startsWith("rl:") || key.includes("rate") ? 1 : originalIncr(key));
redis.expire = async () => 1;

const suffix = () => randomUUID().replaceAll("-", "").slice(0, 12);
const createdUserIds = [];
const DAY = 24 * 60 * 60 * 1000;

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0";

const context = ({ user = null, agent = CHROME_WINDOWS, country = "NG", cookie } = {}) => ({
  user, requestId: `sessions-test-${suffix()}`,
  // A signed-in browser sends its session cookie with the matching CSRF pair.
  headers: new Headers({ "user-agent": agent, "x-vercel-ip-country": country, ...(cookie ? { cookie: `${cookie}; csrf_token=t`, "x-csrf-token": "t" } : {}) }),
  requestMethod: "POST", ip: `10.0.0.${Math.floor(Math.random() * 250)}`, responseHeaders: new Headers(),
});

const sessionCookie = (ctx) => (ctx.responseHeaders.get("set-cookie") ?? "").match(/session_token=([^;]+)/)?.[1];

async function signUp() {
  const id = suffix();
  const credentials = { email: `${id}@example.test`, password: `pw-${id}-long` };
  const ctx = context();
  await authRouter.createCaller(ctx).register({ ...credentials, username: `ses_${id}` });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
  createdUserIds.push(user.id);
  const [session] = await prisma.userSession.findMany({ where: { userId: user.id } });
  return { user, credentials, first: { id: session.id, token: sessionCookie(ctx) } };
}

async function signIn(credentials, agent, country) {
  const ctx = context({ agent, country });
  await authRouter.createCaller(ctx).login(credentials);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
  const newest = await prisma.userSession.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return { id: newest.id, token: sessionCookie(ctx) };
}

const as = (user, session, extra = {}) => context({ user: { id: user.id, sessionId: session.id }, cookie: `session_token=${session.token}`, ...extra });
const security = (user, session) => securityRouter.createCaller(as(user, session));
const kinds = async (userId) => (await prisma.securityEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((e) => e.kind);

after(async () => {
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  redis.disconnect();
});

test("each sign-in is a session with its device and country, the current one first", async () => {
  const { user, credentials, first } = await signUp();
  const phone = await signIn(credentials, SAFARI_IPHONE, "GB");
  await signIn(credentials, FIREFOX_LINUX, "DE");

  const sessions = await security(user, phone).sessions();
  assert.equal(sessions.length, 3);
  assert.deepEqual(sessions[0], { ...sessions[0], id: phone.id, device: "Safari on iPhone", country: "GB", current: true });
  assert.ok(sessions.some((s) => s.id === first.id && s.device === "Chrome on Windows" && s.country === "NG"));
  assert.deepEqual(await kinds(user.id), ["ACCOUNT_CREATED", "SIGNED_IN", "SIGNED_IN"]);

  await assert.rejects(authRouter.createCaller(context()).login({ ...credentials, password: "wrong-password-1" }));
  assert.equal((await kinds(user.id)).at(-1), "SIGN_IN_FAILED");
});

test("signing out one session ends it at once; this one must use Sign out", async () => {
  const { user, credentials, first } = await signUp();
  const phone = await signIn(credentials, SAFARI_IPHONE, "GB");
  await assert.rejects(security(user, first).signOutSession({ sessionId: first.id }), (error) => error.code === "BAD_REQUEST");

  await security(user, first).signOutSession({ sessionId: phone.id });
  assert.equal(await redis.get(`auth:sid:${phone.id}`), null);
  assert.equal(await redis.get(`auth:session:${phone.token}`), null);
  assert.deepEqual((await security(user, first).sessions()).map((s) => s.id), [first.id]);
  assert.equal((await kinds(user.id)).at(-1), "SESSION_SIGNED_OUT");
  await assert.rejects(security(user, first).signOutSession({ sessionId: phone.id }), (error) => error.code === "NOT_FOUND");
});

test("signing out every other session keeps this one", async () => {
  const { user, credentials, first } = await signUp();
  await signIn(credentials, SAFARI_IPHONE, "GB");
  await signIn(credentials, FIREFOX_LINUX, "DE");
  assert.deepEqual(await security(user, first).signOutOthers(), { ended: 2 });
  assert.deepEqual((await security(user, first).sessions()).map((s) => s.id), [first.id]);
  assert.ok(await redis.get(`auth:sid:${first.id}`));
});

test("an expired session drops off the list, and a password change ends the others", async () => {
  const { user, credentials, first } = await signUp();
  const phone = await signIn(credentials, SAFARI_IPHONE, "GB");
  const laptop = await signIn(credentials, FIREFOX_LINUX, "DE");
  await redis.del(`auth:sid:${laptop.id}`); // as if it timed out
  assert.deepEqual((await security(user, first).sessions()).map((s) => s.id).sort(), [first.id, phone.id].sort());
  assert.ok((await prisma.userSession.findUnique({ where: { id: laptop.id } })).endedAt);

  await authRouter.createCaller(as(user, first)).changePassword({ currentPassword: credentials.password, newPassword: `${credentials.password}-new` });
  assert.deepEqual((await security(user, first).sessions()).map((s) => s.id), [first.id]);
  assert.equal((await kinds(user.id)).at(-1), "PASSWORD_CHANGED");
});

test("signing out, changing a username and old events are recorded or pruned", async () => {
  const { user, first } = await signUp();
  await profileRouter.createCaller(as(user, first)).changeUsername({ username: `renamed_${suffix()}` });
  await prisma.securityEvent.create({ data: { userId: user.id, kind: "SIGNED_IN", createdAt: new Date(Date.now() - 100 * DAY) } });
  await authRouter.createCaller(as(user, first)).logout({});
  assert.ok((await prisma.userSession.findUnique({ where: { id: first.id } })).endedAt);
  const events = await kinds(user.id);
  assert.deepEqual(events, ["ACCOUNT_CREATED", "USERNAME_CHANGED", "SIGNED_OUT"]); // the 100-day-old one was pruned

  // The log pages newest first.
  for (let i = 0; i < 4; i += 1) await recordSecurityEvent(user.id, "SIGNED_IN");
  const page = await securityRouter.createCaller(as(user, first)).log({ take: 3 });
  assert.equal(page.items.length, 3);
  const rest = await securityRouter.createCaller(as(user, first)).log({ take: 10, cursor: page.nextCursor });
  assert.equal(rest.nextCursor, null);
  assert.equal(new Set([...page.items, ...rest.items].map((item) => item.id)).size, 7);
  assert.equal(page.items.length + rest.items.length, 7);
});

test("a session from before sessions were recorded gets its row on its next request", async () => {
  const { user } = await signUp();
  const legacy = randomUUID();
  await sessionService.touch(user.id, legacy, new Headers({ "user-agent": FIREFOX_LINUX, "x-vercel-ip-country": "FR" }));
  const row = await prisma.userSession.findUnique({ where: { id: legacy } });
  assert.equal(row.device, "Firefox on Linux");
  // At most every 10 minutes: a second touch changes nothing.
  await prisma.userSession.update({ where: { id: legacy }, data: { lastSeenAt: new Date(0) } });
  await sessionService.touch(user.id, legacy, new Headers());
  assert.equal((await prisma.userSession.findUnique({ where: { id: legacy } })).lastSeenAt.getTime(), 0);
});
