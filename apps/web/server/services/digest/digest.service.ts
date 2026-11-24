import { prisma } from "../../db/prisma";
import { homeService, recentDecisions, type NeedItem, type RecentDecision } from "../home.service";

// The daily digest (daily digest PRD, FR-1 to FR-4): what needs a member, what
// was decided in the last day and what changed in their workspaces. It reuses
// Home's providers so the email and Home never disagree.

export const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DIGEST_NEEDS_SHOWN = 5;

export type WorkspaceActivity = {
  workspace: { id: string; name: string };
  discussions: number;
  replies: number;
  decisions: number;
};

export type Digest = {
  user: { id: string; name: string; email: string };
  generatedAt: Date;
  needs: { items: NeedItem[]; total: number };
  decided: RecentDecision[];
  activity: WorkspaceActivity[];
  // True when there is nothing to send (FR-3).
  empty: boolean;
  subject: string;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function digestSubject(needs: number, decided: number, activity: WorkspaceActivity[]) {
  const parts: string[] = [];
  if (needs) parts.push(`${plural(needs, "thing")} ${needs === 1 ? "needs" : "need"} you`);
  if (decided) parts.push(plural(decided, "decision"));
  if (!parts.length) {
    const replies = activity.reduce((sum, item) => sum + item.replies, 0);
    const discussions = activity.reduce((sum, item) => sum + item.discussions, 0);
    if (discussions) parts.push(plural(discussions, "new discussion"));
    if (replies) parts.push(plural(replies, "reply", "replies"));
  }
  return `Commons: ${parts.join(", ") || "your day"}`;
}

export async function buildDigest(userId: string, options: { now?: Date; excludedWorkspaceIds?: string[] } = {}): Promise<Digest | null> {
  const now = options.now ?? new Date();
  const excluded = new Set(options.excludedWorkspaceIds ?? []);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, email: true, memberships: { select: { workspace: { select: { id: true, name: true } } } } },
  });
  if (!user) return null;
  // Only workspaces the member belongs to now and has not turned off (FR-2).
  const workspaces = user.memberships.map((m) => m.workspace).filter((ws) => !excluded.has(ws.id));
  const included = new Set(workspaces.map((ws) => ws.id));
  const since = new Date(now.getTime() - DIGEST_WINDOW_MS);

  const [needs, decided, counts] = await Promise.all([
    homeService.needsYou(userId, { all: true }, now),
    recentDecisions(userId, now, DIGEST_WINDOW_MS),
    workspaces.length
      ? prisma.activityEvent.groupBy({
        by: ["workspaceId", "kind"],
        where: {
          workspaceId: { in: [...included] },
          kind: { in: ["DISCUSSION_CREATED", "COMMENT_CREATED", "DECISION_FINALIZED"] },
          createdAt: { gt: since, lte: now },
          // What others did; the member knows what they did themselves.
          NOT: { actorUserId: userId },
        },
        _count: { _all: true },
      })
      : Promise.resolve([]),
  ]);

  const needItems = needs.items.filter((item) => included.has(item.workspace.id));
  const decidedItems = decided.filter((item) => included.has(item.workspace.id));
  const activity = workspaces.flatMap((workspace): WorkspaceActivity[] => {
    const of = (kind: string) => counts.find((row) => row.workspaceId === workspace.id && row.kind === kind)?._count._all ?? 0;
    const row = { workspace, discussions: of("DISCUSSION_CREATED"), replies: of("COMMENT_CREATED"), decisions: of("DECISION_FINALIZED") };
    return row.discussions + row.replies + row.decisions ? [row] : [];
  }).sort((a, b) => (b.discussions + b.replies + b.decisions) - (a.discussions + a.replies + a.decisions));

  return {
    user: { id: user.id, name: user.name?.trim() || user.username, email: user.email },
    generatedAt: now,
    needs: { items: needItems.slice(0, DIGEST_NEEDS_SHOWN), total: needItems.length },
    decided: decidedItems,
    activity,
    empty: !needItems.length && !decidedItems.length && !activity.length,
    subject: digestSubject(needItems.length, decidedItems.length, activity),
  };
}
