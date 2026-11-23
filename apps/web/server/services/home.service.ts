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
