import Redis from "ioredis";

import { env } from "../env";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

const redisClient =
  globalThis.__redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__redis = redisClient;
}

export const redis = redisClient;

export const redisCache = {
  async getJSON<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key);
    if (!cached) {
      return null;
    }
    return JSON.parse(cached) as T;
  },

  async setJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async delByPattern(pattern: string): Promise<void> {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    for await (const keys of stream) {
      const batch = keys as string[];
      if (batch.length > 0) {
        await redis.del(...batch);
      }
    }
  },
};
