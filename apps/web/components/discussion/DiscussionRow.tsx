import Link from "next/link";
import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/api/root";
import { timeAgo } from "@/components/activity/RecentActivity";
import { FileCount } from "@/components/files/FileCount";
import { UserAvatar } from "@/components/common/UserAvatar";
import { AvatarStack } from "@/components/ui/AvatarStack";
import { StatusPill, type StatusTone } from "@/components/ui/Canopy";
import { resolveUserIdentity } from "@/lib/user-identity";

export type DiscussionSummary =
  inferRouterOutputs<AppRouter>["discussion"]["listByWorkspace"]["items"][number];

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

// Where the discussion's decision stands, as a pill (dashboard redesign, #170).
const DECISION_PILL: Record<string, { tone: StatusTone; label: string }> = {
  PROPOSED: { tone: "proposal", label: "Proposal" },
  DECIDED: { tone: "decided", label: "Decided" },
  SUPERSEDED: { tone: "replaced", label: "Replaced" },
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// One discussion in the list: who opened it and when, then what happened
// since (replies, who joined in, the decision it led to). On phones the
// activity wraps under the title.
export function DiscussionRow({
  discussion,
  workspaceId,
  actions,
  error,
}: {
  discussion: DiscussionSummary;
  workspaceId: string;
  actions?: ReactNode;
  error?: string;
}) {
  const author = resolveUserIdentity(discussion.author);
  const createdAt = new Date(discussion.createdAt);
  const lastReplyAt = discussion.lastReplyAt ? new Date(discussion.lastReplyAt) : null;
  const pill = discussion.decision ? DECISION_PILL[discussion.decision.status] : null;
  const participants = discussion.participants.map((person) => resolveUserIdentity(person).label);

  return (
    <li className="canopy-row group/row relative min-w-0 border-t border-border-subtle first:border-t-0 hover:bg-surface-subtle focus-within:bg-surface-subtle">
      <div className="flex min-w-0 items-start gap-3 px-4 py-3.5 sm:items-center sm:px-5">
        <UserAvatar name={author.avatarName} className="mt-0.5 size-8 sm:mt-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              {/* The link covers the row; the actions menu sits above it. */}
              <Link
                href={`/workspace/${workspaceId}/discussions/${discussion.id}`}
                className="min-w-0 wrap-anywhere text-[0.9375rem] font-medium leading-snug text-text-primary outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus-ring"
              >
                {discussion.title}
              </Link>
              {pill ? <StatusPill tone={pill.tone}>{pill.label}</StatusPill> : null}
            </div>
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] text-text-muted">
              <span className="max-w-full truncate text-text-secondary">{author.label}</span>
              <span aria-hidden="true">·</span>
              <span>opened <time dateTime={createdAt.toISOString()}>{dateLabel(createdAt)}</time></span>
              {discussion.files ? <><span aria-hidden="true">·</span><FileCount count={discussion.files} /></> : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-[0.8125rem] text-text-muted">
            {participants.length ? <AvatarStack names={participants} max={3} size="size-6" /> : null}
            <span className="inline-flex min-w-10 items-center gap-1.5 tabular-nums" title={plural(discussion.replies, "reply", "replies")}>
              <MessageSquare size={14} aria-hidden="true" />
              <span className="sr-only">{plural(discussion.replies, "reply", "replies")}</span>
              <span aria-hidden="true">{discussion.replies}</span>
            </span>
            <span className="w-36 whitespace-nowrap text-right max-sm:w-auto max-sm:text-left">
              {lastReplyAt
                ? <>Last reply <time dateTime={lastReplyAt.toISOString()}>{timeAgo(lastReplyAt)}</time></>
                : "No replies yet"}
            </span>
          </div>
        </div>
        {actions ? <div className="relative z-10 -my-1 shrink-0">{actions}</div> : null}
      </div>
      {error ? <p role="alert" className="relative z-10 px-5 pb-3 pl-16 text-sm text-danger">{error}</p> : null}
    </li>
  );
}
