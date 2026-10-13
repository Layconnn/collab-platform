"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  MessageSquareText,
  Plus,
  UsersRound,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/api/root";
import { ErrorState } from "@/components/common/StateNotice";
import { UserAvatar } from "@/components/common/UserAvatar";
import { DiscussionRow } from "@/components/discussion/DiscussionRow";
import { useAuth } from "@/hooks/useAuth";
import { useDiscussionList } from "@/hooks/useDiscussion";
import {
  useWorkspaceDetail,
  useWorkspaceSwitcherList,
} from "@/hooks/useWorkspace";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { resolveUserIdentity } from "@/lib/user-identity";
import { workspaceInitials } from "@/lib/workspace-identity";

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
    <li className="flex min-w-0 items-center gap-3 py-2.5">
      <UserAvatar name={identity.avatarName} className="size-8" />
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

export function WorkspaceHome({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  const workspace = useWorkspaceDetail(workspaceId);
  const discussions = useDiscussionList(workspaceId);
  const workspaces = useWorkspaceSwitcherList(Boolean(user));
  const listedMembership = workspaces.data?.pages
    .flatMap((page) => page.items)
    .find((item) => item.workspaceId === workspaceId);
  const role =
    workspace.data?.ownerId === user?.id ? "OWNER" : listedMembership?.role;
  const canViewMembers = role === "OWNER" || role === "ADMIN";
  const { members } = useWorkspaceMembers(workspaceId, canViewMembers);
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

  return (
    <div className="mx-auto w-full max-w-[1320px] min-w-0 space-y-9">
      <header className="border-b border-border-subtle pb-7">
        <p className="text-xs font-semibold uppercase text-brand-link">
          Workspace /{" "}
          <span className="font-medium normal-case text-text-muted">
            {workspace.data.slug}
          </span>
        </p>
        <div className="mt-5 flex min-w-0 flex-wrap items-start gap-4 sm:gap-5">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-sm bg-brand-accent text-lg font-semibold text-on-brand-accent sm:size-14"
          >
            {workspaceInitials(workspace.data.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="wrap-anywhere text-[1.7rem] leading-tight font-semibold text-text-primary sm:text-[2rem]">
              {workspace.data.name}
            </h1>
            <p className="mt-2 max-w-[60ch] text-sm leading-6 text-text-secondary">
              A shared place for the questions, decisions, and updates that move
              this project forward.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">
              {role ? (
                <span className="rounded-sm border border-border-subtle bg-surface-subtle px-2 py-0.5 font-medium text-text-secondary">
                  {role.charAt(0) + role.slice(1).toLowerCase()}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={14} aria-hidden="true" /> Created{" "}
                {dateLabel(workspace.data.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2.5 sm:ml-[4.75rem] sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            href={`${discussionsHref}#new-discussion`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto"
          >
            <Plus size={17} aria-hidden="true" /> Start a discussion
          </Link>
          <Link
            href={discussionsHref}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-border bg-surface px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary sm:w-auto"
          >
            Browse discussions <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-9 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-12">
        <section
          aria-labelledby="recent-discussions-heading"
          className="min-w-0"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-brand-link">
                Conversation
              </p>
              <h2
                id="recent-discussions-heading"
                className="mt-1 text-xl font-semibold text-text-primary"
              >
                Recent discussions
              </h2>
            </div>
            {!discussions.isLoading && !discussions.isError ? (
              <span className="text-xs text-text-muted">
                {countLabel(
                  discussionItems.length,
                  Boolean(discussions.hasNextPage),
                  "discussion",
                  "discussions",
                )}
              </span>
            ) : null}
          </div>

          {discussions.isLoading && !discussions.data ? (
            <div
              role="status"
              aria-label="Loading recent discussions"
              className="mt-5 border-t border-border-subtle"
            >
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  aria-hidden="true"
                  className="flex items-center gap-4 border-b border-border-subtle py-5"
                >
                  <span className="size-9 shrink-0 animate-pulse rounded-full bg-surface-active" />
                  <span className="flex-1 space-y-2">
                    <span className="block h-4 w-2/3 animate-pulse rounded-sm bg-surface-active" />
                    <span className="block h-3 w-1/3 animate-pulse rounded-sm bg-surface-subtle" />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {discussions.error ? (
            <div className="mt-5">
              <ErrorState
                title={
                  discussionDenied
                    ? "Discussion access restricted"
                    : discussions.data
                      ? "Could not refresh discussions"
                      : "Could not load discussions"
                }
                description={
                  discussionDenied
                    ? "You may no longer have access to these discussions."
                    : "Please try again in a moment."
                }
              />
              {!discussionDenied ? (
                <button
                  type="button"
                  onClick={() => void discussions.refetch()}
                  className="mt-3 text-sm font-semibold text-brand-link hover:text-brand-link-hover"
                >
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
          {!discussions.isLoading &&
          !discussions.error &&
          discussionItems.length === 0 ? (
            <div className="mt-5 border-y border-border-subtle bg-surface-subtle px-5 py-9 sm:px-8">
              <span
                aria-hidden="true"
                className="grid size-10 place-items-center rounded-sm bg-surface-active text-brand-link"
              >
                <MessageSquareText size={20} />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-text-primary">
                Begin with a clear question.
              </h3>
              <p className="mt-2 max-w-[48ch] text-sm leading-6 text-text-secondary">
                No discussions yet. Share an update or ask what the project
                needs next; the replies will stay with it.
              </p>
              <Link
                href={`${discussionsHref}#new-discussion`}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover"
              >
                <Plus size={16} aria-hidden="true" /> Start the first discussion
              </Link>
            </div>
          ) : null}
          {recent.length > 0 ? (
            <ol className="mt-5 border-t border-border-subtle">
              {recent.map((item) => (
                <DiscussionRow
                  key={item.id}
                  discussion={item}
                  workspaceId={workspaceId}
                  compact
                />
              ))}
            </ol>
          ) : null}
          {recent.length > 0 ? (
            <Link
              href={discussionsHref}
              className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-link hover:text-brand-link-hover"
            >
              View all discussions <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </section>

        <aside className="min-w-0 space-y-8" aria-label="Workspace context">
          {canViewMembers ? (
            <section
              aria-labelledby="home-members-heading"
              className="border-t border-border-subtle pt-5"
            >
              <div className="flex items-center gap-2 text-brand-link">
                <UsersRound size={17} aria-hidden="true" />
                <h2
                  id="home-members-heading"
                  className="text-sm font-semibold text-text-primary"
                >
                  Contributors
                </h2>
              </div>
              {members.isLoading && !members.data ? (
                <div
                  role="status"
                  aria-label="Loading contributors"
                  className="mt-4 space-y-3"
                >
                  <span className="block h-4 w-3/4 animate-pulse rounded-sm bg-surface-active" />
                  <span className="block h-4 w-1/2 animate-pulse rounded-sm bg-surface-subtle" />
                </div>
              ) : null}
              {members.error ? (
                <div className="mt-4">
                  <ErrorState
                    title={
                      memberDenied
                        ? "Contributor access restricted"
                        : "Could not load contributors"
                    }
                    description={
                      memberDenied
                        ? "Contributor details are not available to your current role."
                        : "Please try again in a moment."
                    }
                  />
                  {!memberDenied ? (
                    <button
                      type="button"
                      onClick={() => void members.refetch()}
                      className="mt-3 text-sm font-semibold text-brand-link hover:text-brand-link-hover"
                    >
                      Try again
                    </button>
                  ) : null}
                </div>
              ) : null}
              {members.data && !members.error ? (
                <>
                  <p className="mt-2 text-xs text-text-muted">
                    {countLabel(
                      memberItems.length,
                      Boolean(members.hasNextPage),
                      "contributor",
                      "contributors",
                    )}
                  </p>
                  <ul className="mt-3 divide-y divide-border-subtle">
                    {memberItems.slice(0, 4).map((member) => (
                      <MemberRow key={member.id} member={member} />
                    ))}
                  </ul>
                  <Link
                    href={membersHref}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-link hover:text-brand-link-hover"
                  >
                    View contributors{" "}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </>
              ) : null}
            </section>
          ) : null}

          <section
            className="border-l-2 border-brand-accent bg-surface-subtle px-5 py-5"
            aria-labelledby="home-note-heading"
          >
            <p className="text-xs font-semibold uppercase text-brand-link">
              Good conversations start here
            </p>
            <h2
              id="home-note-heading"
              className="mt-2 text-base font-semibold text-text-primary"
            >
              Give each question a place to grow.
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Share enough context to invite a useful reply. Keep follow-up
              decisions in the same discussion so others can find them later.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
