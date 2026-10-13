import assert from "node:assert/strict";
import test from "node:test";

import createJiti from "jiti";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/my_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-123456789";

const jiti = createJiti(import.meta.url);
const { createRateLimitGuard } = jiti("./rateLimit.ts");

test("rate limit is enforced per user and per route", async () => {
  const counters = new Map();
  const expirations = new Map();

  const store = {
    async incr(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async expire(key, ttlSeconds) {
      expirations.set(key, ttlSeconds);
    },
  };

  const getByIdGuard = createRateLimitGuard(
    {
      routeKey: "workspace.getById",
      limit: 2,
      windowSeconds: 60,
    },
    store,
  );

  const addMemberGuard = createRateLimitGuard(
    {
      routeKey: "workspace.addMember",
      limit: 2,
      windowSeconds: 60,
    },
    store,
  );

  await getByIdGuard("user-1", "req-1");
  await getByIdGuard("user-1", "req-1");

  await assert.rejects(
    async () => getByIdGuard("user-1", "req-1"),
    (error) => typeof error === "object" && error !== null && "code" in error && error.code === "TOO_MANY_REQUESTS",
  );

  // Different route does not share the same limiter bucket.
  await addMemberGuard("user-1", "req-1");
  await addMemberGuard("user-1", "req-1");
  await assert.rejects(
    async () => addMemberGuard("user-1", "req-1"),
    (error) => typeof error === "object" && error !== null && "code" in error && error.code === "TOO_MANY_REQUESTS",
  );

  // Different user has a separate limiter bucket.
  await assert.doesNotReject(async () => getByIdGuard("user-2", "req-2"));
  await assert.doesNotReject(async () => getByIdGuard("user-2", "req-2"));

  assert.equal(expirations.get("ratelimit:workspace.getById:user:user-1"), 60);
  assert.equal(expirations.get("ratelimit:workspace.addMember:user:user-1"), 60);
});
