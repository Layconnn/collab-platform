"use client";

import Link from "next/link";
import { ArrowUpRight, Building2, LoaderCircle } from "lucide-react";

import { useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { workspaceInitials } from "@/lib/workspace-identity";
import { ErrorState } from "@/components/common/StateNotice";

export function WorkspaceList() {
  const query = useWorkspaceSwitcherList();
  const workspaces = query.data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = Boolean(query.hasNextPage);

  if (query.isLoading && !query.data) {
    return (
      <div
        role="status"
        aria-label="Loading workspaces"
        className="border-t border-border-subtle"
      >
        <span className="sr-only">Loading workspaces...</span>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            aria-hidden="true"
            className="flex items-center gap-4 border-b border-border-subtle py-5"
          >
            <span className="size-10 shrink-0 animate-pulse rounded-sm bg-surface-active" />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block h-4 w-2/5 animate-pulse rounded-sm bg-surface-active" />
              <span className="block h-3 w-1/4 animate-pulse rounded-sm bg-surface-subtle" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (query.error && !query.data) {
    return (
      <div className="space-y-3">
        <ErrorState
          title="Could not load workspaces"
          description="Your workspace list is temporarily unavailable."
        />
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="min-h-11 text-sm font-semibold text-brand-link hover:text-brand-link-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!workspaces.length) {
    return (
      <div className="border-y border-border-subtle bg-surface-subtle px-5 py-9 sm:px-7">
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-sm bg-surface-active text-brand-link"
        >
          <Building2 size={21} />
        </span>
        <h3 className="mt-5 text-lg font-semibold text-text-primary">
          Your first workspace starts here.
        </h3>
        <p className="mt-2 max-w-[48ch] text-sm leading-6 text-text-secondary">
          Give your project a shared place for discussions, replies, and the
          people who contribute.
        </p>
        <a
          href="#new-workspace"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-link hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          Create a workspace{" "}
          <ArrowUpRight size={15} className="ml-1" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs font-medium text-text-muted">
        {workspaces.length}
        {hasMore ? "+" : ""}{" "}
        {workspaces.length === 1 && !hasMore ? "workspace" : "workspaces"}
      </p>
      <ul className="border-t border-border-subtle">
        {workspaces.map((workspace) => (
          <li
            key={workspace.workspaceId}
            className="border-b border-border-subtle"
          >
            <Link
              href={`/workspace/${workspace.workspaceId}`}
              className="group flex min-h-[4.75rem] min-w-0 items-center gap-3 rounded-sm px-2 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring motion-reduce:transition-none sm:gap-4 sm:px-3"
            >
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-sm bg-brand-100 text-xs font-semibold text-brand-800"
              >
                {workspaceInitials(workspace.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block wrap-anywhere text-sm font-semibold leading-5 text-text-primary group-hover:text-brand-link sm:text-base">
                  {workspace.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-text-muted">
                  /{workspace.slug}
                </span>
              </span>
              <span className="hidden shrink-0 rounded-sm border border-border-subtle bg-surface-subtle px-2 py-1 text-xs font-medium text-text-secondary sm:inline-flex">
                {workspace.role.charAt(0) +
                  workspace.role.slice(1).toLowerCase()}
              </span>
              <ArrowUpRight
                size={16}
                className="shrink-0 text-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
      {query.error && query.data ? (
        <div className="mt-4 space-y-2">
          <ErrorState
            title="Could not refresh workspaces"
            description="The workspaces already loaded remain available."
          />
          <button
            type="button"
            onClick={() =>
              void (query.isFetchNextPageError
                ? query.fetchNextPage()
                : query.refetch())
            }
            className="min-h-11 text-sm font-semibold text-brand-link"
          >
            Try again
          </button>
        </div>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-sm border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
        >
          {query.isFetchingNextPage ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {query.isFetchingNextPage
            ? "Loading workspaces..."
            : "Load more workspaces"}
        </button>
      ) : null}
    </div>
  );
}
