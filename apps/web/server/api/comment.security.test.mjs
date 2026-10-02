import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

import createJiti from "jiti";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/my_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-123456789";

const jiti = createJiti(import.meta.url);

const { commentRouter } = jiti("./routers/comment.router.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis, redisCache } = jiti("../cache/redis.ts");
const { notificationQueue } = jiti("../queue/notification.queue.ts");

const workspaceId = "c100000000000000000000001";
const outsiderWorkspaceId = "c100000000000000000000006";
const discussionId = "c100000000000000000000010";
const outsiderDiscussionId = "c100000000000000000000011";
const memberUserId = "c100000000000000000000002";
const nonMemberUserId = "c100000000000000000000003";
const secondMemberUserId = "c100000000000000000000004";
const adminUserId = "c100000000000000000000005";

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
const originalDiscussionFindUnique = prisma.discussion.findUnique.bind(prisma.discussion);
const originalCommentCreate = prisma.comment.create.bind(prisma.comment);
const originalCommentFindMany = prisma.comment.findMany.bind(prisma.comment);
const originalCommentFindUnique = prisma.comment.findUnique.bind(prisma.comment);
const originalCommentUpdate = prisma.comment.update.bind(prisma.comment);
const originalCommentDelete = prisma.comment.delete.bind(prisma.comment);

const state = {
  memberships: new Map(),
  discussions: new Map(),
  comments: new Map(),
  users: new Map(),
  redisCounters: new Map(),
  redisKeyValues: new Map(),
  nextCommentSeq: 500,
};

function makeCuid(seq) {
  return `c${String(seq).padStart(24, "0")}`;
}

function membershipKey(targetWorkspaceId, userId) {
  return `${targetWorkspaceId}:${userId}`;
}

function createCaller(userId, requestId = `req-${userId.slice(-3)}`) {
  return commentRouter.createCaller({
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

function seedDiscussion({ id, workspaceId: targetWorkspaceId }) {
  state.discussions.set(id, {
    id,
    workspaceId: targetWorkspaceId,
  });
}

function seedComment({ id, discussionId: targetDiscussionId, workspaceId: targetWorkspaceId, authorId, parentCommentId = null, depth = 0, body = "Body" }) {
  const now = new Date();
  state.comments.set(id, {
    id,
    discussionId: targetDiscussionId,
    workspaceId: targetWorkspaceId,
    authorId,
    parentCommentId,
    depth,
    body,
    createdAt: now,
    updatedAt: now,
  });
}

function resetState() {
  state.memberships.clear();
  state.discussions.clear();
  state.comments.clear();
  state.users.clear();
  state.redisCounters.clear();
  state.redisKeyValues.clear();
  state.nextCommentSeq = 500;

  seedMembership(workspaceId, memberUserId, "MEMBER");
  seedMembership(workspaceId, secondMemberUserId, "MEMBER");
  seedMembership(workspaceId, adminUserId, "ADMIN");
  seedMembership(outsiderWorkspaceId, memberUserId, "MEMBER");

  seedUser(memberUserId, "Member One");
  seedUser(secondMemberUserId, "Member Two");
  seedUser(adminUserId, "Admin One");
  seedUser(nonMemberUserId, "Outside User");

  seedDiscussion({ id: discussionId, workspaceId });
  seedDiscussion({ id: outsiderDiscussionId, workspaceId: outsiderWorkspaceId });
}

beforeEach(() => {
  resetState();
});

redis.incr = async (key) => {
  const next = (state.redisCounters.get(key) ?? 0) + 1;
  state.redisCounters.set(key, next);
  return next;
};
redis.expire = async () => 1;
redis.get = async (key) => (state.redisKeyValues.has(key) ? state.redisKeyValues.get(key) : null);
redis.set = async (key, value, ...args) => {
  const hasNx = args.includes("NX");
  if (hasNx && state.redisKeyValues.has(key)) {
    return null;
  }
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

prisma.discussion.findUnique = async ({ where, select }) => {
  const row = state.discussions.get(where.id);
  if (!row) {
    return null;
  }

  if (!select) {
    return row;
  }

  const selected = {};
  for (const key of Object.keys(select)) {
    selected[key] = row[key];
  }
  return selected;
};

function projectCommentWithSelect(row, select) {
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

prisma.comment.create = async ({ data, select }) => {
  const id = makeCuid(state.nextCommentSeq++);
  const now = new Date();
  const record = {
    id,
    discussionId: data.discussionId,
    workspaceId: data.workspaceId,
    authorId: data.authorId,
    parentCommentId: data.parentCommentId ?? null,
    depth: data.depth ?? 0,
    body: data.body,
    createdAt: now,
    updatedAt: now,
  };
  state.comments.set(id, record);
  return projectCommentWithSelect(record, select);
};

prisma.comment.findMany = async ({ where, take, skip, cursor, select }) => {
  let rows = [...state.comments.values()].filter((comment) => {
    if (comment.discussionId !== where.discussionId) {
      return false;
    }
    const whereParent = Object.prototype.hasOwnProperty.call(where, "parentCommentId")
      ? where.parentCommentId
      : undefined;
    if (typeof whereParent === "undefined") {
      return true;
    }
    return comment.parentCommentId === whereParent;
  });

  rows.sort((a, b) => b.id.localeCompare(a.id));

  if (cursor?.id) {
    const cursorIndex = rows.findIndex((row) => row.id === cursor.id);
    if (cursorIndex >= 0) {
      rows = rows.slice(cursorIndex + (skip ?? 0));
    }
  }

  rows = rows.slice(0, take ?? rows.length);
  return rows.map((row) => projectCommentWithSelect(row, select));
};

prisma.comment.findUnique = async ({ where, select }) => {
  const row = state.comments.get(where.id);
  if (!row) {
    return null;
  }
  return projectCommentWithSelect(row, select);
};

prisma.comment.update = async ({ where, data, select }) => {
  const row = state.comments.get(where.id);
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
  state.comments.set(where.id, updated);
  return projectCommentWithSelect(updated, select);
};

prisma.comment.delete = async ({ where }) => {
  const row = state.comments.get(where.id);
  if (!row) {
    const error = new Error("Not found");
    error.code = "P2025";
    throw error;
  }
  state.comments.delete(where.id);
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
  prisma.discussion.findUnique = originalDiscussionFindUnique;
  prisma.comment.create = originalCommentCreate;
  prisma.comment.findMany = originalCommentFindMany;
  prisma.comment.findUnique = originalCommentFindUnique;
  prisma.comment.update = originalCommentUpdate;
  prisma.comment.delete = originalCommentDelete;
  await notificationQueue.close();
  await prisma.$disconnect();
  redis.disconnect();
});

test("1. Non-workspace-member cannot create comment -> 403", async () => {
  const caller = createCaller(nonMemberUserId);
  await assert.rejects(
    async () =>
      caller.create({
        discussionId,
        body: "Unauthorized create",
      }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("2. Workspace member can create comment -> 200", async () => {
  const caller = createCaller(memberUserId);
  const created = await caller.create({
    discussionId,
    body: "This is allowed",
  });

  assert.equal(created.discussionId, discussionId);
  assert.equal(created.author.id, memberUserId);
  assert.equal(created.author.name, "Member One");
});

test("3. Non-member cannot read comment -> 404", async () => {
  const commentId = makeCuid(701);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(nonMemberUserId);
  await assert.rejects(
    async () => caller.getById({ commentId }),
    (error) => error?.code === "NOT_FOUND",
  );
});

test("4. Member can read comment -> 200", async () => {
  const commentId = makeCuid(702);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(secondMemberUserId);
  const comment = await caller.getById({ commentId });
  assert.equal(comment.id, commentId);
  assert.equal(comment.discussionId, discussionId);
});

test("5. Author can update own comment -> 200", async () => {
  const commentId = makeCuid(703);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
    body: "Old body",
  });

  const caller = createCaller(memberUserId);
  const updated = await caller.update({
    commentId,
    body: "New body",
  });

  assert.equal(updated.body, "New body");
  assert.equal(updated.author.id, memberUserId);
});

test("6. Non-author member cannot update -> 403", async () => {
  const commentId = makeCuid(704);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(secondMemberUserId);
  await assert.rejects(
    async () =>
      caller.update({
        commentId,
        body: "Hacked",
      }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("7. Admin can delete any comment -> 200", async () => {
  const commentId = makeCuid(705);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(adminUserId);
  const result = await caller.remove({ commentId });
  assert.equal(result.success, true);
  assert.equal(state.comments.has(commentId), false);
});

test("8. Member cannot delete other's comment -> 403", async () => {
  const commentId = makeCuid(706);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(secondMemberUserId);
  await assert.rejects(
    async () => caller.remove({ commentId }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("9. Rate limiting applies to create/update/delete -> 429 after threshold", async () => {
  const createCallerMember = createCaller(memberUserId, "req-rate-create");
  for (let i = 0; i < 40; i += 1) {
    await createCallerMember.create({
      discussionId,
      body: `Create ${i}`,
    });
  }
  await assert.rejects(
    async () =>
      createCallerMember.create({
        discussionId,
        body: "Create overflow",
      }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );

  const updateCallerAdmin = createCaller(adminUserId, "req-rate-update");
  const updateCommentId = makeCuid(707);
  seedComment({
    id: updateCommentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });
  for (let i = 0; i < 50; i += 1) {
    await updateCallerAdmin.update({
      commentId: updateCommentId,
      body: `Updated ${i}`,
    });
  }
  await assert.rejects(
    async () =>
      updateCallerAdmin.update({
        commentId: updateCommentId,
        body: "Update overflow",
      }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );

  const deleteCallerAdmin = createCaller(adminUserId, "req-rate-delete");
  for (let i = 0; i < 31; i += 1) {
    seedComment({
      id: makeCuid(800 + i),
      discussionId,
      workspaceId,
      authorId: memberUserId,
    });
  }
  for (let i = 0; i < 30; i += 1) {
    await deleteCallerAdmin.remove({ commentId: makeCuid(800 + i) });
  }
  await assert.rejects(
    async () => deleteCallerAdmin.remove({ commentId: makeCuid(830) }),
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
      discussionId,
      body: "Audit create",
    });

    await caller.update({
      commentId: created.id,
      body: "Audit update",
    });

    const adminCaller = createCaller(adminUserId, "req-audit-admin");
    await adminCaller.remove({ commentId: created.id });
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
    .filter((entry) => entry?.event === "comment.audit");

  const actions = auditLogs.map((entry) => entry.action).sort();
  assert.deepEqual(actions, ["create", "delete", "update"]);
});

test("11. Cannot exceed max nesting depth (8) -> error", async () => {
  const parentId = makeCuid(900);
  seedComment({
    id: parentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
    depth: 8,
  });

  const caller = createCaller(memberUserId);
  await assert.rejects(
    async () =>
      caller.create({
        discussionId,
        parentCommentId: parentId,
        body: "Too deep",
      }),
    (error) => error?.code === "BAD_REQUEST",
  );
});

test("12. Cursor pagination works for nested threads", async () => {
  const parentId = makeCuid(910);
  seedComment({
    id: parentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  for (let i = 0; i < 3; i += 1) {
    seedComment({
      id: makeCuid(911 + i),
      discussionId,
      workspaceId,
      authorId: memberUserId,
      parentCommentId: parentId,
      depth: 1,
    });
  }

  const caller = createCaller(memberUserId);
  const page1 = await caller.listByDiscussion({
    discussionId,
    parentCommentId: parentId,
    take: 2,
  });
  assert.equal(page1.items.length, 2);
  assert.equal(typeof page1.nextCursor, "string");

  const page2 = await caller.listByDiscussion({
    discussionId,
    parentCommentId: parentId,
    cursor: page1.nextCursor ?? undefined,
    take: 2,
  });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.nextCursor, null);
});

test("13. Author appears as DTO only (id, name)", async () => {
  const commentId = makeCuid(920);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(memberUserId);
  const comment = await caller.getById({ commentId });
  assert.deepEqual(Object.keys(comment.author).sort(), ["id", "name"]);
  assert.equal("authorId" in comment, false);
});

test("14. Idempotent create with duplicate key", async () => {
  const caller = createCaller(memberUserId, "req-idempotency");

  const first = await caller.create({
    discussionId,
    body: "Idempotent comment",
    idempotencyKey: "comment-idem-12345",
  });
  const second = await caller.create({
    discussionId,
    body: "Changed body should be ignored",
    idempotencyKey: "comment-idem-12345",
  });

  assert.equal(first.id, second.id);
  assert.equal(first.body, second.body);
});

test("15. Member removed from workspace cannot read cached comment", async () => {
  const commentId = makeCuid(930);
  seedComment({
    id: commentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });

  const memberCaller = createCaller(secondMemberUserId, "req-cache-warm");
  const warm = await memberCaller.getById({ commentId });
  assert.equal(warm.id, commentId);

  state.memberships.delete(membershipKey(workspaceId, secondMemberUserId));

  await assert.rejects(
    async () => memberCaller.getById({ commentId }),
    (error) => error?.code === "NOT_FOUND",
  );
});

test("16. Unauthorized foreign-tenant and missing comment return same NOT_FOUND code", async () => {
  const foreignCommentId = makeCuid(940);
  const missingCommentId = makeCuid(941);
  seedComment({
    id: foreignCommentId,
    discussionId: outsiderDiscussionId,
    workspaceId: outsiderWorkspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(secondMemberUserId);

  await assert.rejects(
    async () => caller.getById({ commentId: foreignCommentId }),
    (error) => error?.code === "NOT_FOUND",
  );
  await assert.rejects(
    async () => caller.getById({ commentId: missingCommentId }),
    (error) => error?.code === "NOT_FOUND",
  );

  await assert.rejects(
    async () => caller.update({ commentId: foreignCommentId, body: "x" }),
    (error) => error?.code === "NOT_FOUND",
  );
  await assert.rejects(
    async () => caller.update({ commentId: missingCommentId, body: "x" }),
    (error) => error?.code === "NOT_FOUND",
  );

  await assert.rejects(
    async () => caller.remove({ commentId: foreignCommentId }),
    (error) => error?.code === "NOT_FOUND",
  );
  await assert.rejects(
    async () => caller.remove({ commentId: missingCommentId }),
    (error) => error?.code === "NOT_FOUND",
  );
});

test("17. Cross-discussion cursor cannot leak behavior", async () => {
  seedComment({
    id: makeCuid(950),
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });
  seedComment({
    id: makeCuid(951),
    discussionId,
    workspaceId,
    authorId: secondMemberUserId,
  });
  seedComment({
    id: makeCuid(952),
    discussionId: outsiderDiscussionId,
    workspaceId: outsiderWorkspaceId,
    authorId: memberUserId,
  });

  const caller = createCaller(memberUserId, "req-cursor-cross-discussion");
  const result = await caller.listByDiscussion({
    discussionId,
    cursor: makeCuid(952),
    take: 20,
  });

  assert.equal(result.items.length, 2);
  for (const item of result.items) {
    assert.equal(item.discussionId, discussionId);
    assert.notEqual(item.id, makeCuid(952));
  }
});

test("18. Adaptive strict rate limiting applies after repeated permission denials", async () => {
  const caller = createCaller(memberUserId, "req-adaptive-strict");
  state.redisKeyValues.set(`security:comment_permission_denied:user:${memberUserId}`, "5");

  const getCommentId = makeCuid(960);
  seedComment({
    id: getCommentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });
  for (let i = 0; i < 40; i += 1) {
    await caller.getById({ commentId: getCommentId });
  }
  await assert.rejects(
    async () => caller.getById({ commentId: getCommentId }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );

  const updateCommentId = makeCuid(961);
  seedComment({
    id: updateCommentId,
    discussionId,
    workspaceId,
    authorId: memberUserId,
  });
  for (let i = 0; i < 20; i += 1) {
    await caller.update({ commentId: updateCommentId, body: `b-${i}` });
  }
  await assert.rejects(
    async () => caller.update({ commentId: updateCommentId, body: "overflow" }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );

  for (let i = 0; i < 11; i += 1) {
    seedComment({
      id: makeCuid(970 + i),
      discussionId,
      workspaceId,
      authorId: memberUserId,
    });
  }
  for (let i = 0; i < 10; i += 1) {
    await caller.remove({ commentId: makeCuid(970 + i) });
  }
  await assert.rejects(
    async () => caller.remove({ commentId: makeCuid(980) }),
    (error) => error?.code === "TOO_MANY_REQUESTS",
  );
});
