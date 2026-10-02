import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

import createJiti from "jiti";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/my_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-123456789";

const jiti = createJiti(import.meta.url);

const { discussionRouter } = jiti("./routers/discussion.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis, redisCache } = jiti("../cache/redis.ts");
const { notificationQueue } = jiti("../queue/notification.queue.ts");

const workspaceId = "c000000000000000000000001";
const memberUserId = "c000000000000000000000002";
const nonMemberUserId = "c000000000000000000000003";
const secondMemberUserId = "c000000000000000000000004";
const adminUserId = "c000000000000000000000005";
const outsiderWorkspaceId = "c000000000000000000000006";

const originalRedisIncr = redis.incr.bind(redis);
const originalRedisExpire = redis.expire.bind(redis);
const originalRedisGet = redis.get.bind(redis);
const originalRedisSet = redis.set.bind(redis);
const originalRedisDel = redis.del.bind(redis);
const originalRedisScanStream = redis.scanStream.bind(redis);

const originalCacheGetJSON = redisCache.getJSON.bind(redisCache);
const originalCacheSetJSON = redisCache.setJSON.bind(redisCache);
const originalCacheDel = redisCache.del.bind(redisCache);
const originalCacheDelByPattern = redisCache.delByPattern.bind(redisCache);

const originalWorkspaceMemberFindUnique = prisma.workspaceMember.findUnique.bind(prisma.workspaceMember);
const originalWorkspaceMemberFindMany = prisma.workspaceMember.findMany.bind(prisma.workspaceMember);
const originalDiscussionCreate = prisma.discussion.create.bind(prisma.discussion);
const originalDiscussionFindMany = prisma.discussion.findMany.bind(prisma.discussion);
const originalDiscussionFindUnique = prisma.discussion.findUnique.bind(prisma.discussion);
const originalDiscussionUpdate = prisma.discussion.update.bind(prisma.discussion);
const originalDiscussionDelete = prisma.discussion.delete.bind(prisma.discussion);

const state = {
  memberships: new Map(),
  discussions: new Map(),
  users: new Map(),
  redisCounters: new Map(),
  redisKeyValues: new Map(),
  nextDiscussionSeq: 100,
};

function makeCuid(seq) {
  return `c${String(seq).padStart(24, "0")}`;
}

function membershipKey(targetWorkspaceId, userId) {
  return `${targetWorkspaceId}:${userId}`;
}

function createCaller(userId, requestId = `req-${userId.slice(-3)}`) {
  return discussionRouter.createCaller({
    user: { id: userId },
    requestId,
    headers: new Headers(),
    requestMethod: "POST",
    ip: null,
    responseHeaders: new Headers(),
  });
}

function seedMembership(targetWorkspaceId, userId, role) {
  state.memberships.set(membershipKey(targetWorkspaceId, userId), role);
}

function seedUser(userId, name) {
  state.users.set(userId, { id: userId, name });
}

function seedDiscussion({ id, workspaceId: discussionWorkspaceId, authorId, title, body }) {
  const now = new Date();
  state.discussions.set(id, {
    id,
    workspaceId: discussionWorkspaceId,
    authorId,
    title,
    body,
    createdAt: now,
    updatedAt: now,
  });
}

function resetState() {
  state.memberships.clear();
  state.discussions.clear();
  state.redisCounters.clear();
  state.redisKeyValues.clear();
  state.nextDiscussionSeq = 100;
  state.users.clear();

  seedMembership(workspaceId, memberUserId, "MEMBER");
  seedMembership(workspaceId, secondMemberUserId, "MEMBER");
  seedMembership(workspaceId, adminUserId, "ADMIN");
  seedMembership(outsiderWorkspaceId, memberUserId, "MEMBER");

  seedUser(memberUserId, "Member One");
  seedUser(secondMemberUserId, "Member Two");
  seedUser(adminUserId, "Admin One");
  seedUser(nonMemberUserId, "Outside User");
}

beforeEach(() => {
  resetState();
});

// Redis rate-limit + cache mocks.
redis.incr = async (key) => {
  const next = (state.redisCounters.get(key) ?? 0) + 1;
  state.redisCounters.set(key, next);
  return next;
};
redis.expire = async () => 1;
redis.get = async (key) => (state.redisKeyValues.has(key) ? state.redisKeyValues.get(key) : null);
redis.set = async (key, value) => {
  state.redisKeyValues.set(key, value);
  return "OK";
};
redis.del = async (...keys) => {
  let deleted = 0;
  for (const key of keys) {
    if (state.redisKeyValues.delete(key)) {
      deleted += 1;
    }
  }
  return deleted;
};
redis.scanStream = () => {
  async function* generator() {
    yield [];
  }
  return generator();
};

redisCache.getJSON = async (key) => {
  const raw = state.redisKeyValues.get(key);
  return raw ? JSON.parse(raw) : null;
};
redisCache.setJSON = async (key, value) => {
  state.redisKeyValues.set(key, JSON.stringify(value));
};
redisCache.del = async (key) => {
  state.redisKeyValues.delete(key);
};
redisCache.delByPattern = async (pattern) => {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex < 0) {
    state.redisKeyValues.delete(pattern);
    return;
  }

  const prefix = pattern.slice(0, wildcardIndex);
  for (const key of [...state.redisKeyValues.keys()]) {
    if (key.startsWith(prefix)) {
      state.redisKeyValues.delete(key);
    }
  }
};

prisma.workspaceMember.findUnique = async ({ where }) => {
  const role = state.memberships.get(
    membershipKey(where.workspaceId_userId.workspaceId, where.workspaceId_userId.userId),
  );
  return role ? { role } : null;
};
prisma.workspaceMember.findMany = async () => [];

function projectDiscussionWithSelect(row, select) {
  if (!select) {
    return row;
  }

  const selected = {};
  for (const key of Object.keys(select)) {
    if (key === "author" && select.author) {
      const author = state.users.get(row.authorId) ?? { id: row.authorId, name: null };
      selected.author = {
        id: author.id,
        name: author.name,
      };
      continue;
    }
    selected[key] = row[key];
  }
  return selected;
}

prisma.discussion.create = async ({ data, select }) => {
  const id = makeCuid(state.nextDiscussionSeq++);
  const now = new Date();
  const record = {
    id,
    workspaceId: data.workspaceId,
    authorId: data.authorId,
    title: data.title,
    body: data.body,
    createdAt: now,
    updatedAt: now,
  };
  state.discussions.set(id, record);

  return projectDiscussionWithSelect(record, select);
};

prisma.discussion.findMany = async ({ where, take, skip, cursor, select }) => {
  let rows = [...state.discussions.values()].filter(
    (discussion) => discussion.workspaceId === where.workspaceId,
  );
  rows.sort((a, b) => b.id.localeCompare(a.id));

  if (cursor?.id) {
    const cursorIndex = rows.findIndex((row) => row.id === cursor.id);
    if (cursorIndex >= 0) {
      rows = rows.slice(cursorIndex + (skip ?? 0));
    }
  }

  rows = rows.slice(0, take ?? rows.length);

  return rows.map((row) => projectDiscussionWithSelect(row, select));
};

prisma.discussion.findUnique = async ({ where, select }) => {
  const row = state.discussions.get(where.id);
  if (!row) {
    return null;
  }

  return projectDiscussionWithSelect(row, select);
};

prisma.discussion.update = async ({ where, data, select }) => {
  const row = state.discussions.get(where.id);
  if (!row) {
    const error = new Error("Not found");
    error.code = "P2025";
    throw error;
  }
  const updated = {
    ...row,
    ...data,
    updatedAt: new Date(),
  };
  state.discussions.set(where.id, updated);

  return projectDiscussionWithSelect(updated, select);
};

prisma.discussion.delete = async ({ where }) => {
  const row = state.discussions.get(where.id);
  if (!row) {
    const error = new Error("Not found");
    error.code = "P2025";
    throw error;
  }
  state.discussions.delete(where.id);
  return row;
};

after(async () => {
  redis.incr = originalRedisIncr;
  redis.expire = originalRedisExpire;
  redis.get = originalRedisGet;
  redis.set = originalRedisSet;
  redis.del = originalRedisDel;
  redis.scanStream = originalRedisScanStream;

  redisCache.getJSON = originalCacheGetJSON;
  redisCache.setJSON = originalCacheSetJSON;
  redisCache.del = originalCacheDel;
  redisCache.delByPattern = originalCacheDelByPattern;

  prisma.workspaceMember.findUnique = originalWorkspaceMemberFindUnique;
  prisma.workspaceMember.findMany = originalWorkspaceMemberFindMany;
  prisma.discussion.create = originalDiscussionCreate;
  prisma.discussion.findMany = originalDiscussionFindMany;
  prisma.discussion.findUnique = originalDiscussionFindUnique;
  prisma.discussion.update = originalDiscussionUpdate;
  prisma.discussion.delete = originalDiscussionDelete;
  await notificationQueue.close();
  await prisma.$disconnect();
  redis.disconnect();
});

test("1. Non-workspace-member cannot create discussion -> 403", async () => {
  const caller = createCaller(nonMemberUserId);
  await assert.rejects(
    async () =>
      caller.create({
        workspaceId,
        title: "Unauthorized create",
        body: "Forbidden",
      }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("2. Workspace member can create discussion -> 200", async () => {
  const caller = createCaller(memberUserId);
  const created = await caller.create({
    workspaceId,
    title: "Member create",
    body: "This is allowed",
  });

  assert.equal(created.workspaceId, workspaceId);
  assert.equal(created.author.id, memberUserId);
  assert.equal(created.author.name, "Member One");
  assert.equal(created.title, "Member create");
});

test("3. Non-member cannot read discussion -> 403", async () => {
  const discussionId = makeCuid(777);
  seedDiscussion({
    id: discussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Seed",
    body: "Body",
  });

  const caller = createCaller(nonMemberUserId);
  await assert.rejects(
    async () => caller.getById({ discussionId }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("4. Member can read discussion -> 200", async () => {
  const discussionId = makeCuid(778);
  seedDiscussion({
    id: discussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Readable",
    body: "Body",
  });

  const caller = createCaller(secondMemberUserId);
  const discussion = await caller.getById({ discussionId });

  assert.equal(discussion.id, discussionId);
  assert.equal(discussion.workspaceId, workspaceId);
  assert.equal(discussion.author.id, memberUserId);
});

test("5. Author can update own discussion -> 200", async () => {
  const discussionId = makeCuid(779);
  seedDiscussion({
    id: discussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Old title",
    body: "Old body",
  });

  const caller = createCaller(memberUserId);
  const updated = await caller.update({
    discussionId,
    title: "New title",
    body: "New body",
  });

  assert.equal(updated.title, "New title");
  assert.equal(updated.body, "New body");
  assert.equal(updated.author.id, memberUserId);
});

test("6. Non-author member cannot update -> 403", async () => {
  const discussionId = makeCuid(780);
  seedDiscussion({
    id: discussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Author only",
    body: "Body",
  });

  const caller = createCaller(secondMemberUserId);
  await assert.rejects(
    async () =>
      caller.update({
        discussionId,
        title: "Hacked title",
      }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("7. Admin can delete any discussion -> 200", async () => {
  const discussionId = makeCuid(781);
  seedDiscussion({
    id: discussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Delete by admin",
    body: "Body",
  });

  const caller = createCaller(adminUserId);
  const result = await caller.remove({ discussionId });

  assert.equal(result.success, true);
  assert.equal(state.discussions.has(discussionId), false);
});

test("8. Member cannot delete other's discussion -> 403", async () => {
  const discussionId = makeCuid(782);
  seedDiscussion({
    id: discussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Cannot delete",
    body: "Body",
  });

  const caller = createCaller(secondMemberUserId);
  await assert.rejects(
    async () => caller.remove({ discussionId }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("9. Rate limiting applies to create/update/delete -> 429 after threshold", async () => {
  const createCallerMember = createCaller(memberUserId, "req-rate-create");
  for (let i = 0; i < 30; i += 1) {
    await createCallerMember.create({
      workspaceId,
      title: `Create ${i}`,
      body: "Body",
    });
  }
  await assert.rejects(
    async () =>
      createCallerMember.create({
        workspaceId,
        title: "Create overflow",
        body: "Body",
      }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );

  const adminUpdateCaller = createCaller(adminUserId, "req-rate-update");
  const updateDiscussionId = makeCuid(900);
  seedDiscussion({
    id: updateDiscussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Update rate test",
    body: "Body",
  });
  for (let i = 0; i < 40; i += 1) {
    await adminUpdateCaller.update({
      discussionId: updateDiscussionId,
      title: `Updated ${i}`,
    });
  }
  await assert.rejects(
    async () =>
      adminUpdateCaller.update({
        discussionId: updateDiscussionId,
        title: "Update overflow",
      }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );

  const adminDeleteCaller = createCaller(adminUserId, "req-rate-delete");
  for (let i = 0; i < 21; i += 1) {
    seedDiscussion({
      id: makeCuid(1000 + i),
      workspaceId,
      authorId: memberUserId,
      title: `Delete ${i}`,
      body: "Body",
    });
  }
  for (let i = 0; i < 20; i += 1) {
    await adminDeleteCaller.remove({ discussionId: makeCuid(1000 + i) });
  }
  await assert.rejects(
    async () => adminDeleteCaller.remove({ discussionId: makeCuid(1020) }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );
});

test("10. Audit log created on create/update/delete", async () => {
  const logs = [];
  const originalInfo = console.info;
  console.info = (message) => {
    logs.push(String(message));
  };

  try {
    const caller = createCaller(memberUserId, "req-audit-member");
    const created = await caller.create({
      workspaceId,
      title: "Audit create",
      body: "Body",
    });

    await caller.update({
      discussionId: created.id,
      title: "Audit update",
    });

    const adminCaller = createCaller(adminUserId, "req-audit-admin");
    await adminCaller.remove({ discussionId: created.id });
  } finally {
    console.info = originalInfo;
  }

  const auditLogs = logs
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.event === "discussion.audit");

  const actions = auditLogs.map((entry) => entry.action).sort();
  assert.deepEqual(actions, [
    "create",
    "delete",
    "update",
  ]);
});

test("13. Idempotency key prevents duplicate create on retry", async () => {
  const caller = createCaller(memberUserId, "req-idempotency");

  const first = await caller.create({
    workspaceId,
    title: "Idempotent create",
    body: "Body",
    idempotencyKey: "idem-key-123456",
  });

  const second = await caller.create({
    workspaceId,
    title: "Idempotent create changed title should be ignored",
    body: "Body changed",
    idempotencyKey: "idem-key-123456",
  });

  assert.equal(first.id, second.id);
  assert.equal(first.title, second.title);
  assert.equal(state.discussions.size, 1);
});

test("11. Member removed after cache warm-up cannot read cached discussion -> 403", async () => {
  const discussionId = makeCuid(1101);
  seedDiscussion({
    id: discussionId,
    workspaceId,
    authorId: memberUserId,
    title: "Cache revoke",
    body: "Body",
  });

  const memberCaller = createCaller(secondMemberUserId, "req-cache-warm");
  const warm = await memberCaller.getById({ discussionId });
  assert.equal(warm.id, discussionId);

  state.memberships.delete(membershipKey(workspaceId, secondMemberUserId));

  await assert.rejects(
    async () => memberCaller.getById({ discussionId }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("12. Cursor from other workspace cannot leak results or behavior", async () => {
  seedDiscussion({
    id: makeCuid(1201),
    workspaceId,
    authorId: memberUserId,
    title: "Workspace A 1",
    body: "Body",
  });
  seedDiscussion({
    id: makeCuid(1202),
    workspaceId,
    authorId: secondMemberUserId,
    title: "Workspace A 2",
    body: "Body",
  });
  seedDiscussion({
    id: makeCuid(1203),
    workspaceId: outsiderWorkspaceId,
    authorId: memberUserId,
    title: "Workspace B only",
    body: "Body",
  });

  const caller = createCaller(memberUserId, "req-cursor-leak");
  const result = await caller.listByWorkspace({
    workspaceId,
    cursor: makeCuid(1203),
    take: 20,
  });

  assert.equal(result.items.length, 2);
  for (const item of result.items) {
    assert.equal(item.workspaceId, workspaceId);
    assert.notEqual(item.id, makeCuid(1203));
  }
});
