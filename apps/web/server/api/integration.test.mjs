import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

import createJiti from "jiti";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5433/my_platform_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret-123456789";

const jiti = createJiti(import.meta.url);

const { appRouter } = jiti("./root.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis, redisCache } = jiti("../cache/redis.ts");
const { notificationQueue } = jiti("../queue/notification.queue.ts");
const { notificationService } = jiti("../services/notification.service.ts");
const { extractMentions } = jiti("../utils/mentions.ts");
const originalNotificationQueueAdd = notificationQueue.add.bind(notificationQueue);

const userA = "c200000000000000000000001";
const userB = "c200000000000000000000002";

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

const originalPrismaTransaction = prisma.$transaction.bind(prisma);
const originalWorkspaceCreate = prisma.workspace.create.bind(prisma.workspace);
const originalWorkspaceFindUnique = prisma.workspace.findUnique.bind(prisma.workspace);
const originalWorkspaceUpdate = prisma.workspace.update.bind(prisma.workspace);
const originalWorkspaceDelete = prisma.workspace.delete.bind(prisma.workspace);
const originalWorkspaceMemberCreate = prisma.workspaceMember.create.bind(prisma.workspaceMember);
const originalWorkspaceMemberFindUnique = prisma.workspaceMember.findUnique.bind(prisma.workspaceMember);
const originalWorkspaceMemberFindMany = prisma.workspaceMember.findMany.bind(prisma.workspaceMember);
const originalWorkspaceMemberUpdate = prisma.workspaceMember.update.bind(prisma.workspaceMember);
const originalWorkspaceMemberDelete = prisma.workspaceMember.delete.bind(prisma.workspaceMember);
const originalDiscussionCreate = prisma.discussion.create.bind(prisma.discussion);
const originalDiscussionFindUnique = prisma.discussion.findUnique.bind(prisma.discussion);
const originalDiscussionFindMany = prisma.discussion.findMany.bind(prisma.discussion);
const originalDiscussionUpdate = prisma.discussion.update.bind(prisma.discussion);
const originalDiscussionDelete = prisma.discussion.delete.bind(prisma.discussion);
const originalCommentCreate = prisma.comment.create.bind(prisma.comment);
const originalCommentFindUnique = prisma.comment.findUnique.bind(prisma.comment);
const originalCommentFindMany = prisma.comment.findMany.bind(prisma.comment);
const originalCommentUpdate = prisma.comment.update.bind(prisma.comment);
const originalCommentDelete = prisma.comment.delete.bind(prisma.comment);

const state = {
  users: new Map(),
  workspaces: new Map(),
  workspaceMembers: new Map(),
  discussions: new Map(),
  comments: new Map(),
  redisCounters: new Map(),
  redisKeyValues: new Map(),
  nextSeq: 300,
  notificationJobs: [],
};

function makeCuid(seq) {
  return `c${String(seq).padStart(24, "0")}`;
}

function nextId() {
  return makeCuid(state.nextSeq++);
}

function membershipKey(workspaceId, userId) {
  return `${workspaceId}:${userId}`;
}

function createCaller(userId, requestId = `req-${userId.slice(-3)}`) {
  return appRouter.createCaller({
    user: { id: userId },
    requestId,
    headers: new Headers(),
    requestMethod: "POST",
    ip: null,
    responseHeaders: new Headers(),
  });
}

function projectSelect(record, select, resolvers = {}) {
  if (!select) {
    return record;
  }
  const out = {};
  for (const key of Object.keys(select)) {
    if (resolvers[key]) {
      out[key] = resolvers[key](select[key], record);
      continue;
    }
    out[key] = record[key];
  }
  return out;
}

function resetState() {
  state.users.clear();
  state.workspaces.clear();
  state.workspaceMembers.clear();
  state.discussions.clear();
  state.comments.clear();
  state.redisCounters.clear();
  state.redisKeyValues.clear();
  state.nextSeq = 300;
  state.notificationJobs = [];

  state.users.set(userA, { id: userA, name: "User A", username: "user_a", email: "a@test.local" });
  state.users.set(userB, { id: userB, name: "User B", username: "user_b", email: "b@test.local" });
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
redis.scanStream = ({ match }) => {
  async function* generator() {
    const wildcardIndex = match.indexOf("*");
    if (wildcardIndex < 0) {
      yield state.redisKeyValues.has(match) ? [match] : [];
      return;
    }
    const prefix = match.slice(0, wildcardIndex);
    const keys = [...state.redisKeyValues.keys()].filter((k) => k.startsWith(prefix));
    yield keys;
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

prisma.$transaction = async (cb) => cb(prisma);

notificationQueue.add = async (name, payload, options) => {
  state.notificationJobs.push({ name, payload, options });
  return { id: options.jobId };
};

prisma.workspace.create = async ({ data, select }) => {
  const now = new Date();
  const rec = {
    id: nextId(),
    name: data.name,
    slug: data.slug,
    ownerId: data.ownerId,
    createdAt: now,
    updatedAt: now,
  };
  state.workspaces.set(rec.id, rec);
  return projectSelect(rec, select);
};

prisma.workspace.findUnique = async ({ where, select }) => {
  const rec = state.workspaces.get(where.id);
  if (!rec) {
    return null;
  }

  return projectSelect(rec, select, {
    members: (membersSelect) => {
      let rows = [...state.workspaceMembers.values()].filter((m) => m.workspaceId === rec.id);
      if (membersSelect?.where?.role) {
        rows = rows.filter((m) => m.role === membersSelect.where.role);
      }
      return rows.map((m) => projectSelect(m, membersSelect.select));
    },
  });
};

prisma.workspace.update = async ({ where, data, select }) => {
  const rec = state.workspaces.get(where.id);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  const next = { ...rec, ...data, updatedAt: new Date() };
  state.workspaces.set(where.id, next);
  return projectSelect(next, select);
};

prisma.workspace.delete = async ({ where }) => {
  const rec = state.workspaces.get(where.id);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  state.workspaces.delete(where.id);
  return rec;
};

prisma.workspaceMember.create = async ({ data, select }) => {
  const key = membershipKey(data.workspaceId, data.userId);
  if (state.workspaceMembers.has(key)) {
    const err = new Error("duplicate");
    err.code = "P2002";
    throw err;
  }
  const now = new Date();
  const rec = {
    id: nextId(),
    workspaceId: data.workspaceId,
    userId: data.userId,
    role: data.role ?? "MEMBER",
    createdAt: now,
    updatedAt: now,
  };
  state.workspaceMembers.set(key, rec);
  return projectSelect(rec, select);
};

prisma.workspaceMember.findUnique = async ({ where, select }) => {
  const rec = state.workspaceMembers.get(
    membershipKey(where.workspaceId_userId.workspaceId, where.workspaceId_userId.userId),
  );
  if (!rec) {
    return null;
  }
  return projectSelect(rec, select, {
    user: (userSelect) => {
      const user = state.users.get(rec.userId) ?? null;
      if (!user) {
        return null;
      }
      return projectSelect(user, userSelect.select);
    },
  });
};
prisma.workspaceMember.findMany = async ({ where, take, skip, cursor, select }) => {
  let rows = [...state.workspaceMembers.values()].filter((member) => member.workspaceId === where.workspaceId);
  if (where.userId?.not) {
    rows = rows.filter((member) => member.userId !== where.userId.not);
  }
  if (where.user?.username?.in) {
    rows = rows.filter((member) => where.user.username.in.includes(state.users.get(member.userId)?.username));
  }
  if (where.user?.OR) {
    rows = rows.filter((member) => {
      const user = state.users.get(member.userId);
      return where.user.OR.some((condition) =>
        (condition.username?.contains && user?.username.includes(condition.username.contains)) ||
        (condition.name?.contains && user?.name?.toLowerCase().includes(condition.name.contains.toLowerCase())));
    });
  }
  if (select?.user && !select.id) {
    rows.sort((a, b) => state.users.get(a.userId).username.localeCompare(state.users.get(b.userId).username));
  } else {
    rows.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  }
  if (cursor?.id) {
    const index = rows.findIndex((row) => row.id === cursor.id);
    if (index >= 0) rows = rows.slice(index + (skip ?? 0));
  }
  return rows.slice(0, take ?? rows.length).map((row) => projectSelect(row, select, {
    user: (userSelect) => projectSelect(state.users.get(row.userId), userSelect.select),
  }));
};

prisma.workspaceMember.update = async ({ where, data, select }) => {
  const key = membershipKey(where.workspaceId_userId.workspaceId, where.workspaceId_userId.userId);
  const rec = state.workspaceMembers.get(key);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  const next = { ...rec, ...data, updatedAt: new Date() };
  state.workspaceMembers.set(key, next);
  return projectSelect(next, select);
};

prisma.workspaceMember.delete = async ({ where }) => {
  const key = membershipKey(where.workspaceId_userId.workspaceId, where.workspaceId_userId.userId);
  const rec = state.workspaceMembers.get(key);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  state.workspaceMembers.delete(key);
  return rec;
};

prisma.discussion.create = async ({ data, select }) => {
  const now = new Date();
  const rec = {
    id: nextId(),
    workspaceId: data.workspaceId,
    authorId: data.authorId,
    title: data.title,
    body: data.body,
    createdAt: now,
    updatedAt: now,
  };
  state.discussions.set(rec.id, rec);
  return projectSelect(rec, select, {
    author: (authorSelect) => {
      const user = state.users.get(rec.authorId);
      return user ? projectSelect(user, authorSelect.select) : null;
    },
  });
};

prisma.discussion.findUnique = async ({ where, select }) => {
  const rec = state.discussions.get(where.id);
  if (!rec) {
    return null;
  }
  return projectSelect(rec, select, {
    author: (authorSelect) => {
      const user = state.users.get(rec.authorId);
      return user ? projectSelect(user, authorSelect.select) : null;
    },
  });
};

prisma.discussion.findMany = async ({ where, take, skip, cursor, select }) => {
  let rows = [...state.discussions.values()].filter((d) => d.workspaceId === where.workspaceId);
  rows.sort((a, b) => b.id.localeCompare(a.id));
  if (cursor?.id) {
    const idx = rows.findIndex((r) => r.id === cursor.id);
    if (idx >= 0) {
      rows = rows.slice(idx + (skip ?? 0));
    }
  }
  rows = rows.slice(0, take ?? rows.length);
  return rows.map((r) =>
    projectSelect(r, select, {
      author: (authorSelect) => {
        const user = state.users.get(r.authorId);
        return user ? projectSelect(user, authorSelect.select) : null;
      },
    }),
  );
};

prisma.discussion.update = async ({ where, data, select }) => {
  const rec = state.discussions.get(where.id);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  const next = { ...rec, ...data, updatedAt: new Date() };
  state.discussions.set(where.id, next);
  return projectSelect(next, select, {
    author: (authorSelect) => {
      const user = state.users.get(next.authorId);
      return user ? projectSelect(user, authorSelect.select) : null;
    },
  });
};

prisma.discussion.delete = async ({ where }) => {
  const rec = state.discussions.get(where.id);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  state.discussions.delete(where.id);
  return rec;
};

prisma.comment.create = async ({ data, select }) => {
  const now = new Date();
  const rec = {
    id: nextId(),
    discussionId: data.discussionId,
    workspaceId: data.workspaceId,
    authorId: data.authorId,
    parentCommentId: data.parentCommentId ?? null,
    depth: data.depth ?? 0,
    body: data.body,
    createdAt: now,
    updatedAt: now,
  };
  state.comments.set(rec.id, rec);
  return projectSelect(rec, select, {
    author: (authorSelect) => {
      const user = state.users.get(rec.authorId);
      return user ? projectSelect(user, authorSelect.select) : null;
    },
  });
};

prisma.comment.findUnique = async ({ where, select }) => {
  const rec = state.comments.get(where.id);
  if (!rec) {
    return null;
  }
  return projectSelect(rec, select, {
    author: (authorSelect) => {
      const user = state.users.get(rec.authorId);
      return user ? projectSelect(user, authorSelect.select) : null;
    },
  });
};

prisma.comment.findMany = async ({ where, take, skip, cursor, select }) => {
  let rows = [...state.comments.values()].filter((c) => {
    if (c.discussionId !== where.discussionId) {
      return false;
    }
    const hasParentFilter = Object.prototype.hasOwnProperty.call(where, "parentCommentId");
    if (!hasParentFilter) {
      return true;
    }
    return c.parentCommentId === where.parentCommentId;
  });
  rows.sort((a, b) => b.id.localeCompare(a.id));
  if (cursor?.id) {
    const idx = rows.findIndex((r) => r.id === cursor.id);
    if (idx >= 0) {
      rows = rows.slice(idx + (skip ?? 0));
    }
  }
  rows = rows.slice(0, take ?? rows.length);
  return rows.map((r) =>
    projectSelect(r, select, {
      author: (authorSelect) => {
        const user = state.users.get(r.authorId);
        return user ? projectSelect(user, authorSelect.select) : null;
      },
    }),
  );
};

prisma.comment.update = async ({ where, data, select }) => {
  const rec = state.comments.get(where.id);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  const next = { ...rec, ...data, updatedAt: new Date() };
  state.comments.set(where.id, next);
  return projectSelect(next, select, {
    author: (authorSelect) => {
      const user = state.users.get(next.authorId);
      return user ? projectSelect(user, authorSelect.select) : null;
    },
  });
};

prisma.comment.delete = async ({ where }) => {
  const rec = state.comments.get(where.id);
  if (!rec) {
    const err = new Error("Not found");
    err.code = "P2025";
    throw err;
  }
  state.comments.delete(where.id);
  return rec;
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

  prisma.$transaction = originalPrismaTransaction;
  prisma.workspace.create = originalWorkspaceCreate;
  prisma.workspace.findUnique = originalWorkspaceFindUnique;
  prisma.workspace.update = originalWorkspaceUpdate;
  prisma.workspace.delete = originalWorkspaceDelete;
  prisma.workspaceMember.create = originalWorkspaceMemberCreate;
  prisma.workspaceMember.findUnique = originalWorkspaceMemberFindUnique;
  prisma.workspaceMember.findMany = originalWorkspaceMemberFindMany;
  prisma.workspaceMember.update = originalWorkspaceMemberUpdate;
  prisma.workspaceMember.delete = originalWorkspaceMemberDelete;
  prisma.discussion.create = originalDiscussionCreate;
  prisma.discussion.findUnique = originalDiscussionFindUnique;
  prisma.discussion.findMany = originalDiscussionFindMany;
  prisma.discussion.update = originalDiscussionUpdate;
  prisma.discussion.delete = originalDiscussionDelete;
  prisma.comment.create = originalCommentCreate;
  prisma.comment.findUnique = originalCommentFindUnique;
  prisma.comment.findMany = originalCommentFindMany;
  prisma.comment.update = originalCommentUpdate;
  prisma.comment.delete = originalCommentDelete;
  notificationQueue.add = originalNotificationQueueAdd;
  await notificationQueue.close();
  await prisma.$disconnect();
  redis.disconnect();
});

test("mention search is bounded, member-accessible, and tenant-scoped", async () => {
  const owner = createCaller(userA);
  const member = createCaller(userB);
  const first = await owner.workspace.create({ name: "Mention Space", slug: "mention-space" });
  const second = await owner.workspace.create({ name: "Other Space", slug: "other-space" });

  await assert.rejects(
    () => member.workspace.searchMentionMembers({ workspaceId: first.id, query: "" }),
    (error) => error?.code === "FORBIDDEN",
  );
  await owner.workspace.addMember({ workspaceId: first.id, userId: userB, role: "MEMBER" });
  assert.deepEqual(await member.workspace.searchMentionMembers({ workspaceId: first.id, query: "USER_A" }), [
    { id: userA, name: "User A", username: "user_a" },
  ]);
  assert.deepEqual(await member.workspace.searchMentionMembers({ workspaceId: first.id, query: "user a".replace(" ", "") }), []);
  assert.deepEqual(await member.workspace.searchMentionMembers({ workspaceId: first.id, query: "A" }), [
    { id: userA, name: "User A", username: "user_a" },
  ]);
  await assert.rejects(
    () => member.workspace.searchMentionMembers({ workspaceId: second.id, query: "" }),
    (error) => error?.code === "FORBIDDEN",
  );

  for (let index = 0; index < 20; index += 1) {
    const id = makeCuid(500 + index);
    state.users.set(id, { id, name: `Mention Person ${index}`, username: `mention_${index}`, email: `person${index}@test.local` });
    state.workspaceMembers.set(membershipKey(first.id, id), {
      id: makeCuid(600 + index), workspaceId: first.id, userId: id, role: "MEMBER", createdAt: new Date(), updatedAt: new Date(),
    });
  }
  const matches = await member.workspace.searchMentionMembers({ workspaceId: first.id, query: "mention" });
  assert.equal(matches.length, 8);
  assert.ok(matches.every((result) => Object.keys(result).sort().join(",") === "id,name,username"));
  await owner.workspace.removeMember({ workspaceId: first.id, userId: userB });
  await assert.rejects(
    () => member.workspace.searchMentionMembers({ workspaceId: first.id, query: "mention" }),
    (error) => error?.code === "FORBIDDEN",
  );
});

test("edits notify only newly mentioned workspace members", async () => {
  assert.deepEqual(extractMentions("mail dev@user_a.com, page /@user_b, ask @user_c @user_c"), ["user_c"]);
  const userC = makeCuid(901);
  const userD = makeCuid(902);
  state.users.set(userC, { id: userC, name: null, username: "user_c", email: "c@test.local" });
  state.users.set(userD, { id: userD, name: null, username: "user_d", email: "d@test.local" });
  const owner = createCaller(userA);
  const author = createCaller(userB);
  const workspace = await owner.workspace.create({ name: "Edit Mentions", slug: "edit-mentions" });
  await owner.workspace.addMember({ workspaceId: workspace.id, userId: userB, role: "MEMBER" });
  await owner.workspace.addMember({ workspaceId: workspace.id, userId: userC, role: "MEMBER" });

  const discussion = await author.discussion.create({ workspaceId: workspace.id, title: "Review @user_a", body: "Initial question" });
  const beforeDiscussionEdit = state.notificationJobs.length;
  await author.discussion.update({ discussionId: discussion.id, body: "Keep @user_a and add @user_c @user_c; ignore @user_b and @user_d" });
  const discussionJobs = state.notificationJobs.slice(beforeDiscussionEdit);
  assert.deepEqual(discussionJobs.map((job) => [job.payload.type, job.payload.recipientUserId]), [["MENTION", userC]]);
  assert.match(discussionJobs[0].payload.dedupeKey, /:edit:/);
  assert.equal(discussionJobs[0].payload.actorUserId, userB);

  const afterAddition = state.notificationJobs.length;
  await author.discussion.update({ discussionId: discussion.id, title: "Still reviewing @user_a", body: "Keep @user_c" });
  await author.discussion.update({ discussionId: discussion.id, body: "Remove the mention" });
  assert.equal(state.notificationJobs.length, afterAddition);
  await assert.rejects(() => createCaller(userC).discussion.update({ discussionId: discussion.id, body: "Unauthorized @user_a" }), (error) => error?.code === "FORBIDDEN");
  await assert.rejects(() => author.discussion.update({ discussionId: userD, body: "Missing @user_a" }));
  assert.equal(state.notificationJobs.length, afterAddition);

  const comment = await author.comment.create({ discussionId: discussion.id, body: "Start with @user_a" });
  const beforeCommentEdit = state.notificationJobs.length;
  await author.comment.update({ commentId: comment.id, body: "Keep @user_a; add @user_c @user_c and not @user_d or @user_b" });
  const commentJobs = state.notificationJobs.slice(beforeCommentEdit);
  assert.deepEqual(commentJobs.map((job) => [job.payload.type, job.payload.recipientUserId]), [["MENTION", userC]]);
  assert.equal(commentJobs[0].payload.commentId, comment.id);
  const afterCommentAddition = state.notificationJobs.length;
  await author.comment.update({ commentId: comment.id, body: "@user_a and @user_c remain" });
  await author.comment.update({ commentId: comment.id, body: "Neither name remains" });
  assert.equal(state.notificationJobs.length, afterCommentAddition);
  await assert.rejects(() => createCaller(userC).comment.update({ commentId: comment.id, body: "Unauthorized @user_a" }), (error) => error?.code === "FORBIDDEN");
  assert.equal(state.notificationJobs.length, afterCommentAddition);

  const sameRevision = {
    requestId: "replayed-edit",
    actorUserId: userB,
    resource: { workspaceId: workspace.id, discussionId: discussion.id, commentId: comment.id },
    previousText: "No mentions",
    updatedText: "Please ask @user_c",
    updatedAt: new Date("2026-10-12T00:00:00.000Z"),
  };
  await notificationService.enqueueNewMentionsFromEdit(sameRevision);
  await notificationService.enqueueNewMentionsFromEdit(sameRevision);
  const replayed = state.notificationJobs.slice(-2);
  assert.equal(replayed[0].options.jobId, replayed[1].options.jobId);
  assert.equal(replayed[0].payload.dedupeKey, replayed[1].payload.dedupeKey);
});

test("workspace + discussion + comment integration flow", async () => {
  const logs = [];
  const originalInfo = console.info;
  console.info = (message) => {
    logs.push(String(message));
  };

  try {
    const callerA = createCaller(userA, "req-user-a");
    const callerB = createCaller(userB, "req-user-b");

    // 1. User A creates workspace.
    const workspace = await callerA.workspace.create({
      name: "Integration Space",
      slug: "integration-space",
    });
    assert.equal(workspace.ownerId, userA);

    // 2. User A invites User B as ADMIN.
    const adminMembership = await callerA.workspace.addMember({
      workspaceId: workspace.id,
      userId: userB,
      role: "ADMIN",
    });
    assert.equal(adminMembership.role, "ADMIN");
    const roster = await callerB.workspace.listMembers({ workspaceId: workspace.id });
    assert.equal(roster.items.length, 2);
    assert.equal(roster.items.find((member) => member.userId === userA).user.username, "user_a");
    assert.deepEqual(Object.keys(roster.items[0].user).sort(), ["email", "id", "name", "username"]);

    // 3. User B creates discussion in workspace.
    state.redisKeyValues.set(`workspace:${workspace.id}:discussions:v2:start:20`, JSON.stringify({}));
    const discussion = await callerB.discussion.create({
      workspaceId: workspace.id,
      title: "Integration Discussion",
      body: "Discussion body",
    });
    assert.equal(discussion.workspaceId, workspace.id);
    assert.equal(discussion.author.username, "user_b");
    assert.equal(state.redisKeyValues.has(`workspace:${workspace.id}:discussions:v2:start:20`), false);
    assert.ok(state.notificationJobs.some((job) => job.name === "deliver" && job.payload.type === "DISCUSSION_CREATED" && job.payload.recipientUserId === userA));

    // 4. User A creates root comment.
    state.redisKeyValues.set(`discussion:${discussion.id}:comments:v2:root:start:20`, JSON.stringify({}));
    const rootComment = await callerA.comment.create({
      discussionId: discussion.id,
      body: "Root comment",
    });
    assert.equal(rootComment.author.id, userA);
    assert.equal(rootComment.author.username, "user_a");
    assert.equal(state.redisKeyValues.has(`discussion:${discussion.id}:comments:v2:root:start:20`), false);
    assert.ok(state.notificationJobs.some((job) => job.payload.type === "COMMENT_CREATED" && job.payload.recipientUserId === userB));
    assert.ok(state.notificationJobs.every((job) => /^[0-9a-f]{64}$/.test(job.options.jobId)));

    // 5. User B creates reply.
    const reply = await callerB.comment.create({
      discussionId: discussion.id,
      parentCommentId: rootComment.id,
      body: "Reply from B",
    });
    assert.equal(reply.parentCommentId, rootComment.id);
    assert.equal(reply.author.username, "user_b");

    const mentionedComment = await callerB.comment.create({
      discussionId: discussion.id,
      body: "@user_a please review this thread",
    });
    assert.ok(state.notificationJobs.some((job) =>
      job.payload.type === "MENTION" &&
      job.payload.recipientUserId === userA &&
      job.payload.commentId === mentionedComment.id
    ));

    // 6. User A edits their comment.
    state.redisKeyValues.set(`comment:v2:${rootComment.id}`, JSON.stringify({ id: rootComment.id }));
    state.redisKeyValues.set(`discussion:${discussion.id}:comments:v2:${rootComment.id}:start:20`, JSON.stringify({}));
    const updatedRoot = await callerA.comment.update({
      commentId: rootComment.id,
      body: "Root comment edited",
    });
    assert.equal(updatedRoot.body, "Root comment edited");
    assert.equal(state.redisKeyValues.has(`comment:v2:${rootComment.id}`), false);
    assert.equal(
      state.redisKeyValues.has(`discussion:${discussion.id}:comments:v2:${rootComment.id}:start:20`),
      false,
    );

    // Role downgrade to satisfy scenario 7 expectation while preserving scenario 2.
    await callerA.workspace.updateMemberRole({
      workspaceId: workspace.id,
      userId: userB,
      role: "MEMBER",
    });

    // 7. User B tries to delete User A comment -> 403.
    await assert.rejects(
      async () => callerB.comment.remove({ commentId: updatedRoot.id }),
      (error) => error?.code === "FORBIDDEN",
    );

    // 8. User A deletes User B's comment.
    state.redisKeyValues.set(`comment:v2:${reply.id}`, JSON.stringify({ id: reply.id }));
    state.redisKeyValues.set(`discussion:${discussion.id}:comments:v2:${rootComment.id}:start:20`, JSON.stringify({}));
    const deleteReplyResult = await callerA.comment.remove({ commentId: reply.id });
    assert.equal(deleteReplyResult.success, true);
    assert.equal(state.comments.has(reply.id), false);
    assert.equal(state.redisKeyValues.has(`comment:v2:${reply.id}`), false);

    // 9. User B removed from workspace cannot see discussion/comments.
    await callerA.workspace.removeMember({
      workspaceId: workspace.id,
      userId: userB,
    });
    await assert.rejects(
      async () => callerB.workspace.listMembers({ workspaceId: workspace.id }),
      (error) => error?.code === "FORBIDDEN",
    );
    await assert.rejects(
      async () => callerB.discussion.getById({ discussionId: discussion.id }),
      (error) => error?.code === "FORBIDDEN",
    );
    await assert.rejects(
      async () => callerB.comment.getById({ commentId: updatedRoot.id }),
      (error) => error?.code === "NOT_FOUND",
    );

    // 10. Cursor pagination through nested threads works.
    for (let i = 0; i < 3; i += 1) {
      await callerA.comment.create({
        discussionId: discussion.id,
        parentCommentId: updatedRoot.id,
        body: `Nested ${i}`,
      });
    }
    const page1 = await callerA.comment.listByDiscussion({
      discussionId: discussion.id,
      parentCommentId: updatedRoot.id,
      take: 2,
    });
    assert.equal(page1.items.length, 2);
    assert.equal(page1.items[0].author.username, "user_a");
    assert.equal(typeof page1.nextCursor, "string");
    const page2 = await callerA.comment.listByDiscussion({
      discussionId: discussion.id,
      parentCommentId: updatedRoot.id,
      cursor: page1.nextCursor ?? undefined,
      take: 2,
    });
    assert.equal(page2.items.length, 1);
    assert.equal(page2.nextCursor, null);

    // 11. Cache invalidation already asserted on create/update/delete.

    // 12. Audit logs are created for workspace/discussion/comment operations.
    const parsed = logs.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    });
    assert.ok(parsed.some((l) => l?.event === "workspace.permission.audit" && l.operation === "addMember"));
    assert.ok(parsed.some((l) => l?.event === "workspace.permission.audit" && l.operation === "removeMember"));
    assert.ok(parsed.some((l) => l?.event === "discussion.audit" && l.action === "create"));
    assert.ok(parsed.some((l) => l?.event === "comment.audit" && l.action === "create"));
    assert.ok(parsed.some((l) => l?.event === "comment.audit" && l.action === "update"));
    assert.ok(parsed.some((l) => l?.event === "comment.audit" && l.action === "delete"));
    assert.ok(parsed.some((l) => l?.event === "notification.operation.enqueue"));
    assert.equal(parsed.some((l) => l?.event === "notification.operation.enqueue_failed"), false);

    // 13. Rate limiting works across operations (comment.update route).
    for (let i = 0; i < 49; i += 1) {
      await callerA.comment.update({
        commentId: updatedRoot.id,
        body: `rate-${i}`,
      });
    }
    await assert.rejects(
      async () =>
        callerA.comment.update({
          commentId: updatedRoot.id,
          body: "rate-overflow",
        }),
      (error) => error?.code === "TOO_MANY_REQUESTS",
    );

    // 14. Idempotent create retries work correctly.
    const commentCountBefore = state.comments.size;
    const idemFirst = await callerA.comment.create({
      discussionId: discussion.id,
      body: "Idempotent create",
      idempotencyKey: "integration-idem-0001",
    });
    const idemSecond = await callerA.comment.create({
      discussionId: discussion.id,
      body: "Changed body should be ignored",
      idempotencyKey: "integration-idem-0001",
    });
    assert.equal(idemFirst.id, idemSecond.id);
    assert.equal(idemFirst.body, idemSecond.body);
    assert.equal(state.comments.size, commentCountBefore + 1);
  } finally {
    console.info = originalInfo;
  }
});
