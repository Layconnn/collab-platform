import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after } from "node:test";

import createJiti from "jiti";

// Invite links against a real database: who may create, list and revoke them,
// what a link reveals, joining (roles, limits, races, already-members), the
// event and the notification, and isolation between workspaces.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { appRouter } = jiti("./root.ts");
const { planNotificationDeliveries } = jiti("../services/notification.service.ts");
const { notificationQueue } = jiti("../queue/notification.queue.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
const enqueued = [];
notificationQueue.add = async (_name, payload, options) => { enqueued.push(payload); return { id: options.jobId }; };

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const ctx = (user) => ({
  user: user ? { id: user.id } : null, requestId: `invite-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, responseHeaders: new Headers(),
});
const app = (user) => appRouter.createCaller(ctx(user));

async function user(name) {
  const unique = suffix().slice(0, 20);
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `inv_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}
async function workspace(owner, members = [], name = `WS ${suffix().slice(0, 6)}`) {
  const ws = await prisma.workspace.create({ data: { name, slug: `inv-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map(([member, role]) => ({ workspaceId: ws.id, userId: member.id, role })),
  ] });
  return ws;
}
async function rejects(promise, code, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (message) assert.match(error.message, message);
    return true;
  });
}

after(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  await notificationQueue.close();
  redis.disconnect();
});

test("owners and admins create links; the token is shown once and stored only as a hash", async () => {
  const [maya, ada, sam] = await Promise.all([user("Maya"), user("Ada"), user("Sam")]);
  const ws = await workspace(maya, [[ada, "ADMIN"], [sam, "MEMBER"]]);

  const created = await app(maya).invite.create({ workspaceId: ws.id, name: "Design team", maxUses: 5 });
  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(created.path, `/join/${created.token}`);
  assert.deepEqual([created.invite.role, created.invite.name, created.invite.maxUses, created.invite.uses, created.invite.status, created.invite.createdBy], ["MEMBER", "Design team", 5, 0, "ACTIVE", "Maya"]);
  const days = (created.invite.expiresAt.getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 6.99 && days <= 7, "seven days by default");
  const stored = await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: created.invite.id } });
  assert.equal(stored.tokenHash, createHash("sha256").update(created.token).digest("hex"));
  assert.equal(JSON.stringify(stored).includes(created.token), false, "the token itself is not stored");

  const adminLink = await app(ada).invite.create({ workspaceId: ws.id, role: "ADMIN", expiresInDays: 1 });
  assert.equal(adminLink.invite.role, "ADMIN");
  await rejects(app(sam).invite.create({ workspaceId: ws.id }), "FORBIDDEN");
  await rejects(app(maya).invite.create({ workspaceId: ws.id, role: "OWNER" }), "BAD_REQUEST");
  await rejects(app(maya).invite.create({ workspaceId: ws.id, expiresInDays: 3 }), "BAD_REQUEST");
  await rejects(app(maya).invite.create({ workspaceId: ws.id, maxUses: 101 }), "BAD_REQUEST");

  const listed = await app(ada).invite.list({ workspaceId: ws.id });
  assert.deepEqual(listed.items.map((invite) => invite.role), ["ADMIN", "MEMBER"], "newest first");
  assert.equal(JSON.stringify(listed).includes(created.token), false, "lists never include tokens");
  await rejects(app(sam).invite.list({ workspaceId: ws.id }), "FORBIDDEN");
});

test("a working link shows where it leads; anything else says nothing about the workspace", async () => {
  const [maya, sam] = await Promise.all([user("Maya Okafor"), user("Sam")]);
  const ws = await workspace(maya, [[sam, "MEMBER"]], "Secret Platform");
  const { token, invite } = await app(maya).invite.create({ workspaceId: ws.id, maxUses: 1 });

  const seen = await app(null).invite.describe({ token });
  assert.deepEqual(seen, { workspace: { id: ws.id, name: "Secret Platform" }, invitedBy: "Maya Okafor", role: "MEMBER", alreadyMember: false });
  assert.equal((await app(sam).invite.describe({ token })).alreadyMember, true);

  const dead = async (label) => {
    await rejects(app(null).invite.describe({ token }), "NOT_FOUND", /no longer works/);
    await assert.rejects(app(null).invite.describe({ token }), (error) => !error.message.includes("Secret"), label);
  };
  await rejects(app(null).invite.describe({ token: "x".repeat(43) }), "NOT_FOUND", /no longer works/);
  await rejects(app(null).invite.describe({ token: "short" }), "BAD_REQUEST");

  await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { uses: 1 } });
  await dead("used up");
  await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { uses: 0, expiresAt: new Date(Date.now() - 1000) } });
  await dead("expired");
  await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
  await app(maya).invite.revoke({ workspaceId: ws.id, inviteId: invite.id });
  await app(maya).invite.revoke({ workspaceId: ws.id, inviteId: invite.id });
  await dead("revoked");
  assert.equal((await app(maya).invite.list({ workspaceId: ws.id })).items.length, 0, "revoked links leave the list");
});

test("joining adds the member with the link's role, records it and tells the link's creator", async () => {
  const [maya, ada, lee, sam] = await Promise.all([user("Maya"), user("Ada"), user("Lee"), user("Sam")]);
  const ws = await workspace(maya, [[ada, "ADMIN"], [sam, "MEMBER"]]);
  const { token, invite } = await app(ada).invite.create({ workspaceId: ws.id, role: "ADMIN", name: "Leads" });

  enqueued.length = 0;
  assert.deepEqual(await app(lee).invite.join({ token }), { workspaceId: ws.id, joined: true });
  const membership = await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: ws.id, userId: lee.id } } });
  assert.equal(membership.role, "ADMIN");
  assert.equal((await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses, 1);
  assert.equal(await prisma.workspaceInviteUse.count({ where: { inviteId: invite.id, userId: lee.id } }), 1);
  const event = await prisma.activityEvent.findFirstOrThrow({ where: { workspaceId: ws.id, kind: "MEMBER_ADDED", subjectId: lee.id } });
  assert.deepEqual([event.actorUserId, event.summary.via, event.summary.inviteName, event.summary.role], [lee.id, "invite", "Leads", "ADMIN"]);
  assert.equal(JSON.stringify(event).includes(token), false, "the event never holds the token");

  const job = enqueued.find((payload) => payload.kind === "invite_accepted");
  assert.ok(job, "the creator's notification is queued");
  assert.equal(JSON.stringify(job).includes(token), false);
  const deliveries = await planNotificationDeliveries(job);
  assert.deepEqual(deliveries.map((delivery) => [delivery.recipientUserId, delivery.type]), [[ada.id, "INVITE_ACCEPTED"]]);
  assert.match(deliveries[0].message, /Lee joined .* with your invite link\./);
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId: ada.id } });
  assert.deepEqual(await planNotificationDeliveries(job), [], "nobody is told once the creator has left");

  // Already a member: no use counted, no role change.
  assert.deepEqual(await app(sam).invite.join({ token }), { workspaceId: ws.id, joined: false });
  assert.equal((await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: ws.id, userId: sam.id } } })).role, "MEMBER");
  assert.equal((await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses, 1);
  assert.deepEqual(await app(lee).invite.join({ token }), { workspaceId: ws.id, joined: false }, "joining twice is harmless");
});

test("a link's last use admits one person even when several join at once", async () => {
  const maya = await user("Maya");
  const ws = await workspace(maya);
  const { token, invite } = await app(maya).invite.create({ workspaceId: ws.id, maxUses: 1 });
  const people = await Promise.all([user("A"), user("B"), user("C"), user("D")]);
  const results = await Promise.allSettled(people.map((person) => app(person).invite.join({ token })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  for (const result of results.filter((candidate) => candidate.status === "rejected")) assert.equal(result.reason.code, "NOT_FOUND");
  assert.equal(await prisma.workspaceMember.count({ where: { workspaceId: ws.id } }), 2);
  assert.equal((await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id } })).uses, 1);
});

test("links stay inside their workspace, and a workspace has at most 20 working links", async () => {
  const [maya, other] = await Promise.all([user("Maya"), user("Other")]);
  const ws = await workspace(maya);
  const theirs = await workspace(other);
  const { invite } = await app(maya).invite.create({ workspaceId: ws.id });
  await rejects(app(other).invite.revoke({ workspaceId: theirs.id, inviteId: invite.id }), "NOT_FOUND");
  await rejects(app(other).invite.revoke({ workspaceId: ws.id, inviteId: invite.id }), "FORBIDDEN");
  await rejects(app(other).invite.list({ workspaceId: ws.id }), "FORBIDDEN");
  assert.equal((await app(other).invite.list({ workspaceId: theirs.id })).items.length, 0);

  // An expired or used-up link does not count toward the limit.
  await prisma.workspaceInvite.create({ data: { workspaceId: ws.id, tokenHash: suffix(), expiresAt: new Date(Date.now() - 1000) } });
  await prisma.workspaceInvite.create({ data: { workspaceId: ws.id, tokenHash: suffix(), maxUses: 1, uses: 1, expiresAt: new Date(Date.now() + 86_400_000) } });
  // Made directly: creating 20 through the API would hit its rate limit first.
  await prisma.workspaceInvite.createMany({ data: Array.from({ length: 18 }, () => ({ workspaceId: ws.id, tokenHash: suffix(), expiresAt: new Date(Date.now() + 86_400_000) })) });
  await app(maya).invite.create({ workspaceId: ws.id });
  await rejects(app(maya).invite.create({ workspaceId: ws.id }), "BAD_REQUEST", /up to 20/);
  await assert.rejects(prisma.workspaceInvite.create({ data: { workspaceId: ws.id, tokenHash: suffix(), role: "OWNER", expiresAt: new Date() } }), "the database refuses an owner link");
  await assert.rejects(prisma.workspaceInvite.create({ data: { workspaceId: ws.id, tokenHash: suffix(), maxUses: 2, uses: 3, expiresAt: new Date() } }), "uses stay within the limit");
});
