import type { ActivityKind, ActivitySubjectType, Prisma } from "../../app/generated/prisma/client";

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
