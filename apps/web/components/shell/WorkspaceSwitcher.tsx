"use client";

import Link from "next/link";
import { useRef } from "react";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/api/root";
import { AppIcon } from "@/components/common/AppIcon";
import { workspaceInitials } from "@/lib/workspace-identity";

type WorkspaceSummary = inferRouterOutputs<AppRouter>["workspace"]["listForUser"]["items"][number];

function targetForWorkspace(pathname: string, workspaceId: string) {
  if (pathname.includes("/members")) return `/workspace/${workspaceId}/members`;
  if (pathname.includes("/discussions")) return `/workspace/${workspaceId}/discussions`;
  return `/workspace/${workspaceId}`;
}

export function WorkspaceSwitcher({
  pathname,
  currentId,
  currentWorkspace,
  workspaces,
  isLoading,
  hasError,
  hasMore,
  isFetchingMore,
  onLoadMore,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  currentId?: string;
  currentWorkspace?: { name: string };
  workspaces: WorkspaceSummary[];
  isLoading: boolean;
  hasError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = workspaces.find((workspace) => workspace.workspaceId === currentId);
  const label = currentWorkspace?.name ?? selected?.name ?? (currentId ? "Loading workspace..." : "Your workspaces");
  const closeMenu = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    onNavigate?.();
  };

  return (
    <details ref={detailsRef} className="group relative">
      <summary
        aria-label={`Switch workspace. Current: ${label}`}
        title={collapsed ? label : undefined}
        className={`flex min-h-11 w-full cursor-pointer list-none items-center gap-2 rounded-md text-left outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus-ring ${collapsed ? "justify-center px-1" : "px-2"}`}
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-100 text-xs font-semibold text-brand-800">
          {currentWorkspace?.name || selected?.name ? workspaceInitials(label) : <AppIcon name="workspaces" />}
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-medium leading-4 text-text-muted">WORKSPACE</span>
              <span className="block truncate text-sm font-semibold leading-5 text-text-primary">{label}</span>
            </span>
            <AppIcon name="chevron" className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
          </>
        ) : null}
      </summary>
      <div className={`z-30 overflow-y-auto rounded-md border border-border bg-surface ${collapsed ? "absolute left-full top-0 ml-2 max-h-[calc(100dvh-5rem)] w-[min(18rem,calc(100vw-5.5rem))] shadow-lg" : "mt-2 max-h-[min(20rem,50dvh)] w-full shadow-sm"}`}>
        <p className="px-3 pb-2 pt-3 text-xs font-medium text-text-muted">Switch workspace</p>
        <div className="p-1">
          {isLoading ? (
            <div aria-label="Loading workspaces" className="space-y-2 p-3" role="status">
              <span className="block h-3 w-2/3 animate-pulse rounded bg-surface-active" />
              <span className="block h-3 w-1/2 animate-pulse rounded bg-surface-active" />
            </div>
          ) : hasError ? (
            <p className="px-3 py-2 text-sm text-text-secondary">Workspaces could not be loaded.</p>
          ) : workspaces.length ? (
            <nav aria-label="Available workspaces">
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.workspaceId}
                  href={targetForWorkspace(pathname, workspace.workspaceId)}
                  aria-current={workspace.workspaceId === currentId ? "page" : undefined}
                  onClick={closeMenu}
                  className="flex min-h-10 items-center gap-3 rounded px-2 text-sm text-text-secondary hover:bg-surface-subtle hover:text-text-primary focus-visible:bg-surface-subtle"
                >
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded bg-surface-subtle text-[10px] font-semibold text-brand-700">{workspaceInitials(workspace.name)}</span>
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {workspace.workspaceId === currentId ? <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" /> : null}
                </Link>
              ))}
            </nav>
          ) : (
            <p className="px-3 py-2 text-sm text-text-secondary">No workspaces yet.</p>
          )}
          {!isLoading && hasMore ? (
            <button type="button" onClick={onLoadMore} disabled={isFetchingMore} className="flex min-h-10 w-full items-center justify-center rounded px-2 text-xs font-medium text-brand-700 hover:bg-surface-subtle disabled:opacity-60">
              {isFetchingMore ? "Loading more..." : "Load more workspaces"}
            </button>
          ) : null}
        </div>
        <div className="border-t border-border-subtle p-1">
          <Link href="/workspace#new-workspace" onClick={closeMenu} className="flex min-h-10 items-center gap-2 rounded px-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary">
            <AppIcon name="plus" />
            Create a workspace
          </Link>
          <Link href="/workspace" onClick={closeMenu} className="flex min-h-10 items-center gap-2 rounded px-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary">
            <AppIcon name="workspaces" />
            All workspaces
            {hasMore ? <span className="ml-auto text-xs text-text-muted">More</span> : null}
          </Link>
        </div>
      </div>
    </details>
  );
}
