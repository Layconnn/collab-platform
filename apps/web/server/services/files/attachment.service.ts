import { randomBytes } from "node:crypto";

import { allowedFileType, FILE_LIMITS, isImageType, type CreateUploadInput } from "@repo/validators/files";
import type { Prisma, WorkspaceRole } from "../../../app/generated/prisma/client";

import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/app-error";
import { getMembershipRole } from "../workspace.access";
import { canPerformWorkspaceAction, WORKSPACE_ACTIONS } from "../workspace.permissions";
import { configuredStorage, type FileStorage } from "./storage";

// Attachments (file uploads PRD): upload URLs with limits (FR-2, FR-4, FR-5),
// checking and claiming uploads for a post (FR-3), downloads through a
// membership check (FR-8) and the daily clean-up (FR-12).

type Tx = Prisma.TransactionClient;

export const UPLOAD_URL_SECONDS = 10 * 60;
export const DOWNLOAD_URL_SECONDS = 5 * 60;
// Pending uploads older than this cannot be attached, and are deleted.
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const MAGIC: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => b[i] === value),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => String.fromCharCode(...b.slice(0, 4)) === "GIF8",
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

function requireStorage(storage: FileStorage | null = configuredStorage()): FileStorage {
  if (!storage) throw new AppError("BAD_REQUEST", "File uploads are not switched on.");
  return storage;
}

// RFC 6266: an ASCII fallback plus the exact UTF-8 name (NFR-3).
export function contentDisposition(type: "inline" | "attachment", fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\%;]/g, "_");
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export type AttachmentTarget = { discussionId: string } | { commentId: string } | { decisionId: string };

// What a post shows of its files (FR-7). Selected with the post itself.
export const attachmentsSelect = {
  select: { id: true, fileName: true, contentType: true, size: true },
  orderBy: { position: "asc" },
} as const satisfies Prisma.Discussion$attachmentsArgs;

export type PublicAttachment = { id: string; fileName: string; contentType: string; size: number };

// Which of `desired` are new uploads, before a post's transaction, so they can
// be verified with storage first (verifyUploads).
export async function newUploadIds(target: AttachmentTarget, desired: string[]) {
  const existing = await prisma.attachment.findMany({ where: { ...target }, select: { id: true } });
  const have = new Set(existing.map((row) => row.id));
  return [...new Set(desired)].filter((id) => !have.has(id));
}

export const attachmentService = {
  config() {
    return { enabled: configuredStorage() !== null };
  },

  // FR-2, FR-4, FR-5: records a pending upload and returns a URL the browser
  // PUTs the file to. The workspace total includes pending uploads.
  async createUpload(userId: string, input: CreateUploadInput, storage: FileStorage | null = configuredStorage()) {
    const store = requireStorage(storage);
    const type = allowedFileType(input.fileName);
    if (!type) throw new AppError("BAD_REQUEST", "This type of file cannot be attached.");
    const key = `files/${input.workspaceId}/${randomBytes(18).toString("base64url")}`;

    const attachment = await prisma.$transaction(async (tx) => {
      const member = await tx.$queryRaw<Array<{ role: WorkspaceRole }>>`
        SELECT "role" FROM "WorkspaceMember"
        WHERE "workspaceId" = ${input.workspaceId} AND "userId" = ${userId}
        FOR SHARE
      `;
      if (!member[0] || !canPerformWorkspaceAction(member[0].role, WORKSPACE_ACTIONS.CREATE_COMMENT)) {
        throw new AppError("NOT_FOUND", "Workspace not found.");
      }
      // One upload at a time per workspace, so two cannot both fit the last space.
      // NO KEY UPDATE leaves inserts that reference the workspace unblocked.
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR NO KEY UPDATE`;
      const used = await tx.attachment.aggregate({ where: { workspaceId: input.workspaceId }, _sum: { size: true } });
      if ((used._sum.size ?? 0) + input.size > FILE_LIMITS.maxWorkspaceBytes) {
        throw new AppError("BAD_REQUEST", "This workspace has used its 1 GB of file storage.");
      }
      return tx.attachment.create({
        data: { workspaceId: input.workspaceId, uploaderId: userId, key, fileName: input.fileName, contentType: type.contentType, size: input.size },
        select: { id: true, contentType: true },
      });
    });

    const upload = await store.signUpload(key, { contentType: attachment.contentType, size: input.size }, UPLOAD_URL_SECONDS);
    return { attachmentId: attachment.id, uploadUrl: upload.url, headers: upload.headers, expiresAt: new Date(Date.now() + UPLOAD_URL_SECONDS * 1000) };
  },

  // FR-3, part one (outside any transaction: it talks to storage). Each id
  // must be the caller's own recent pending upload in this workspace, present
  // in storage at the declared size, and an image must start like one.
  async verifyUploads(userId: string, workspaceId: string, attachmentIds: string[], options: { storage?: FileStorage | null; now?: Date } = {}) {
    const ids = [...new Set(attachmentIds)];
    if (ids.length === 0) return [];
    if (ids.length > FILE_LIMITS.maxFilesPerPost) throw new AppError("BAD_REQUEST", `A post can have up to ${FILE_LIMITS.maxFilesPerPost} files.`);
    const store = requireStorage(options.storage === undefined ? configuredStorage() : options.storage);
    const now = options.now ?? new Date();
    const rows = await prisma.attachment.findMany({
      where: { id: { in: ids }, workspaceId, uploaderId: userId, status: "PENDING", createdAt: { gt: new Date(now.getTime() - PENDING_TTL_MS) } },
      select: { id: true, key: true, size: true, contentType: true },
    });
    if (rows.length !== ids.length) throw new AppError("BAD_REQUEST", "A file is no longer available. Remove it and attach it again.");
    for (const row of rows) {
      const stored = await store.head(row.key);
      if (!stored || stored.size !== row.size) throw new AppError("BAD_REQUEST", "A file did not finish uploading. Remove it and attach it again.");
      const looksRight = MAGIC[row.contentType];
      if (isImageType(row.contentType) && (!looksRight || !looksRight(await store.readStart(row.key, 12)))) {
        throw new AppError("BAD_REQUEST", "An image could not be read. Check the file and attach it again.");
      }
    }
    return ids;
  },

  // FR-3, part two: inside the post's own transaction, after verifyUploads.
  // Claims each upload for the post, in the given order after `startPosition`.
  async attach(tx: Tx, input: { userId: string; workspaceId: string; attachmentIds: string[]; target: AttachmentTarget; startPosition?: number; now?: Date }) {
    const now = input.now ?? new Date();
    for (const [index, id] of input.attachmentIds.entries()) {
      const claimed = await tx.attachment.updateMany({
        where: { id, workspaceId: input.workspaceId, uploaderId: input.userId, status: "PENDING", createdAt: { gt: new Date(now.getTime() - PENDING_TTL_MS) } },
        data: { status: "ATTACHED", ...input.target, position: (input.startPosition ?? 0) + index, attachedAt: now },
      });
      if (claimed.count !== 1) throw new AppError("BAD_REQUEST", "A file is no longer available. Remove it and attach it again.");
    }
  },

  // FR-11: makes a post's files exactly `desired`, in that order. Files no
  // longer listed are removed (their storage objects queued for deletion), new
  // uploads are claimed (verify them first), and the rest are reordered.
  async sync(tx: Tx, input: { userId: string; workspaceId: string; target: AttachmentTarget; desired: string[]; now?: Date }) {
    const desired = [...new Set(input.desired)];
    if (desired.length > FILE_LIMITS.maxFilesPerPost) throw new AppError("BAD_REQUEST", `A post can have up to ${FILE_LIMITS.maxFilesPerPost} files.`);
    const existing = await tx.attachment.findMany({ where: { ...input.target }, select: { id: true } });
    const have = new Set(existing.map((row) => row.id));
    const removed = existing.filter((row) => !desired.includes(row.id)).map((row) => row.id);
    if (removed.length) await tx.attachment.deleteMany({ where: { id: { in: removed }, ...input.target } });
    const added: string[] = [];
    for (const [position, id] of desired.entries()) {
      if (have.has(id)) {
        await tx.attachment.updateMany({ where: { id, ...input.target }, data: { position } });
      } else {
        await this.attach(tx, { userId: input.userId, workspaceId: input.workspaceId, attachmentIds: [id], target: input.target, startPosition: position, now: input.now });
        added.push(id);
      }
    }
    return { added: added.length, removed: removed.length, count: desired.length };
  },

  // FR-8: a short-lived download URL, only for current members who can read
  // the post. Anything else is "not found", so ids reveal nothing (NFR-1).
  async downloadUrl(userId: string, attachmentId: string, options: { download?: boolean; storage?: FileStorage | null } = {}) {
    const store = requireStorage(options.storage === undefined ? configuredStorage() : options.storage);
    const notFound = new AppError("NOT_FOUND", "File not found.");
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        key: true, fileName: true, contentType: true, status: true, workspaceId: true, discussionId: true, decisionId: true,
        comment: { select: { workspaceId: true } },
        decision: { select: { deletedAt: true } },
      },
    });
    if (!attachment || attachment.status !== "ATTACHED") throw notFound;
    if (attachment.comment && attachment.comment.workspaceId !== attachment.workspaceId) throw notFound;
    if (attachment.decision?.deletedAt) throw notFound;
    const role = await getMembershipRole(attachment.workspaceId, userId);
    const action = attachment.decisionId ? WORKSPACE_ACTIONS.READ : WORKSPACE_ACTIONS.READ_DISCUSSION;
    if (!role || !canPerformWorkspaceAction(role, action)) throw notFound;
    // Only images are shown in the browser, unless asked to download; everything
    // else always downloads (NFR-2).
    const disposition = contentDisposition(isImageType(attachment.contentType) && !options.download ? "inline" : "attachment", attachment.fileName);
    return store.signDownload(attachment.key, { contentType: attachment.contentType, contentDisposition: disposition }, DOWNLOAD_URL_SECONDS);
  },

  // FR-12: deletes expired pending uploads (their keys are queued by the
  // DeletedFile trigger), then deletes queued objects from storage. Call
  // repeatedly until done; each call stops at the deadline.
  async cleanup(options: { storage?: FileStorage | null; now?: Date; deadline: number; batchSize?: number }) {
    const store = requireStorage(options.storage === undefined ? configuredStorage() : options.storage);
    const now = options.now ?? new Date();
    const batchSize = options.batchSize ?? 100;
    const result = { expired: 0, deleted: 0, failed: 0, done: false };
    const expired = await prisma.attachment.deleteMany({ where: { status: "PENDING", createdAt: { lte: new Date(now.getTime() - PENDING_TTL_MS) } } });
    result.expired = expired.count;

    let after: string | undefined;
    while (Date.now() < options.deadline) {
      const queued = await prisma.deletedFile.findMany({
        where: after ? { key: { gt: after } } : {},
        orderBy: { key: "asc" },
        take: batchSize,
        select: { key: true },
      });
      if (queued.length === 0) {
        result.done = true;
        break;
      }
      for (const { key } of queued) {
        try {
          await store.delete(key);
          await prisma.deletedFile.delete({ where: { key } });
          result.deleted += 1;
        } catch {
          // Left queued; the next run tries again.
          result.failed += 1;
        }
      }
      after = queued.at(-1)!.key;
    }
    return result;
  },
};
