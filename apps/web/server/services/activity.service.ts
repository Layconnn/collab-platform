import type { ActivityFilter, ListActivityInput } from "@repo/validators/activity";
import type { ActivityKind, ActivitySubjectType, Prisma } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";

// Any client that can write inside the caller's transaction.
type ActivityWriter = Pick<Prisma.TransactionClient, "activityEvent" | "user">;

export type ActivitySummary = Record<string, string | number | boolean | null>;

export type RecordActivityInput = {
  workspaceId: string;
  actorUserId: string;
  // Pass when the caller already has it; otherwise it is read in the same transaction.
  actorLabel?: string;
  kind: ActivityKind;
  subjectType: ActivitySubjectType;
  subjectId: string;
  summary?: ActivitySummary;
};

// Summaries are snapshots for feeds, never full bodies: long text is cut short.
const SUMMARY_TEXT_LIMIT = 200;

function trimSummary(summary: ActivitySummary | undefined): ActivitySummary | undefined {
  if (!summary) return undefined;
  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [
      key,
      typeof value === "string" && value.length > SUMMARY_TEXT_LIMIT ? `${value.slice(0, SUMMARY_TEXT_LIMIT - 1)}…` : value,
    ]),
  );
}

export function activityActorLabel(user: { name: string | null; username: string }): string {
  return user.name?.trim() || user.username;
}

// Writes one event. Call it with the transaction client of the change it
// describes, so the change and its event commit or roll back together.
export async function recordActivity(db: ActivityWriter, input: RecordActivityInput): Promise<void> {
  let actorLabel = input.actorLabel;
  if (!actorLabel) {
    const actor = await db.user.findUnique({ where: { id: input.actorUserId }, select: { name: true, username: true } });
    actorLabel = actor ? activityActorLabel(actor) : "Unknown member";
  }
  await db.activityEvent.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actorLabel,
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      summary: trimSummary(input.summary),
    },
  });
}

// The display name of a member an event is about, read inside the transaction.
export async function memberLabel(db: Pick<Prisma.TransactionClient, "user">, userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
  return user ? activityActorLabel(user) : "Unknown member";
}

// ---------------------------------------------------------------------------
// Reading the log
// ---------------------------------------------------------------------------

const KINDS_BY_FILTER: Record<Exclude<ActivityFilter, "all">, ActivityKind[]> = {
  discussions: ["DISCUSSION_CREATED", "DISCUSSION_UPDATED", "DISCUSSION_DELETED"],
  comments: ["COMMENT_CREATED", "COMMENT_UPDATED", "COMMENT_DELETED"],
  decisions: ["DECISION_PROPOSED", "DECISION_EDITED", "DECISION_FINALIZED", "DECISION_SUPERSEDED", "DECISION_DELETED"],
  members: ["WORKSPACE_CREATED", "WORKSPACE_UPDATED", "MEMBER_ADDED", "MEMBER_ROLE_CHANGED", "MEMBER_REMOVED", "OWNERSHIP_TRANSFERRED"],
};

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  createdAt: Date;
  actor: { id: string | null; label: string };
  subjectType: ActivitySubjectType;
  subjectId: string;
  // False when the subject was deleted or the member has left; the item stays, without a link.
  available: boolean;
  // The discussion a discussion or comment event belongs to, when it still exists.
  discussion: { id: string; title: string } | null;
  summary: ActivitySummary | null;
};

export const activityService = {
  async listByWorkspace(userId: string, input: ListActivityInput): Promise<{ items: ActivityItem[]; nextCursor: string | null }> {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId } },
      select: { id: true },
    });
    if (!membership) throw new AppError("NOT_FOUND", "Workspace not found.");

    // Keyset pagination on (createdAt, id). The cursor must be an event of this
    // workspace, so a cursor from elsewhere can neither leak nor shift results.
    let after: { createdAt: Date; id: string } | null = null;
    if (input.cursor) {
      after = await prisma.activityEvent.findFirst({
        where: { id: input.cursor, workspaceId: input.workspaceId },
        select: { createdAt: true, id: true },
      });
      if (!after) throw new AppError("BAD_REQUEST", "Invalid cursor.");
    }

    const rows = await prisma.activityEvent.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.filter !== "all" ? { kind: { in: KINDS_BY_FILTER[input.filter] } } : {}),
        ...(after
          ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.take + 1,
      select: {
        id: true, kind: true, createdAt: true, actorUserId: true, actorLabel: true,
        subjectType: true, subjectId: true, summary: true,
      },
    });
    const page = rows.slice(0, input.take);

    const idsOf = (type: ActivitySubjectType) => [...new Set(page.filter((row) => row.subjectType === type).map((row) => row.subjectId))];
    const summaryOf = (row: (typeof page)[number]) => (row.summary ?? null) as ActivitySummary | null;
    const commentDiscussionIds = page
      .filter((row) => row.subjectType === "COMMENT")
      .map((row) => summaryOf(row)?.discussionId)
      .filter((id): id is string => typeof id === "string");
    const discussionIds = [...new Set([...idsOf("DISCUSSION"), ...commentDiscussionIds])];

    const [discussions, comments, decisions, members] = await Promise.all([
      discussionIds.length
        ? prisma.discussion.findMany({ where: { workspaceId: input.workspaceId, id: { in: discussionIds } }, select: { id: true, title: true } })
        : [],
      idsOf("COMMENT").length
        ? prisma.comment.findMany({ where: { workspaceId: input.workspaceId, id: { in: idsOf("COMMENT") } }, select: { id: true } })
        : [],
      idsOf("DECISION").length
        ? prisma.decision.findMany({ where: { workspaceId: input.workspaceId, id: { in: idsOf("DECISION") }, deletedAt: null }, select: { id: true } })
        : [],
      idsOf("MEMBER").length
        ? prisma.workspaceMember.findMany({ where: { workspaceId: input.workspaceId, userId: { in: idsOf("MEMBER") } }, select: { userId: true } })
        : [],
    ]);
    const discussionById = new Map(discussions.map((d) => [d.id, d]));
    const existing = {
      DISCUSSION: new Set(discussions.map((d) => d.id)),
      COMMENT: new Set(comments.map((c) => c.id)),
      DECISION: new Set(decisions.map((d) => d.id)),
      MEMBER: new Set(members.map((m) => m.userId)),
    };

    const items = page.map((row): ActivityItem => {
      const summary = summaryOf(row);
      const discussionId = row.subjectType === "DISCUSSION" ? row.subjectId : row.subjectType === "COMMENT" ? summary?.discussionId : undefined;
      const discussion = typeof discussionId === "string" ? discussionById.get(discussionId) ?? null : null;
      return {
        id: row.id,
        kind: row.kind,
        createdAt: row.createdAt,
        actor: { id: row.actorUserId, label: row.actorLabel },
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        available: row.subjectType === "WORKSPACE" || existing[row.subjectType].has(row.subjectId),
        discussion,
        summary,
      };
    });

    return { items, nextCursor: rows.length > input.take ? page[page.length - 1]?.id ?? null : null };
  },
};
