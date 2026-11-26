"use client";

import Link from "next/link";
import { ArrowRight, MessageSquareText, Plus } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/api/root";
import { ErrorState } from "@/components/common/StateNotice";
import { UserAvatar } from "@/components/common/UserAvatar";
import { DiscussionRow } from "@/components/discussion/DiscussionRow";
import { useDiscussionList } from "@/hooks/useDiscussion";
import { RecentActivity } from "@/components/activity/RecentActivity";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { resolveUserIdentity } from "@/lib/user-identity";
import { workspaceInitials } from "@/lib/workspace-identity";
import { timeAgo } from "@/components/activity/RecentActivity";
import { dailySummary, type PulseCard } from "@/components/home/WorkspaceActivity";
import { TopBarActions } from "@/components/shell/TopBarActions";
import { ButtonLink } from "@/components/ui/Button";
import { ContextPanel, SectionLabel, StatusPill } from "@/components/ui/Canopy";
import { useDecisionList } from "@/hooks/useDecision";
import { useWorkspacePulse } from "@/hooks/useHome";

type Member =
  inferRouterOutputs<AppRouter>["workspace"]["listMembers"]["items"][number];

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function countLabel(
  count: number,
  hasMore: boolean,
  singular: string,
  plural: string,
) {
  return `${count}${hasMore ? "+" : ""} ${count === 1 && !hasMore ? singular : plural}`;
}

function WorkspaceHomeSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-[1320px]"
    >
      <span className="sr-only">Loading workspace home...</span>
      <div aria-hidden="true" className="border-b border-border-subtle pb-8">
        <div className="h-3 w-28 animate-pulse rounded-sm bg-surface-active" />
        <div className="mt-5 h-10 w-[min(28rem,80%)] animate-pulse rounded-sm bg-surface-active" />
        <div className="mt-4 h-4 w-[min(34rem,95%)] animate-pulse rounded-sm bg-surface-subtle" />
        <div className="mt-7 h-11 w-40 animate-pulse rounded-sm bg-surface-active" />
      </div>
      <div
        aria-hidden="true"
        className="mt-9 grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem]"
      >
        <div>
          <div className="h-7 w-48 animate-pulse rounded-sm bg-surface-active" />
          <div className="mt-5 border-t border-border-subtle">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="flex items-center gap-4 border-b border-border-subtle py-5"
              >
                <div className="size-9 shrink-0 animate-pulse rounded-full bg-surface-subtle" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-3/4 animate-pulse rounded-sm bg-surface-active" />
                  <div className="h-3 w-1/2 animate-pulse rounded-sm bg-surface-subtle" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden space-y-3 xl:block">
          <div className="h-5 w-28 animate-pulse rounded-sm bg-surface-active" />
          <div className="h-3 w-full animate-pulse rounded-sm bg-surface-subtle" />
          <div className="h-3 w-4/5 animate-pulse rounded-sm bg-surface-subtle" />
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: Member }) {
  const identity = resolveUserIdentity(member.user);
  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1.5">
      <UserAvatar name={identity.avatarName} className="size-7 text-[10px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">
          {identity.label}
        </span>
        <span className="block text-xs text-text-muted">
          {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
        </span>
      </span>
    </li>
  );
}

// This workspace's last seven days from the pulse Home already loads
// (dashboard redesign, #174): five figures and a bar per day.
function ThisWeek({ card }: { card: PulseCard }) {
  const max = Math.max(1, ...card.daily);
  const figures: Array<[string, number]> = [
    ["Decided", card.decisionsFinalized],
    ["Open proposals", card.openProposals],
    ["Discussions", card.discussionsStarted],
    ["Replies", card.replies],
    ["People active", card.activePeople],
  ];
  return <section aria-labelledby="week-heading" className="canopy-rise rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:px-6">
    <SectionLabel id="week-heading">This week</SectionLabel>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {figures.map(([label, value]) => <div key={label}>
          <dt className="text-xs text-text-muted">{label}</dt>
          <dd className="mt-0.5 font-serif text-[1.875rem] leading-none tabular-nums text-text-primary">{value}</dd>
        </div>)}
      </dl>
      <figure className="min-w-0">
        <div aria-hidden="true" className="flex h-12 items-end gap-1">
          {card.daily.map((events, index) => <span key={index} className={`w-3 rounded-t-[3px] ${index === card.daily.length - 1 && events ? "bg-live" : events ? "bg-brand-link/50" : "bg-border"}`} style={{ height: events ? `${Math.max(12, Math.round((events / max) * 100))}%` : "2px" }} />)}
        </div>
        <figcaption className="sr-only">Activity per day over the last seven days. {dailySummary(card.daily)}.</figcaption>
      </figure>
    </div>
  </section>;
}

type DecisionItem = inferRouterOutputs<AppRouter>["decision"]["listByWorkspace"]["items"][number];
const DECISION_PILL = {
  PROPOSED: { tone: "proposal", label: "Proposal" },
  DECIDED: { tone: "decided", label: "Decided" },
  SUPERSEDED: { tone: "replaced", label: "Replaced" },
} as const;

function LatestDecisions({ workspaceId }: { workspaceId: string }) {
  const decisions = useDecisionList(workspaceId);
  const items: DecisionItem[] = (decisions.data?.pages.flatMap((page) => page.items) ?? []).slice(0, 4);
  if (decisions.error || (decisions.data && !items.length)) return null;
  return <section aria-labelledby="latest-decisions-heading" className="min-w-0">
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <SectionLabel id="latest-decisions-heading">Latest decisions</SectionLabel>
      <Link href={`/workspace/${workspaceId}/decisions`} className="inline-flex min-h-9 items-center gap-1.5 text-[0.8125rem] font-medium text-brand-link hover:underline">All decisions <ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
    {decisions.isLoading && !decisions.data ? <div role="status" aria-label="Loading decisions" className="grid gap-3 sm:grid-cols-2">{[1, 2].map((row) => <span key={row} aria-hidden="true" className="block h-24 animate-pulse rounded-[14px] bg-surface-active" />)}</div> : null}
    {items.length ? <ul className="canopy-stagger grid gap-3 sm:grid-cols-2">
      {items.map((decision) => {
        const pill = DECISION_PILL[decision.status];
        return <li key={decision.id} className="min-w-0">
          <Link href={`/workspace/${workspaceId}/decisions/${decision.id}`} className="canopy-lift block h-full rounded-[14px] border border-border-subtle bg-surface p-4 focus-visible:outline-2 focus-visible:outline-focus-ring">
            <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
            <span className={`mt-2 block wrap-anywhere font-medium leading-snug ${decision.status === "SUPERSEDED" ? "text-text-secondary line-through decoration-text-muted/60" : "text-text-primary"}`}>{decision.question}</span>
            <span className="mt-2 block text-xs text-text-muted">{decision.createdByLabel} · updated {timeAgo(decision.updatedAt)}</span>
          </Link>
        </li>;
      })}
    </ul> : null}
  </section>;
}

export function WorkspaceHome({ workspaceId }: { workspaceId: string }) {
  const workspace = useWorkspaceDetail(workspaceId);
  const discussions = useDiscussionList(workspaceId);
  const role = workspace.data?.viewerRole;
  const canViewMembers = role === "OWNER" || role === "ADMIN";
  const { members } = useWorkspaceMembers(workspaceId, canViewMembers);
  const pulse = useWorkspacePulse();
  const week: PulseCard | undefined = pulse.data?.workspaces.find((card: PulseCard) => card.id === workspaceId);
  const workspaceDenied =
    workspace.error?.data?.code === "FORBIDDEN" ||
    workspace.error?.data?.code === "UNAUTHORIZED";
  const workspaceMissing = workspace.error?.data?.code === "NOT_FOUND";

  if (!workspace.data && workspace.isLoading && !workspaceDenied)
    return <WorkspaceHomeSkeleton />;
  if (workspaceDenied || workspaceMissing || !workspace.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 py-8">
        <ErrorState
          title={
            workspaceDenied
              ? "Workspace access restricted"
              : workspaceMissing
                ? "Workspace not found"
                : "Could not load workspace"
          }
          description={
            workspaceDenied
              ? "You may no longer have access to this workspace."
              : workspaceMissing
                ? "This workspace may have been removed."
                : "Please try again in a moment."
          }
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {!workspaceDenied && !workspaceMissing ? (
            <button
              type="button"
              onClick={() => void workspace.refetch()}
              className="font-semibold text-brand-link hover:text-brand-link-hover"
            >
              Try again
            </button>
          ) : null}
          <Link
            href="/workspace"
            className="font-semibold text-brand-link hover:text-brand-link-hover"
          >
            All workspaces
          </Link>
        </div>
      </div>
    );
  }

  const discussionDenied =
    discussions.error?.data?.code === "FORBIDDEN" ||
    discussions.error?.data?.code === "UNAUTHORIZED";
  const memberDenied =
    members.error?.data?.code === "FORBIDDEN" ||
    members.error?.data?.code === "UNAUTHORIZED";
  const discussionItems = discussionDenied
    ? []
    : (discussions.data?.pages.flatMap((page) => page.items) ?? []);
  const memberItems = members.error
    ? []
    : (members.data?.pages.flatMap((page) => page.items) ?? []);
  const recent = discussionItems.slice(0, 6);
  const discussionsHref = `/workspace/${workspaceId}/discussions`;
  const membersHref = `/workspace/${workspaceId}/members`;

  const roleLabel = role ? role.charAt(0) + role.slice(1).toLowerCase() : null;
  return (
    <div className="min-w-0">
      <TopBarActions>
        <ButtonLink href={discussionsHref} variant="secondary">Browse discussions</ButtonLink>
        <ButtonLink href={`${discussionsHref}#new-discussion`} variant="primary" icon={<Plus size={15} aria-hidden="true" />}>Start a discussion</ButtonLink>
      </TopBarActions>
      <div className="flex min-w-0 flex-col gap-8 min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:gap-0">
        <div className="min-w-0 flex-1 space-y-9 min-[1100px]:pr-10">
          <header className="canopy-rise flex min-w-0 flex-wrap items-end gap-x-5 gap-y-4 border-b border-border-subtle pb-7">
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-editorial-cream font-serif text-[1.5rem] text-brand-primary">{workspaceInitials(workspace.data.name)}</span>
            <div className="min-w-0 flex-1">
              <p className="type-canopy-label m-0 text-xs tracking-[0.06em]">Workspace · /{workspace.data.slug}</p>
              <h1 className="type-canopy-title mt-1.5 text-[2.35rem] wrap-anywhere sm:text-[2.875rem]">{workspace.data.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-text-muted">
                {roleLabel ? <><span>You are {roleLabel === "Owner" ? "the owner" : `${roleLabel === "Admin" ? "an admin" : "a member"}`}</span><span aria-hidden="true">·</span></> : null}
                <span>Created {dateLabel(workspace.data.createdAt)}</span>
                {!discussions.isLoading && !discussions.isError ? <><span aria-hidden="true">·</span><span>{countLabel(discussionItems.length, Boolean(discussions.hasNextPage), "discussion", "discussions")}</span></> : null}
              </div>
            </div>
          </header>

          {week ? <ThisWeek card={week} /> : null}

          <section aria-labelledby="recent-discussions-heading" className="min-w-0">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <SectionLabel id="recent-discussions-heading">Recent discussions</SectionLabel>
              {recent.length > 0 ? <Link href={discussionsHref} className="inline-flex min-h-9 items-center gap-1.5 text-[0.8125rem] font-medium text-brand-link hover:underline">View all discussions <ArrowRight size={14} aria-hidden="true" /></Link> : null}
            </div>
            {discussions.isLoading && !discussions.data ? (
              <div role="status" aria-label="Loading recent discussions" className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} aria-hidden="true" className="flex items-center gap-3 border-t border-border-subtle px-5 py-4 first:border-t-0">
                    <span className="size-8 shrink-0 animate-pulse rounded-full bg-surface-active" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-4 w-2/3 animate-pulse rounded-sm bg-surface-active" />
                      <span className="block h-3 w-1/3 animate-pulse rounded-sm bg-surface-subtle" />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {discussions.error ? (
              <div>
                <ErrorState
                  title={discussionDenied ? "Discussion access restricted" : discussions.data ? "Could not refresh discussions" : "Could not load discussions"}
                  description={discussionDenied ? "You may no longer have access to these discussions." : "Please try again in a moment."}
                />
                {!discussionDenied ? <button type="button" onClick={() => void discussions.refetch()} className="mt-3 text-sm font-semibold text-brand-link hover:text-brand-link-hover">Try again</button> : null}
              </div>
            ) : null}
            {!discussions.isLoading && !discussions.error && discussionItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-6 py-9 sm:px-8">
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-callout text-brand-link"><MessageSquareText size={20} /></span>
                <h3 className="mt-5 font-serif text-[1.625rem] leading-tight text-text-primary">Begin with a clear question.</h3>
                <p className="mt-2 max-w-[48ch] text-sm leading-6 text-text-secondary">No discussions yet. Share an update or ask what the project needs next; the replies will stay with it.</p>
                <ButtonLink href={`${discussionsHref}#new-discussion`} variant="primary" className="mt-5" icon={<Plus size={15} aria-hidden="true" />}>Start the first discussion</ButtonLink>
              </div>
            ) : null}
            {recent.length > 0 ? (
              <ol className="canopy-rise overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
                {recent.map((item) => <DiscussionRow key={item.id} discussion={item} workspaceId={workspaceId} />)}
              </ol>
            ) : null}
          </section>

          <LatestDecisions workspaceId={workspaceId} />
          <RecentActivity workspaceId={workspaceId} />
        </div>

        <ContextPanel label="Workspace context" className="canopy-rise">
          {canViewMembers ? (
            <section aria-labelledby="home-members-heading">
              <h2 id="home-members-heading" className="type-canopy-label m-0 mb-2.5">Contributors</h2>
              {members.isLoading && !members.data ? (
                <div role="status" aria-label="Loading contributors" className="space-y-3">
                  <span className="block h-4 w-3/4 animate-pulse rounded-sm bg-surface-active" />
                  <span className="block h-4 w-1/2 animate-pulse rounded-sm bg-surface-subtle" />
                </div>
              ) : null}
              {members.error ? (
                <div>
                  <ErrorState
                    title={memberDenied ? "Contributor access restricted" : "Could not load contributors"}
                    description={memberDenied ? "Contributor details are not available to your current role." : "Please try again in a moment."}
                  />
                  {!memberDenied ? <button type="button" onClick={() => void members.refetch()} className="mt-3 text-sm font-semibold text-brand-link hover:text-brand-link-hover">Try again</button> : null}
                </div>
              ) : null}
              {members.data && !members.error ? (
                <>
                  <p className="text-xs text-text-muted">{countLabel(memberItems.length, Boolean(members.hasNextPage), "contributor", "contributors")}</p>
                  <ul className="mt-2 flex flex-col">
                    {memberItems.slice(0, 6).map((member) => <MemberRow key={member.id} member={member} />)}
                  </ul>
                  <Link href={membersHref} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-[0.8125rem] font-medium text-brand-link hover:underline">View contributors <ArrowRight size={14} aria-hidden="true" /></Link>
                </>
              ) : null}
            </section>
          ) : null}
          <section aria-labelledby="home-note-heading" className="rounded-xl border border-callout-line bg-callout px-4 py-4">
            <p className="type-canopy-label m-0">Good conversations start here</p>
            <h2 id="home-note-heading" className="mt-2 font-serif text-[1.25rem] leading-snug text-text-primary">Give each question a place to grow.</h2>
            <p className="mt-1.5 leading-relaxed text-text-secondary">Share enough context to invite a useful reply. Keep follow-up decisions in the same discussion so others can find them later.</p>
          </section>
        </ContextPanel>
      </div>
    </div>
  );
}
