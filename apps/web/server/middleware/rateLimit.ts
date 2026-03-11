import { TRPCError } from "@trpc/server";

import { redis } from "../cache/redis";
import { recordRateLimitHit } from "../observability/security-events";

type RateLimitStore = {
  incr: (key: string) => Promise<number>;
  expire: (key: string, ttlSeconds: number) => Promise<void>;
};

type RateLimitOptions = {
  routeKey: string;
  limit: number;
  windowSeconds: number;
};

const redisRateLimitStore: RateLimitStore = {
  async incr(key) {
    return redis.incr(key);
  },
  async expire(key, ttlSeconds) {
    await redis.expire(key, ttlSeconds);
  },
};

export function createRateLimitGuard(
  options: RateLimitOptions,
  store: RateLimitStore = redisRateLimitStore,
) {
  return async (userId: string, requestId: string): Promise<void> => {
    const key = `ratelimit:${options.routeKey}:user:${userId}`;
    const count = await store.incr(key);

    if (count === 1) {
      await store.expire(key, options.windowSeconds);
    }

    if (count > options.limit) {
      await recordRateLimitHit({
        requestId,
        userId,
        routeKey: options.routeKey,
        count,
        timestamp: new Date().toISOString(),
      });
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded for ${options.routeKey}.`,
      });
    }
  };
}

export function createRateLimitGuardByKey(
  options: RateLimitOptions,
  store: RateLimitStore = redisRateLimitStore,
) {
  return async (subjectKey: string, requestId: string): Promise<void> => {
    const key = `ratelimit:${options.routeKey}:key:${subjectKey}`;
    const count = await store.incr(key);

    if (count === 1) {
      await store.expire(key, options.windowSeconds);
    }

    if (count > options.limit) {
      await recordRateLimitHit({
        requestId,
        userId: subjectKey,
        routeKey: options.routeKey,
        count,
        timestamp: new Date().toISOString(),
      });
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded for ${options.routeKey}.`,
      });
    }
  };
}

export type { RateLimitStore, RateLimitOptions };
