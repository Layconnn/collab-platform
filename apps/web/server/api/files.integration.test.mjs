import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, beforeEach } from "node:test";

import createJiti from "jiti";

// File uploads against a real database and in-memory storage: upload URLs,
// limits and types, verifying and claiming uploads, downloads only for
// members, and the clean-up of removed and expired files.
const databaseUrl = process.env.DECISION_TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_decision_test")) {
  throw new Error("Set DECISION_TEST_DATABASE_URL to an isolated database ending in _decision_test.");
}
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { attachmentRouter } = jiti("./routers/attachment.router.ts");
const { attachmentService, contentDisposition, PENDING_TTL_MS } = jiti("../services/files/attachment.service.ts");
const { createMemoryStorage, setStorageForTests } = jiti("../services/files/storage.ts");
const { appRouter } = jiti("./root.ts");
const { notificationQueue } = jiti("../queue/notification.queue.ts");
const { prisma } = jiti("../db/prisma.ts");
const { redis } = jiti("../cache/redis.ts");
redis.incr = async () => 1;
redis.expire = async () => 1;
const enqueued = [];
notificationQueue.add = async (name, payload, options) => { enqueued.push(payload); return { id: options.jobId }; };

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
let storage;
beforeEach(() => {
  storage = createMemoryStorage();
  setStorageForTests(storage);
});

const suffix = () => randomUUID().replaceAll("-", "");
const createdUserIds = [];
const app = (user) => appRouter.createCaller({
  user: { id: user.id }, requestId: `files-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});
const caller = (user) => attachmentRouter.createCaller({
  user: { id: user.id }, requestId: `files-test-${suffix()}`, headers: new Headers(),
  requestMethod: "POST", ip: null, responseHeaders: new Headers(),
});

async function user(name) {
  const unique = suffix();
  const created = await prisma.user.create({ data: { email: `${unique}@example.test`, username: `fl_${unique}`, name } });
  createdUserIds.push(created.id);
  return created;
}
async function workspace(owner, members = []) {
  const ws = await prisma.workspace.create({ data: { name: `WS ${suffix().slice(0, 6)}`, slug: `files-${suffix()}`, ownerId: owner.id } });
  await prisma.workspaceMember.createMany({ data: [
    { workspaceId: ws.id, userId: owner.id, role: "OWNER" },
    ...members.map((member) => ({ workspaceId: ws.id, userId: member.id, role: "MEMBER" })),
  ] });
  return ws;
}
const discussion = (ws, author) => prisma.discussion.create({ data: { workspaceId: ws.id, authorId: author.id, title: "Which logo?", body: "See the files." } });
const decision = (ws, author) => prisma.decision.create({ data: {
  workspaceId: ws.id, createdById: author.id, createdByLabel: author.name, question: "Use logo B", sourceDiscussionTitle: "Source", idempotencyKey: suffix(),
} });

// Requests an upload URL and "uploads" the bytes, as the browser would.
async function upload(member, ws, fileName, body = PNG, size = body.byteLength) {
  const result = await caller(member).createUpload({ workspaceId: ws.id, fileName, size });
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id: result.attachmentId } });
  storage.put(row.key, body, row.contentType);
  return { ...result, key: row.key };
}
async function attachTo(member, ws, ids, target) {
  await attachmentService.verifyUploads(member.id, ws.id, ids);
  await prisma.$transaction((tx) => attachmentService.attach(tx, { userId: member.id, workspaceId: ws.id, attachmentIds: ids, target }));
}

async function rejects(promise, code, message) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (message) assert.match(error.message, message);
    return true;
  });
}

after(async () => {
  setStorageForTests(undefined);
  await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUserIds } } });
  for (const id of createdUserIds.reverse()) await prisma.user.deleteMany({ where: { id } });
  await prisma.$disconnect();
  await notificationQueue.close();
  redis.disconnect();
});

test("upload URLs: members only, allowed types by extension, size and workspace limits", async () => {
  const [maya, outsider] = await Promise.all([user("Maya"), user("Out")]);
  const ws = await workspace(maya);

  const csv = await caller(maya).createUpload({ workspaceId: ws.id, fileName: "Numbers.CSV", size: 2048 });
  assert.match(csv.uploadUrl, /^memory:\/\/upload\/files\//);
  assert.match(csv.uploadUrl, /type=text%2Fcsv&size=2048&expires=600/, "the URL is for this type and size, for 10 minutes");
  assert.deepEqual(csv.headers, { "content-type": "text/csv" }, "the type comes from the extension, not the browser");
  const row = await prisma.attachment.findUniqueOrThrow({ where: { id: csv.attachmentId } });
  assert.equal(row.status, "PENDING");
  assert.match(row.key, new RegExp(`^files/${ws.id}/[A-Za-z0-9_-]{24}$`), "keys are random and carry no file name");

  for (const fileName of ["logo.svg", "page.html", "setup.exe", "noextension"]) {
    await rejects(caller(maya).createUpload({ workspaceId: ws.id, fileName, size: 10 }), "BAD_REQUEST", /cannot be attached/);
  }
  await rejects(caller(maya).createUpload({ workspaceId: ws.id, fileName: "big.pdf", size: 10 * 1024 * 1024 + 1 }), "BAD_REQUEST");
  await rejects(caller(maya).createUpload({ workspaceId: ws.id, fileName: "../x.pdf", size: 10 }), "BAD_REQUEST");
  await rejects(caller(outsider).createUpload({ workspaceId: ws.id, fileName: "a.pdf", size: 10 }), "NOT_FOUND");

  // The workspace total counts pending uploads too.
  await prisma.attachment.create({ data: { workspaceId: ws.id, uploaderId: maya.id, key: `files/${ws.id}/filler-${suffix()}`, fileName: "filler.zip", contentType: "application/zip", size: 1024 * 1024 * 1024 - 4096 } });
  await caller(maya).createUpload({ workspaceId: ws.id, fileName: "fits.pdf", size: 2048 - 1 });
  await rejects(caller(maya).createUpload({ workspaceId: ws.id, fileName: "over.pdf", size: 10 }), "BAD_REQUEST", /1 GB/);

  setStorageForTests(null);
  await rejects(caller(maya).createUpload({ workspaceId: ws.id, fileName: "a.pdf", size: 10 }), "BAD_REQUEST", /not switched on/);
  assert.deepEqual(await caller(maya).config(), { enabled: false });
});

test("two uploads racing for the last space: only one gets it", async () => {
  const maya = await user("Maya");
  const ws = await workspace(maya);
  await prisma.attachment.create({ data: { workspaceId: ws.id, uploaderId: maya.id, key: `files/${ws.id}/filler-${suffix()}`, fileName: "filler.zip", contentType: "application/zip", size: 1024 * 1024 * 1024 - 1500 } });
  const results = await Promise.allSettled([1, 2, 3].map(() => caller(maya).createUpload({ workspaceId: ws.id, fileName: "a.pdf", size: 1000 })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
});

test("claiming uploads: only the uploader's own, finished, recent uploads in the same workspace", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const other = await workspace(maya);
  const d = await discussion(ws, maya);

  const first = await upload(maya, ws, "screen.png");
  const second = await upload(maya, ws, "spec.pdf", new TextEncoder().encode("%PDF-1.7"));
  const missing = await caller(maya).createUpload({ workspaceId: ws.id, fileName: "never.pdf", size: 50 });
  const wrongSize = await upload(maya, ws, "short.pdf", new TextEncoder().encode("%PDF"), 4000);
  const fakeImage = await upload(maya, ws, "fake.png", new TextEncoder().encode("<svg onload=alert(1)>"));
  const samsFile = await upload(sam, ws, "sams.png");
  const elsewhere = await upload(maya, other, "other.png");

  await rejects(attachmentService.verifyUploads(maya.id, ws.id, [missing.attachmentId]), "BAD_REQUEST", /did not finish/);
  await rejects(attachmentService.verifyUploads(maya.id, ws.id, [wrongSize.attachmentId]), "BAD_REQUEST", /did not finish/);
  await rejects(attachmentService.verifyUploads(maya.id, ws.id, [fakeImage.attachmentId]), "BAD_REQUEST", /image could not be read/);
  await rejects(attachmentService.verifyUploads(maya.id, ws.id, [samsFile.attachmentId]), "BAD_REQUEST", /no longer available/);
  await rejects(attachmentService.verifyUploads(maya.id, ws.id, [elsewhere.attachmentId]), "BAD_REQUEST", /no longer available/);
  await rejects(attachmentService.verifyUploads(maya.id, ws.id, Array.from({ length: 11 }, (_, i) => `id-${i}`)), "BAD_REQUEST", /up to 10/);
  const later = new Date(Date.now() + PENDING_TTL_MS + 1000);
  await rejects(attachmentService.verifyUploads(maya.id, ws.id, [first.attachmentId], { now: later }), "BAD_REQUEST", /no longer available/);

  await attachTo(maya, ws, [second.attachmentId, first.attachmentId], { discussionId: d.id });
  const attached = await prisma.attachment.findMany({ where: { discussionId: d.id }, orderBy: { position: "asc" } });
  assert.deepEqual(attached.map((row) => [row.fileName, row.status, row.position]), [["spec.pdf", "ATTACHED", 0], ["screen.png", "ATTACHED", 1]]);
  await rejects(prisma.$transaction((tx) => attachmentService.attach(tx, { userId: maya.id, workspaceId: ws.id, attachmentIds: [first.attachmentId], target: { discussionId: d.id } })), "BAD_REQUEST", /no longer available/);

  // The database refuses a file attached to a post in another workspace.
  const foreign = await discussion(other, maya);
  await assert.rejects(prisma.attachment.update({ where: { id: samsFile.attachmentId }, data: { status: "ATTACHED", discussionId: foreign.id } }));
  await assert.rejects(prisma.attachment.update({ where: { id: samsFile.attachmentId }, data: { status: "ATTACHED" } }), "attached files need a post");
});

test("downloads: members who can read the post, through a short-lived URL", async () => {
  const [maya, sam, outsider] = await Promise.all([user("Maya"), user("Sam"), user("Out")]);
  const ws = await workspace(maya, [sam]);
  const d = await discussion(ws, maya);
  const dec = await decision(ws, maya);
  const image = await upload(maya, ws, "Logo B.png");
  const pdf = await upload(maya, ws, "Résumé \"final\".pdf", new TextEncoder().encode("%PDF-1.7"));
  const onDecision = await upload(maya, ws, "pricing.xlsx", new TextEncoder().encode("PK"));
  await attachTo(maya, ws, [image.attachmentId, pdf.attachmentId], { discussionId: d.id });
  await attachTo(maya, ws, [onDecision.attachmentId], { decisionId: dec.id });

  const imageUrl = await attachmentService.downloadUrl(sam.id, image.attachmentId);
  assert.match(imageUrl, new RegExp(`^memory://download/${image.key}\\?type=image%2Fpng&disposition=inline`), "images open in the browser");
  assert.match(imageUrl, /expires=300$/, "for 5 minutes");
  assert.match(await attachmentService.downloadUrl(sam.id, image.attachmentId, { download: true }), /disposition=attachment/, "an image can be downloaded too");
  const pdfUrl = new URL(await attachmentService.downloadUrl(sam.id, pdf.attachmentId).then((url) => url.replace("memory://", "http://x/")));
  assert.equal(pdfUrl.searchParams.get("disposition"), contentDisposition("attachment", "Résumé \"final\".pdf"));
  assert.equal(contentDisposition("attachment", "Résumé \"final\".pdf"), "attachment; filename=\"R_sum_ _final_.pdf\"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf");
  assert.match(await attachmentService.downloadUrl(sam.id, onDecision.attachmentId), /disposition=attachment/);

  await rejects(attachmentService.downloadUrl(outsider.id, image.attachmentId), "NOT_FOUND");
  await rejects(attachmentService.downloadUrl(sam.id, "no-such-file"), "NOT_FOUND");
  const pending = await upload(maya, ws, "draft.png");
  await rejects(attachmentService.downloadUrl(maya.id, pending.attachmentId), "NOT_FOUND", undefined);

  await prisma.decision.update({ where: { id: dec.id }, data: { deletedAt: new Date() } });
  await rejects(attachmentService.downloadUrl(maya.id, onDecision.attachmentId), "NOT_FOUND");
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id, userId: sam.id } });
  await rejects(attachmentService.downloadUrl(sam.id, image.attachmentId), "NOT_FOUND", undefined);
});

test("clean-up: expired uploads and files of deleted posts and workspaces leave storage", async () => {
  const maya = await user("Maya");
  const ws = await workspace(maya);
  const doomed = await workspace(maya);
  const d = await discussion(ws, maya);
  const kept = await discussion(ws, maya);
  const removed = await upload(maya, ws, "removed.png");
  const stays = await upload(maya, ws, "stays.png");
  const fresh = await upload(maya, ws, "fresh.png");
  const stale = await upload(maya, ws, "stale.png");
  const inDoomed = await upload(maya, doomed, "doomed.png");
  await attachTo(maya, ws, [removed.attachmentId], { discussionId: d.id });
  await attachTo(maya, ws, [stays.attachmentId], { discussionId: kept.id });
  await prisma.attachment.update({ where: { id: stale.attachmentId }, data: { createdAt: new Date(Date.now() - PENDING_TTL_MS - 1000) } });

  await prisma.discussion.delete({ where: { id: d.id } });
  await prisma.workspace.delete({ where: { id: doomed.id } });
  assert.deepEqual((await prisma.deletedFile.findMany({ where: { key: { in: [removed.key, inDoomed.key] } } })).length, 2, "deleting a post or workspace queues its files");

  // A storage failure leaves the key queued for the next run.
  const realDelete = storage.delete;
  storage.delete = async (key) => { if (key === inDoomed.key) throw new Error("storage down"); return realDelete(key); };
  const first = await attachmentService.cleanup({ deadline: Date.now() + 10_000 });
  assert.equal(first.expired >= 1, true);
  assert.equal(first.failed >= 1, true);
  assert.equal(first.done, true);
  assert.equal(storage.objects.has(removed.key), false);
  assert.equal(storage.objects.has(stale.key), false, "expired pending uploads are deleted");
  assert.equal(storage.objects.has(inDoomed.key), true);
  assert.equal(await prisma.deletedFile.count({ where: { key: inDoomed.key } }), 1);

  storage.delete = realDelete;
  await attachmentService.cleanup({ deadline: Date.now() + 10_000 });
  assert.equal(storage.objects.has(inDoomed.key), false);
  assert.equal(await prisma.deletedFile.count({ where: { key: { in: [removed.key, stale.key, inDoomed.key] } } }), 0);
  assert.equal(storage.objects.has(stays.key), true, "files still in use stay");
  assert.equal(storage.objects.has(fresh.key), true, "recent pending uploads stay");
  assert.equal(await prisma.attachment.count({ where: { id: fresh.attachmentId } }), 1);
});

test("discussions and replies: attach on create, change on edit, file-only replies", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const shot = await upload(maya, ws, "shot.png");
  const spec = await upload(maya, ws, "spec.pdf", new TextEncoder().encode("%PDF-1.7"));

  const d = await app(maya).discussion.create({ workspaceId: ws.id, title: "Which logo?", body: "Two options.", attachmentIds: [spec.attachmentId, shot.attachmentId] });
  assert.deepEqual(d.attachments.map((file) => file.fileName), ["spec.pdf", "shot.png"]);
  const read = await app(sam).discussion.getById({ discussionId: d.id });
  assert.deepEqual(read.attachments.map((file) => [file.fileName, file.contentType, file.size]), [["spec.pdf", "application/pdf", 8], ["shot.png", "image/png", PNG.byteLength]]);
  const created = await prisma.activityEvent.findFirstOrThrow({ where: { subjectId: d.id, kind: "DISCUSSION_CREATED" } });
  assert.equal(created.summary.files, 2, "the event log records files");

  // Someone else's upload cannot be attached, and nothing is created.
  const samsShot = await upload(sam, ws, "sams.png");
  await rejects(app(maya).discussion.create({ workspaceId: ws.id, title: "Stolen", body: "x", attachmentIds: [samsShot.attachmentId] }), "BAD_REQUEST");
  assert.equal(await prisma.discussion.count({ where: { workspaceId: ws.id, title: "Stolen" } }), 1 - 1);

  // Edit: drop the PDF, add a new image, keep the order given.
  const extra = await upload(maya, ws, "extra.png");
  const edited = await app(maya).discussion.update({ discussionId: d.id, attachmentIds: [extra.attachmentId, shot.attachmentId] });
  assert.deepEqual(edited.attachments.map((file) => file.fileName), ["extra.png", "shot.png"]);
  assert.equal(await prisma.deletedFile.count({ where: { key: spec.key } }), 1, "the removed file is queued for deletion");
  const updatedEvent = await prisma.activityEvent.findFirstOrThrow({ where: { subjectId: d.id, kind: "DISCUSSION_UPDATED" } });
  assert.deepEqual([updatedEvent.summary.filesAdded, updatedEvent.summary.filesRemoved], [1, 1]);
  await rejects(app(sam).discussion.update({ discussionId: d.id, attachmentIds: [] }), "FORBIDDEN");

  // A reply with only a file; its notification names the file.
  const replyFile = await upload(sam, ws, "answer.png");
  enqueued.length = 0;
  const reply = await app(sam).comment.create({ discussionId: d.id, body: "", attachmentIds: [replyFile.attachmentId] });
  assert.equal(reply.body, "");
  assert.deepEqual(reply.attachments.map((file) => file.fileName), ["answer.png"]);
  assert.equal(enqueued.some((job) => JSON.stringify(job).includes("answer.png")), true);
  const listed = await app(maya).comment.listByDiscussion({ discussionId: d.id, take: 20 });
  assert.deepEqual(listed.items[0].attachments.map((file) => file.fileName), ["answer.png"]);
  await assert.rejects(app(sam).comment.create({ discussionId: d.id, body: "  " }), "a reply needs text or a file");
  await rejects(app(sam).comment.update({ commentId: reply.id, body: "", attachmentIds: [] }), "BAD_REQUEST", /reply or attach/);
  const kept = await app(sam).comment.update({ commentId: reply.id, body: "Here it is", attachmentIds: [] });
  assert.deepEqual(kept.attachments, []);
  await rejects(app(sam).comment.update({ commentId: reply.id, body: "" }), "BAD_REQUEST", /reply or attach/);

  // Deleting the discussion queues every file still on it.
  await app(maya).discussion.remove({ discussionId: d.id });
  assert.equal(await prisma.deletedFile.count({ where: { key: { in: [extra.key, shot.key, replyFile.key] } } }), 3);
});

test("decisions: files on create and edit, revision snapshots, finalized records locked, counts elsewhere", async () => {
  const [maya, sam] = await Promise.all([user("Maya"), user("Sam")]);
  const ws = await workspace(maya, [sam]);
  const d = await discussion(ws, maya);
  const sheet = await upload(sam, ws, "pricing.xlsx", new TextEncoder().encode("PK"));
  const brief = await upload(sam, ws, "brief.pdf", new TextEncoder().encode("%PDF-1.7"));

  const created = await app(sam).decision.create({
    workspaceId: ws.id, sourceDiscussionId: d.id, question: "Ship pricing B", outcome: "B", rationale: "Simpler.",
    attachmentIds: [sheet.attachmentId, brief.attachmentId], idempotencyKey: `key-${suffix()}`,
  });
  assert.deepEqual(created.attachments.map((file) => file.fileName), ["pricing.xlsx", "brief.pdf"]);
  const read = await app(maya).decision.getById({ workspaceId: ws.id, decisionId: created.id });
  assert.deepEqual(read.attachments.map((file) => file.fileName), ["pricing.xlsx", "brief.pdf"]);
  assert.equal((await app(maya).decision.listByWorkspace({ workspaceId: ws.id, take: 20 })).items[0].attachments.length, 2);

  // A reviewer's approval is asked again when only the files change.
  await app(sam).decisionReview.request({ workspaceId: ws.id, decisionId: created.id, reviewerIds: [maya.id] });
  const version = async () => (await prisma.decision.findUniqueOrThrow({ where: { id: created.id } })).version;
  await app(maya).decisionReview.respond({ workspaceId: ws.id, decisionId: created.id, expectedVersion: await version(), response: "APPROVED" });
  const edited = await app(sam).decision.edit({ workspaceId: ws.id, decisionId: created.id, expectedVersion: await version(), attachmentIds: [brief.attachmentId] });
  assert.deepEqual(edited.attachments.map((file) => file.fileName), ["brief.pdf"]);
  const review = await prisma.decisionReview.findFirstOrThrow({ where: { decisionId: created.id, reviewerId: maya.id } });
  assert.equal(review.state, "PENDING", "changing the files asks reviewers again");
  const revisions = (await app(maya).decision.revisions({ workspaceId: ws.id, decisionId: created.id, take: 20 })).items;
  assert.deepEqual(revisions.map((revision) => [revision.action, revision.fileNames]), [["CREATE", ["pricing.xlsx", "brief.pdf"]], ["EDIT", ["brief.pdf"]]]);
  assert.equal(await prisma.deletedFile.count({ where: { key: sheet.key } }), 1);

  const finalized = await app(maya).decision.finalize({ workspaceId: ws.id, decisionId: created.id, expectedVersion: edited.version, overrideReason: "Ship before the review closes." });
  assert.deepEqual((await prisma.decisionRevision.findFirstOrThrow({ where: { decisionId: created.id, action: "FINALIZE" } })).fileNames, ["brief.pdf"]);
  const late = await upload(sam, ws, "late.pdf", new TextEncoder().encode("%PDF-1.7"));
  await rejects(app(sam).decision.edit({ workspaceId: ws.id, decisionId: created.id, expectedVersion: finalized.version, attachmentIds: [brief.attachmentId, late.attachmentId] }), "CONFLICT");
  assert.equal((await prisma.attachment.findUniqueOrThrow({ where: { id: late.attachmentId } })).status, "PENDING", "nothing is claimed by a refused edit");

  // Counts, never content: Home, search and the discussion list.
  const recent = await app(maya).home.recentDecisions();
  assert.equal(recent.decisions.find((item) => item.decisionId === created.id).files, 1);
  const found = await app(maya).search.query({ query: "pricing", take: 10 });
  assert.equal(found.items.find((item) => item.id === created.id)?.files, 1);
  const shot = await upload(maya, ws, "shot.png");
  await app(maya).discussion.update({ discussionId: d.id, attachmentIds: [shot.attachmentId] });
  const rows = await app(maya).discussion.listByWorkspace({ workspaceId: ws.id, take: 20 });
  assert.equal(rows.items.find((row) => row.id === d.id).files, 1);
});
