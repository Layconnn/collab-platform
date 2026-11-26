import type { Prisma } from "../../app/generated/prisma/client";

import { memberLabel } from "./activity.service";

// Edit history on messages (edit history PRD). An edit keeps the version it
// replaces as a revision row; the current version is the discussion or reply
// itself. Version 1 is the original, so a row's `version` is the version it
// holds and its editor is who replaced it.

type Tx = Prisma.TransactionClient;

export const HISTORY_MAX_VERSIONS = 50;

const fileNamesSelect = { select: { fileName: true }, orderBy: { position: "asc" } } as const;

type Snapshot = { body: string; fileNames: string[] };

function sameNames(a: string[], b: string[]) {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

async function fileNamesOf(tx: Tx, target: { discussionId: string } | { commentId: string }) {
  const rows = await tx.attachment.findMany({ where: target, ...fileNamesSelect });
  return rows.map((row) => row.fileName);
}

// Call first in the edit's transaction. The row lock makes concurrent edits
// wait, so each one reads the version it really replaces (FR-1, FR-2).
export async function lockDiscussionVersion(tx: Tx, discussionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Discussion" WHERE "id" = ${discussionId} FOR UPDATE`;
  const row = await tx.discussion.findUniqueOrThrow({
    where: { id: discussionId },
    select: { title: true, body: true, editCount: true, attachments: fileNamesSelect },
  });
  return { title: row.title, body: row.body, editCount: row.editCount, fileNames: row.attachments.map((file) => file.fileName) };
}

export async function lockCommentVersion(tx: Tx, commentId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Comment" WHERE "id" = ${commentId} FOR UPDATE`;
  const row = await tx.comment.findUniqueOrThrow({
    where: { id: commentId },
    select: { body: true, editCount: true, attachments: fileNamesSelect },
  });
  return { body: row.body, editCount: row.editCount, fileNames: row.attachments.map((file) => file.fileName) };
}

// After the files are synced and before the row is written: whether this edit
// changes anything, and so whether it counts as an edit. A save that changes
// nothing keeps no revision.
export async function discussionEditChanges(
  tx: Tx,
  before: Snapshot & { title: string },
  next: { discussionId: string; title: string; body: string; filesSynced: boolean },
) {
  const fileNames = next.filesSynced ? await fileNamesOf(tx, { discussionId: next.discussionId }) : before.fileNames;
  return before.title !== next.title || before.body !== next.body || !sameNames(before.fileNames, fileNames);
}

export async function commentEditChanges(
  tx: Tx,
  before: Snapshot,
  next: { commentId: string; body: string; filesSynced: boolean },
) {
  const fileNames = next.filesSynced ? await fileNamesOf(tx, { commentId: next.commentId }) : before.fileNames;
  return before.body !== next.body || !sameNames(before.fileNames, fileNames);
}

export async function keepDiscussionRevision(
  tx: Tx,
  input: { workspaceId: string; discussionId: string; editorId: string; before: Snapshot & { title: string; editCount: number } },
) {
  await tx.discussionRevision.create({
    data: {
      workspaceId: input.workspaceId,
      discussionId: input.discussionId,
      version: input.before.editCount + 1,
      title: input.before.title,
      body: input.before.body,
      fileNames: input.before.fileNames,
      editedById: input.editorId,
      editorLabel: await memberLabel(tx, input.editorId),
    },
  });
}

export async function keepCommentRevision(
  tx: Tx,
  input: { workspaceId: string; discussionId: string; commentId: string; editorId: string; before: Snapshot & { editCount: number } },
) {
  await tx.commentRevision.create({
    data: {
      workspaceId: input.workspaceId,
      discussionId: input.discussionId,
      commentId: input.commentId,
      version: input.before.editCount + 1,
      body: input.before.body,
      fileNames: input.before.fileNames,
      editedById: input.editorId,
      editorLabel: await memberLabel(tx, input.editorId),
    },
  });
}

export type HistoryVersion = {
  version: number;
  current: boolean;
  title?: string;
  body: string;
  fileNames: string[];
  // Who wrote this version and when: the author for version 1, otherwise
  // whoever made the edit that produced it.
  byLabel: string;
  at: Date;
};

type RevisionRow = { version: number; title?: string; body: string; fileNames: string[]; editorLabel: string; createdAt: Date };

// The history newest first, starting with the current version (FR-4). Pass
// the newest HISTORY_MAX_VERSIONS revisions, newest first.
export function buildHistory(input: {
  current: { title?: string; body: string; fileNames: string[]; editCount: number };
  author: { label: string; at: Date };
  revisions: RevisionRow[];
}): { versions: HistoryVersion[]; total: number } {
  const byVersion = new Map(input.revisions.map((row) => [row.version, row]));
  const producedBy = (version: number) => {
    if (version === 1) return { byLabel: input.author.label, at: input.author.at };
    const edit = byVersion.get(version - 1);
    return edit ? { byLabel: edit.editorLabel, at: edit.createdAt } : { byLabel: input.author.label, at: input.author.at };
  };
  const total = input.current.editCount + 1;
  const current: HistoryVersion = {
    version: total,
    current: true,
    ...(input.current.title !== undefined ? { title: input.current.title } : {}),
    body: input.current.body,
    fileNames: input.current.fileNames,
    ...producedBy(total),
  };
  const older = input.revisions.map((row): HistoryVersion => ({
    version: row.version,
    current: false,
    ...(row.title !== undefined ? { title: row.title } : {}),
    body: row.body,
    fileNames: row.fileNames,
    ...producedBy(row.version),
  }));
  return { versions: [current, ...older].slice(0, HISTORY_MAX_VERSIONS), total };
}
