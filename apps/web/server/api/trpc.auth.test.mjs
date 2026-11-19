import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import createJiti from "jiti";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/my_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url);
const { createTRPCContext, createTRPCRouter, protectedProcedure } = jiti("./trpc.ts");
const { redis } = jiti("../cache/redis.ts");
const { persistSession, invalidateSession, invalidateUserSessions, signAccessToken } = jiti("../middleware/auth.ts");

const userId = "ckv7z4v8m0000k8u7r4h4c9a1";
const spoofedUserId = "ckv7z4v8m0000k8u7r4h4c9a2";

// In-memory stand-in for the Redis commands the auth middleware uses.
const store = new Map();
const sets = new Map();

redis.get = async (key) => (store.has(key) ? store.get(key) : null);
redis.smembers = async (key) => [...(sets.get(key) ?? [])];
redis.multi = () => {
  const ops = [];
  const pipeline = {
    set: (key, value) => { ops.push(() => store.set(key, value)); return pipeline; },
    del: (key) => { ops.push(() => store.delete(key)); return pipeline; },
    sadd: (key, member) => { ops.push(() => sets.set(key, new Set([...(sets.get(key) ?? []), member]))); return pipeline; },
    srem: (key, member) => { ops.push(() => sets.get(key)?.delete(member)); return pipeline; },
    expire: () => pipeline,
    exec: async () => { ops.forEach((op) => op()); return []; },
  };
  return pipeline;
};

beforeEach(() => {
  store.clear();
  sets.clear();
});

const router = createTRPCRouter({
  whoami: protectedProcedure.query(({ ctx }) => ctx.user.id),
  touch: protectedProcedure.mutation(({ ctx }) => ctx.user.id),
});

async function call(headers, method = "GET") {
  const ctx = await createTRPCContext({ headers, request: new Request("http://localhost/api/trpc", { method }) });
  return { ctx, caller: router.createCaller(ctx) };
}

const isCode = (code) => (error) => typeof error === "object" && error !== null && error.code === code;

test("protectedProcedure rejects spoofed x-user-id without valid token", async () => {
  const { caller } = await call(new Headers({ "x-user-id": spoofedUserId }));
  await assert.rejects(() => caller.whoami(), isCode("UNAUTHORIZED"));
});

test("protectedProcedure succeeds with a live-session JWT and ignores spoofed x-user-id", async () => {
  await persistSession("session-token-1", userId, "sid-1", 60);
  const headers = new Headers({
    authorization: `Bearer ${signAccessToken(userId, "sid-1")}`,
    "x-user-id": spoofedUserId,
  });

  const { caller } = await call(headers);
  assert.equal(await caller.whoami(), userId);
});

test("a JWT without a session id or with an ended session is rejected", async () => {
  const noSid = jwt.sign({ sub: userId, tokenType: "access" }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const first = await call(new Headers({ authorization: `Bearer ${noSid}` }));
  await assert.rejects(() => first.caller.whoami(), isCode("UNAUTHORIZED"));

  await persistSession("session-token-2", userId, "sid-2", 60);
  const token = signAccessToken(userId, "sid-2");
  await invalidateSession("session-token-2");
  const second = await call(new Headers({ authorization: `Bearer ${token}` }));
  await assert.rejects(() => second.caller.whoami(), isCode("UNAUTHORIZED"));
});

test("an expired access cookie falls back to the session cookie and receives a fresh token", async () => {
  await persistSession("session-token-3", userId, "sid-3", 60);
  const expired = jwt.sign({ sub: userId, sid: "sid-3", tokenType: "access" }, process.env.JWT_SECRET, { expiresIn: -10 });

  const { ctx, caller } = await call(new Headers({ cookie: `access_token=${expired}; session_token=session-token-3` }));
  assert.equal(await caller.whoami(), userId);

  const setCookie = ctx.responseHeaders.get("set-cookie");
  assert.match(setCookie ?? "", /^access_token=[^;]+; Max-Age=900;/);
  const renewed = setCookie.split(";")[0].slice("access_token=".length);
  assert.equal(jwt.verify(decodeURIComponent(renewed), process.env.JWT_SECRET).sid, "sid-3");
});

test("revoking a user's other sessions keeps only the current one", async () => {
  await persistSession("current-session", userId, "sid-current", 60);
  await persistSession("other-session", userId, "sid-other", 60);

  await invalidateUserSessions(userId, "current-session");

  const kept = await call(new Headers({ authorization: `Bearer ${signAccessToken(userId, "sid-current")}` }));
  assert.equal(await kept.caller.whoami(), userId);
  const revoked = await call(new Headers({ cookie: "session_token=other-session" }));
  await assert.rejects(() => revoked.caller.whoami(), isCode("UNAUTHORIZED"));
});

test("a cookie-authenticated mutation with a mismatched CSRF token is FORBIDDEN, not a server error", async () => {
  await persistSession("session-token-4", userId, "sid-4", 60);
  const cookie = `access_token=${signAccessToken(userId, "sid-4")}; csrf_token=expected`;

  const mismatched = await call(new Headers({ cookie, "x-csrf-token": "other" }), "POST");
  await assert.rejects(() => mismatched.caller.touch(), isCode("FORBIDDEN"));

  const matched = await call(new Headers({ cookie, "x-csrf-token": "expected" }), "POST");
  assert.equal(await matched.caller.touch(), userId);
});
