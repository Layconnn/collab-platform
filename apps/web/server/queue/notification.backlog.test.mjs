import assert from "node:assert/strict";
import test from "node:test";

import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { createNotificationBacklog, BACKLOG_DELAY_SECONDS, BACKLOG_RETENTION_SECONDS } = jiti("./notification.backlog.ts");

// A minimal in-memory sorted set with the commands the backlog uses.
function fakeRedis() {
  const set = new Map();
  return {
    set,
    async zadd(_key, flag, score, member) {
      if (flag === "NX" && set.has(member)) return 0;
      set.set(member, Number(score));
      return 1;
    },
    async zrem(_key, ...members) { return members.filter((m) => set.delete(m)).length; },
    async zcard() { return set.size; },
    async zrange() {
      const [first] = [...set.entries()].sort((a, b) => a[1] - b[1]);
      return first ? [first[0], String(first[1])] : [];
    },
    async zremrangebyscore(_key, _min, max) {
      for (const [member, score] of set) if (score <= max) set.delete(member);
    },
  };
}

const now = 1_800_000_000_000;

test("published jobs are pending until settled", async () => {
  const redis = fakeRedis();
  const backlog = createNotificationBacklog(async () => redis);
  await backlog.markPublished("job-a", now - 10_000);
  await backlog.markPublished("job-b", now - 4_000);
  assert.deepEqual(await backlog.read(now), { status: "ok", pending: 2, oldestPendingSeconds: 10 });
  await backlog.markSettled("job-a");
  assert.deepEqual(await backlog.read(now), { status: "ok", pending: 1, oldestPendingSeconds: 4 });
  await backlog.markSettled("job-b");
  assert.deepEqual(await backlog.read(now), { status: "ok", pending: 0, oldestPendingSeconds: 0 });
});

test("a republished job keeps its first publish time", async () => {
  const redis = fakeRedis();
  const backlog = createNotificationBacklog(async () => redis);
  await backlog.markPublished("job-a", now - 60_000);
  await backlog.markPublished("job-a", now - 1_000);
  assert.equal((await backlog.read(now)).oldestPendingSeconds, 60);
});

test("a job older than the delay threshold reports delayed", async () => {
  const redis = fakeRedis();
  const backlog = createNotificationBacklog(async () => redis);
  await backlog.markPublished("stuck", now - (BACKLOG_DELAY_SECONDS + 1) * 1000);
  assert.equal((await backlog.read(now)).status, "delayed");
});

test("entries past retention are dropped so a lost job cannot alert forever", async () => {
  const redis = fakeRedis();
  const backlog = createNotificationBacklog(async () => redis);
  await backlog.markPublished("ancient", now - (BACKLOG_RETENTION_SECONDS + 60) * 1000);
  assert.deepEqual(await backlog.read(now), { status: "ok", pending: 0, oldestPendingSeconds: 0 });
});

test("tracking failures never throw, but reading does", async () => {
  const backlog = createNotificationBacklog(async () => { throw new Error("redis down"); });
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.doesNotReject(backlog.markPublished("job-a"));
    await assert.doesNotReject(backlog.markSettled("job-a"));
  } finally {
    console.error = originalError;
  }
  await assert.rejects(backlog.read(now), /redis down/);
});
