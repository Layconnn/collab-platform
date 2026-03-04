import { Queue, Worker, type Job } from "bullmq";

import { env } from "../env";

const redisUrl = new URL(env.REDIS_URL);

const queueConnection = {
  host: redisUrl.hostname,
  port: redisUrl.port ? Number(redisUrl.port) : 6379,
  ...(redisUrl.username
    ? { username: decodeURIComponent(redisUrl.username) }
    : {}),
  ...(redisUrl.password
    ? { password: decodeURIComponent(redisUrl.password) }
    : {}),
  ...(redisUrl.pathname && redisUrl.pathname !== "/"
    ? { db: Number(redisUrl.pathname.replace("/", "")) || 0 }
    : {}),
};

export function createQueue<T extends Record<string, unknown>>(name: string) {
  return new Queue<T>(name, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: {
        age: 60 * 60,
        count: 1000,
      },
      removeOnFail: {
        age: 60 * 60 * 24,
        count: 5000,
      },
    },
  });
}

type QueueProcessor<T extends Record<string, unknown>> = (
  job: Job<T>,
) => Promise<void>;

export function createWorker<T extends Record<string, unknown>>(
  name: string,
  processor: QueueProcessor<T>,
) {
  return new Worker<T>(name, processor, {
    connection: queueConnection,
    concurrency: 10,
  });
}
