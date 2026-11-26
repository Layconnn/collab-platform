"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { ActivityFilter } from "@repo/validators/activity";
import { EmptyState, ErrorState } from "@/components/common/StateNotice";
import { useWorkspaceActivity } from "@/hooks/useActivity";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type Summary = Record<string, string | number | boolean | null> | null;
export type ActivityEntry = {
  id: string;
  kind: string;
  createdAt: Date | string;
  actor: { id: string | null; label: string };
  subjectType: string;
  subjectId: string;
  available: boolean;
  discussion: { id: string; title: string } | null;
  summary: Summary;
};

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "discussions", label: "Discussions" },
  { value: "comments", label: "Replies" },
  { value: "decisions", label: "Decisions" },
  { value: "members", label: "Members" },
];

const ROLE_LABELS: Record<string, string> = { OWNER: "owner", ADMIN: "admin", MEMBER: "member" };
const roleLabel = (value: unknown) => (typeof value === "string" ? ROLE_LABELS[value] ?? value.toLowerCase() : "member");
const summaryText = (summary: Summary, key: string, fallback: string) => {
  const value = summary?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
};

export function timeAgo(value: Date | string, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

const linkClass = "font-medium text-brand-link underline-offset-2 hover:underline";

// Turns one event into a sentence. The subject links only while it still exists;
// otherwise it is plain text, with a note when the reader might expect a link.
export function describeActivity(item: ActivityEntry, workspaceId: string): { lead: string; subject: ReactNode; tail?: string; gone?: boolean } {
  const base = `/workspace/${workspaceId}`;
  const subjectLink = (href: string, label: string) =>
    item.available ? <Link href={href} className={linkClass}>{label}</Link> : <span className="font-medium">{label}</span>;
  const plain = (label: string) => <span className="font-medium">{label}</span>;
  const discussionTitle = item.discussion?.title ?? summaryText(item.summary, "title", "a discussion");
  const question = summaryText(item.summary, "question", "a decision");
  const member = summaryText(item.summary, "member", "a member");
  const gone = !item.available;

  switch (item.kind) {
    case "DISCUSSION_CREATED": return { lead: "started", subject: subjectLink(`${base}/discussions/${item.subjectId}`, discussionTitle), gone };
    case "DISCUSSION_UPDATED": return { lead: "edited", subject: subjectLink(`${base}/discussions/${item.subjectId}`, discussionTitle), gone };
    case "DISCUSSION_DELETED": return { lead: "deleted the discussion", subject: plain(discussionTitle) };
    case "COMMENT_CREATED":
    case "COMMENT_UPDATED":
    case "COMMENT_DELETED": {
      const lead = item.kind === "COMMENT_CREATED" ? "replied in" : item.kind === "COMMENT_UPDATED" ? "edited a reply in" : "deleted a reply in";
      const subject = item.discussion
        ? <Link href={`${base}/discussions/${item.discussion.id}`} className={linkClass}>{item.discussion.title}</Link>
        : plain("a deleted discussion");
      return { lead, subject };
    }
    case "COMMENT_PINNED":
    case "COMMENT_UNPINNED": {
      const discussionId = summaryText(item.summary, "discussionId", "");
      const title = item.discussion?.title ?? summaryText(item.summary, "title", "a discussion");
      return {
        lead: item.kind === "COMMENT_PINNED" ? "pinned a reply in" : "unpinned a reply in",
        subject: discussionId ? subjectLink(`${base}/discussions/${discussionId}`, title) : plain(title),
        tail: item.summary?.excerpt ? `: “${summaryText(item.summary, "excerpt", "")}”` : undefined,
      };
    }
    case "DECISION_PROPOSED": return { lead: "proposed", subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone };
    case "DECISION_EDITED": return { lead: "edited the proposal", subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone };
    case "DECISION_FINALIZED": return {
      lead: "finalized",
      subject: subjectLink(`${base}/decisions/${item.subjectId}`, question),
      ...(item.summary?.overrideReason ? { tail: "before the review rule was met" } : {}),
      gone,
    };
    case "DECISION_REVIEW_REQUESTED": return { lead: `asked ${summaryText(item.summary, "reviewer", "a member")} to review`, subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone };
    case "DECISION_REVIEW_RESPONDED": return item.summary?.response === "OBJECTED"
      ? { lead: "objected to", subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), tail: item.summary?.note ? `: “${summaryText(item.summary, "note", "")}”` : undefined, gone }
      : { lead: "approved", subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone };
    case "DECISION_REVIEW_WITHDRAWN": return item.summary?.reason === "left the workspace"
      ? { lead: `withdrew ${summaryText(item.summary, "reviewer", "a reviewer")}'s review after they left, on`, subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone }
      : { lead: `withdrew the review request to ${summaryText(item.summary, "reviewer", "a reviewer")} on`, subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone };
    case "DECISION_REVIEWS_RESET": return { lead: "changed the proposal and asked reviewers again on", subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone };
    case "DECISION_REVIEW_RULE_CHANGED": return { lead: "changed the review rule on", subject: subjectLink(`${base}/decisions/${item.subjectId}`, question), gone };
    case "DECISION_SUPERSEDED": return {
      lead: "replaced",
      subject: subjectLink(`${base}/decisions/${item.subjectId}`, question),
      tail: `with “${summaryText(item.summary, "replacementQuestion", "a newer decision")}”`,
      gone,
    };
    case "DECISION_DELETED": return { lead: "deleted the decision", subject: plain(question) };
    case "MEMBER_ADDED": return item.summary?.via === "invite"
      ? { lead: "joined with an invite link", subject: "", tail: `as ${roleLabel(item.summary?.role)}` }
      : { lead: "added", subject: plain(member), tail: `as ${roleLabel(item.summary?.role)}` };
    case "MEMBER_ROLE_CHANGED": return { lead: "changed the role of", subject: plain(member), tail: `from ${roleLabel(item.summary?.previousRole)} to ${roleLabel(item.summary?.role)}` };
    case "MEMBER_REMOVED": return { lead: "removed", subject: plain(member) };
    case "OWNERSHIP_TRANSFERRED": return { lead: "transferred ownership to", subject: plain(member) };
    case "WORKSPACE_CREATED": return { lead: "created the workspace", subject: plain(summaryText(item.summary, "name", "")) };
    case "WORKSPACE_UPDATED": return { lead: "renamed the workspace to", subject: plain(summaryText(item.summary, "name", "a new name")) };
    default: return { lead: "made a change", subject: null };
  }
}

export function RecentActivity({ workspaceId }: { workspaceId: string }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const activity = useWorkspaceActivity(workspaceId, filter);
  const items: ActivityEntry[] = activity.data?.pages.flatMap((page) => page.items) ?? [];
  const denied = ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(activity.error?.data?.code ?? "");

  return (
    <section aria-labelledby="recent-activity-heading" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recent-activity-heading" className="type-canopy-label m-0">Recent activity</h2>
        <SegmentedControl label="Filter activity" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {activity.isLoading && !activity.data ? (
        <div role="status" aria-label="Loading recent activity" className="mt-5 border-t border-border-subtle">
          {[1, 2, 3].map((row) => (
            <div key={row} aria-hidden="true" className="border-b border-border-subtle py-4">
              <span className="block h-4 w-3/4 animate-pulse rounded-sm bg-surface-active" />
            </div>
          ))}
        </div>
      ) : null}

      {activity.error ? (
        <div className="mt-5">
          <ErrorState
            title={denied ? "Activity unavailable" : activity.data ? "Could not refresh activity" : "Could not load activity"}
            description={denied ? "You may no longer have access to this workspace." : "Please try again in a moment."}
            onRetry={denied ? undefined : () => void activity.refetch()}
            retrying={activity.isFetching}
          />
        </div>
      ) : null}

      {!activity.isLoading && !activity.error && !items.length ? (
        <div className="mt-5">
          <EmptyState
            title={filter === "all" ? "No activity yet" : "Nothing here yet"}
            description={filter === "all"
              ? "New discussions, replies, decisions and membership changes will appear here."
              : "Try another filter, or check back after the team's next change."}
          />
        </div>
      ) : null}

      {items.length && !denied ? (
        <ol className="mt-5 border-t border-border-subtle" aria-label="Recent activity">
          {items.map((item) => {
            const sentence = describeActivity(item, workspaceId);
            return (
              <li key={item.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-subtle py-3.5 text-sm">
                <p className="min-w-0 flex-1 wrap-anywhere text-text-secondary">
                  <span className="font-semibold text-text-primary">{item.actor.label}</span> {sentence.lead} {sentence.subject}
                  {sentence.tail ? ` ${sentence.tail}` : null}
                  {sentence.gone ? <span className="text-text-muted"> (no longer available)</span> : null}
                </p>
                <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 text-xs text-text-muted">{timeAgo(item.createdAt)}</time>
              </li>
            );
          })}
        </ol>
      ) : null}

      {activity.hasNextPage && !denied ? (
        <button
          type="button"
          disabled={activity.isFetchingNextPage}
          onClick={() => void activity.fetchNextPage()}
          className="mt-4 min-h-11 rounded-sm border border-border px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
        >
          {activity.isFetchingNextPage ? "Loading..." : "Load more activity"}
        </button>
      ) : null}
    </section>
  );
}
