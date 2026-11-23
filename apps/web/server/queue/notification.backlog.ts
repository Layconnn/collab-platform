// Tracks notification jobs between publish and delivery, because Vercel Queues
// exposes no queue-depth API. Every published job is a member of one Redis
// sorted set scored by its publish time; delivering it, or giving up on it,
// removes it. The set's size is the backlog and its lowest score the oldest job.
//
// Tracking is best effort: a Redis failure is logged and never fails the
// request or the delivery that triggered it.

export const BACKLOG_KEY = "notifications:pending";
// A job older than this is "delayed": deliveries normally take seconds.
export const BACKLOG_DELAY_SECONDS = 300;
// Older entries are dropped so a lost message cannot alert forever; Vercel
// Queues messages expire well before this.
export const BACKLOG_RETENTION_SECONDS = 24 * 60 * 60;

export type BacklogClient = {
  zadd(key: string, ...args: (string | number)[]): Promise<unknown>;
  zrem(key: string, ...members: string[]): Promise<unknown>;
  zcard(key: string): Promise<number>;
  zrange(key: string, start: number, stop: number, withScores: "WITHSCORES"): Promise<string[]>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<unknown>;
};

export type BacklogStatus = {
  status: "ok" | "delayed";
  pending: number;
  oldestPendingSeconds: number;
};

function logTrackingFailure(operation: string, error: unknown) {
  console.error(
    JSON.stringify({
      level: "ERROR",
      event: "notification.backlog.tracking_failed",
      operation,
      error: String(error),
      timestamp: new Date().toISOString(),
    }),
  );
}

export function createNotificationBacklog(getClient: () => Promise<BacklogClient>) {
  return {
    async markPublished(jobId: string, publishedAt = Date.now()): Promise<void> {
      try {
        // NX keeps the first publish time when an idempotent retry republishes.
        await (await getClient()).zadd(BACKLOG_KEY, "NX", publishedAt, jobId);
      } catch (error) {
        logTrackingFailure("markPublished", error);
      }
    },

    async markSettled(jobId: string): Promise<void> {
      try {
        await (await getClient()).zrem(BACKLOG_KEY, jobId);
      } catch (error) {
        logTrackingFailure("markSettled", error);
      }
    },

    // Throws when Redis is unavailable so the health check reports it.
    async read(now = Date.now()): Promise<BacklogStatus> {
      const client = await getClient();
      await client.zremrangebyscore(BACKLOG_KEY, "-inf", now - BACKLOG_RETENTION_SECONDS * 1000);
      const [pending, oldest] = await Promise.all([
        client.zcard(BACKLOG_KEY),
        client.zrange(BACKLOG_KEY, 0, 0, "WITHSCORES"),
      ]);
      const oldestPendingSeconds = oldest.length === 2 ? Math.max(0, Math.floor((now - Number(oldest[1])) / 1000)) : 0;
      return {
        status: oldestPendingSeconds > BACKLOG_DELAY_SECONDS ? "delayed" : "ok",
        pending,
        oldestPendingSeconds,
      };
    },
  };
}

// Redis is imported on first use so modules that only publish never parse the
// server environment at import time (tests stub the queue before that).
export const notificationBacklog = createNotificationBacklog(async () => {
  const { redis } = await import("../cache/redis");
  return redis as unknown as BacklogClient;
});
