import type { DismissNeedsInput, NeedsYouInput } from "@repo/validators/home";

import { prisma } from "../db/prisma";

// "Needs you": what is waiting on a member across all their workspaces.
// Each provider returns items of one kind; the Home combines and orders them.
// Later features (decision reviews, revisit dates, open questions) add a
// provider here without changing the endpoint or the UI (FR-6).

export type NeedKind = "MENTION" | "REPLY" | "PROPOSAL_WAITING" | "OWN_PROPOSAL";

export type NeedItem = {
  id: string;
  kind: NeedKind;
  workspace: { id: string; name: string };
  title: string;
  // The person behind the item: who mentioned or replied, or who proposed.
  actor: string | null;
  // Exactly one is set, for the link.
  discussionId: string | null;
  decisionId: string | null;
  at: Date;
  // Notification-based items can be marked done; proposals leave when decided.
  notificationId: string | null;
};

type ProviderContext = { userId: string; now: Date };
type Provider = (context: ProviderContext) => Promise<NeedItem[]>;

const PROVIDER_LIMIT = 100;
// A proposal waiting longer than this is urgent (FR-2).
export const WAITING_URGENT_MS = 2 * 24 * 60 * 60 * 1000;

const label = (user: { name: string | null; username: string } | null) => (user ? user.name?.trim() || user.username : null);

// Notifications only count while the recipient is still a member.
function unreadNotifications(userId: string, type: "MENTION" | "COMMENT_CREATED", discussionAuthorId?: string) {
  return prisma.notification.findMany({
    where: {
      recipientUserId: userId,
      type,
      readAt: null,
      workspace: { members: { some: { userId } } },
      discussionId: { not: null },
      ...(discussionAuthorId ? { discussion: { authorId: discussionAuthorId } } : {}),
    },
    orderBy: { id: "desc" },
    take: PROVIDER_LIMIT,
    select: {
      id: true, createdAt: true, discussionId: true,
      workspace: { select: { id: true, name: true } },
      discussion: { select: { title: true } },
      actor: { select: { name: true, username: true } },
    },
  });
}

const mentions: Provider = async ({ userId }) =>
  (await unreadNotifications(userId, "MENTION")).map((n) => ({
    id: `mention:${n.id}`, kind: "MENTION", workspace: n.workspace, title: n.discussion?.title ?? "A discussion",
    actor: label(n.actor), discussionId: n.discussionId, decisionId: null, at: n.createdAt, notificationId: n.id,
  }));

// Replies in discussions the user started (reply notifications go to every member).
const replies: Provider = async ({ userId }) =>
  (await unreadNotifications(userId, "COMMENT_CREATED", userId)).map((n) => ({
    id: `reply:${n.id}`, kind: "REPLY", workspace: n.workspace, title: n.discussion?.title ?? "A discussion",
    actor: label(n.actor), discussionId: n.discussionId, decisionId: null, at: n.createdAt, notificationId: n.id,
  }));

// Proposals someone else made, in workspaces where the user can finalize them.
const proposalsWaiting: Provider = async ({ userId }) =>
  (await prisma.decision.findMany({
    where: {
      status: "PROPOSED",
      deletedAt: null,
      NOT: { createdById: userId },
      workspace: { members: { some: { userId, role: { in: ["OWNER", "ADMIN"] } } } },
    },
    orderBy: { createdAt: "asc" },
    take: PROVIDER_LIMIT,
    select: { id: true, question: true, createdAt: true, createdByLabel: true, workspace: { select: { id: true, name: true } } },
  })).map((d) => ({
    id: `waiting:${d.id}`, kind: "PROPOSAL_WAITING", workspace: d.workspace, title: d.question,
    actor: d.createdByLabel, discussionId: null, decisionId: d.id, at: d.createdAt, notificationId: null,
  }));

const ownProposals: Provider = async ({ userId }) =>
  (await prisma.decision.findMany({
    where: { status: "PROPOSED", deletedAt: null, createdById: userId, workspace: { members: { some: { userId } } } },
    orderBy: { createdAt: "asc" },
    take: PROVIDER_LIMIT,
    select: { id: true, question: true, createdAt: true, createdByLabel: true, workspace: { select: { id: true, name: true } } },
  })).map((d) => ({
    id: `own:${d.id}`, kind: "OWN_PROPOSAL", workspace: d.workspace, title: d.question,
    actor: d.createdByLabel, discussionId: null, decisionId: d.id, at: d.createdAt, notificationId: null,
  }));

const PROVIDERS: Provider[] = [mentions, replies, proposalsWaiting, ownProposals];

// Mentions, then proposals waiting more than two days, then replies, then
// newer proposals, then the user's own proposals (FR-2). Notifications are
// newest first; proposals longest-waiting first.
export function rankNeeds(items: NeedItem[], now: Date): NeedItem[] {
  const rank = (item: NeedItem) => {
    if (item.kind === "MENTION") return 0;
    if (item.kind === "PROPOSAL_WAITING") return now.getTime() - item.at.getTime() > WAITING_URGENT_MS ? 1 : 3;
    if (item.kind === "REPLY") return 2;
    return 4;
  };
  return [...items].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    const proposal = a.kind === "PROPOSAL_WAITING" || a.kind === "OWN_PROPOSAL";
    return proposal ? a.at.getTime() - b.at.getTime() : b.at.getTime() - a.at.getTime();
  });
}

const HOME_LIMIT = 20;

export const homeService = {
  async needsYou(userId: string, input: NeedsYouInput, now = new Date()): Promise<{ items: NeedItem[]; total: number }> {
    const groups = await Promise.all(PROVIDERS.map((provider) => provider({ userId, now })));
    const ranked = rankNeeds(groups.flat(), now);
    return { items: input.all ? ranked : ranked.slice(0, HOME_LIMIT), total: ranked.length };
  },

  // Marks notification-based items done. Only the user's own notifications of
  // the kinds Home shows are touched; anything else is ignored.
  async pulse(userId: string): Promise<{ workspaces: WorkspacePulse[] }> {
    return { workspaces: await workspacePulse(userId) };
  },

  async dismiss(userId: string, input: DismissNeedsInput): Promise<{ dismissed: number }> {
    const result = await prisma.notification.updateMany({
      where: { id: { in: input.notificationIds }, recipientUserId: userId, readAt: null, type: { in: ["MENTION", "COMMENT_CREATED"] } },
      data: { readAt: new Date() },
    });
    return { dismissed: result.count };
  },

  // Marks every mention and every reply in the user's own discussions done:
  // exactly the notification items Needs you shows.
  async dismissAll(userId: string): Promise<{ dismissed: number }> {
    const now = new Date();
    const [mentioned, replied] = await prisma.$transaction([
      prisma.notification.updateMany({
        where: { recipientUserId: userId, readAt: null, type: "MENTION" },
        data: { readAt: now },
      }),
      prisma.notification.updateMany({
        where: { recipientUserId: userId, readAt: null, type: "COMMENT_CREATED", discussion: { authorId: userId } },
        data: { readAt: now },
      }),
    ]);
    return { dismissed: mentioned.count + replied.count };
  },
};

// ---------------------------------------------------------------------------
// Workspace pulse (FR-7): the last seven days of each workspace, from the
// event log. Days are rolling 24-hour windows ending now, so the series needs
// no time zone and "today" is always the last bar.
// ---------------------------------------------------------------------------

export const PULSE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WorkspacePulse = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastActivityAt: Date | null;
  decisionsFinalized: number;
  discussionsStarted: number;
  replies: number;
  activePeople: number;
  openProposals: number;
  // Events per day, oldest first; the last entry is the most recent 24 hours.
  daily: number[];
};

type PulseRow = {
  workspace_id: string; name: string; role: WorkspacePulse["role"]; last_activity_at: Date | null;
  decisions_finalized: number; discussions_started: number; replies: number; active_people: number;
};
type DailyRow = { workspace_id: string; days_ago: number; events: number };

export async function workspacePulse(userId: string, now = new Date()): Promise<WorkspacePulse[]> {
  const since = new Date(now.getTime() - PULSE_DAYS * DAY_MS);
  // Event times are stored as UTC without a zone; compare in UTC whatever the
  // session time zone is.
  const [rows, daily, proposals] = await Promise.all([
    prisma.$queryRaw<PulseRow[]>`
      SELECT w."id" AS workspace_id, w."name", m."role"::text AS role,
        (SELECT max(e."createdAt") FROM "ActivityEvent" e WHERE e."workspaceId" = w."id") AS last_activity_at,
        count(r."id") FILTER (WHERE r."kind" = 'DECISION_FINALIZED')::int AS decisions_finalized,
        count(r."id") FILTER (WHERE r."kind" = 'DISCUSSION_CREATED')::int AS discussions_started,
        count(r."id") FILTER (WHERE r."kind" = 'COMMENT_CREATED')::int AS replies,
        count(DISTINCT r."actorUserId")::int AS active_people
      FROM "WorkspaceMember" m
      JOIN "Workspace" w ON w."id" = m."workspaceId"
      LEFT JOIN "ActivityEvent" r ON r."workspaceId" = w."id" AND r."createdAt" > (${since}::timestamptz AT TIME ZONE 'UTC') AND r."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      WHERE m."userId" = ${userId}
      GROUP BY w."id", w."name", m."role"`,
    prisma.$queryRaw<DailyRow[]>`
      SELECT e."workspaceId" AS workspace_id,
        floor(extract(epoch FROM ((${now}::timestamptz AT TIME ZONE 'UTC') - e."createdAt")) / 86400)::int AS days_ago,
        count(*)::int AS events
      FROM "ActivityEvent" e
      JOIN "WorkspaceMember" m ON m."workspaceId" = e."workspaceId" AND m."userId" = ${userId}
      WHERE e."createdAt" > (${since}::timestamptz AT TIME ZONE 'UTC') AND e."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1, 2`,
    prisma.decision.groupBy({
      by: ["workspaceId"],
      where: { status: "PROPOSED", deletedAt: null, workspace: { members: { some: { userId } } } },
      _count: { _all: true },
    }),
  ]);

  const openByWorkspace = new Map(proposals.map((p) => [p.workspaceId, p._count._all]));
  const dailyByWorkspace = new Map<string, number[]>();
  for (const row of daily) {
    const series = dailyByWorkspace.get(row.workspace_id) ?? Array<number>(PULSE_DAYS).fill(0);
    const index = PULSE_DAYS - 1 - row.days_ago;
    if (index >= 0 && index < PULSE_DAYS) series[index]! += row.events;
    dailyByWorkspace.set(row.workspace_id, series);
  }

  return rows
    .map((row) => ({
      id: row.workspace_id,
      name: row.name,
      role: row.role,
      lastActivityAt: row.last_activity_at,
      decisionsFinalized: row.decisions_finalized,
      discussionsStarted: row.discussions_started,
      replies: row.replies,
      activePeople: row.active_people,
      openProposals: openByWorkspace.get(row.workspace_id) ?? 0,
      daily: dailyByWorkspace.get(row.workspace_id) ?? Array<number>(PULSE_DAYS).fill(0),
    }))
    // Busiest first: the most recent activity, then name; never-active last.
    .sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0) || a.name.localeCompare(b.name));
}
