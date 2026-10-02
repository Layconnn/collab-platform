import assert from "node:assert/strict";
import test from "node:test";

import createJiti from "jiti";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/my_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-123456789";

const jiti = createJiti(import.meta.url);
const { createTRPCContext, createTRPCRouter, protectedProcedure } = jiti("./trpc.ts");

const userId = "ckv7z4v8m0000k8u7r4h4c9a1";
const spoofedUserId = "ckv7z4v8m0000k8u7r4h4c9a2";

test("protectedProcedure rejects spoofed x-user-id without valid token", async () => {
  const router = createTRPCRouter({
    whoami: protectedProcedure.query(({ ctx }) => ctx.user.id),
  });

  const headers = new Headers({
    "x-user-id": spoofedUserId,
  });

  const ctx = await createTRPCContext({ headers, request: new Request("http://localhost/api/trpc") });
  const caller = router.createCaller(ctx);

  await assert.rejects(
    async () => caller.whoami(),
    (error) => typeof error === "object" && error !== null && "code" in error && error.code === "UNAUTHORIZED",
  );
});

test("protectedProcedure succeeds with valid JWT and ignores spoofed x-user-id", async () => {
  const router = createTRPCRouter({
    whoami: protectedProcedure.query(({ ctx }) => ctx.user.id),
  });

  const token = jwt.sign(
    {
      sub: userId,
      tokenType: "access",
    },
    process.env.JWT_SECRET,
    { expiresIn: "5m" },
  );

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "x-user-id": spoofedUserId,
  });

  const ctx = await createTRPCContext({ headers, request: new Request("http://localhost/api/trpc") });
  const caller = router.createCaller(ctx);
  const resolvedUserId = await caller.whoami();

  assert.equal(resolvedUserId, userId);
  assert.notEqual(resolvedUserId, spoofedUserId);
});
