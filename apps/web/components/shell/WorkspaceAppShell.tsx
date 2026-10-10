"use client";

import Link from "next/link";
import { IconButton } from "@chakra-ui/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { AccountMenu } from "@/components/shell/AccountMenu";
import { AppIcon } from "@/components/common/AppIcon";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { NotificationDropdown } from "@/components/notification/NotificationDropdown";
import { WorkspaceNavigation } from "@/components/workspace/WorkspaceNavigation";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceDetail, useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { useUiStore } from "@/stores/ui.store";

type WorkspaceItems = NonNullable<ReturnType<typeof useWorkspaceSwitcherList>["data"]>["pages"][number]["items"];

function currentWorkspaceId(pathname: string) {
  return pathname.match(/^\/workspace\/([^/]+)/)?.[1];
}

function pageContext(pathname: string) {
  if (pathname === "/workspace") return "Workspaces";
  if (pathname.includes("/members")) return "Members";
  if (pathname.includes("/discussions")) return "Discussions";
  return "Overview";
}

function SidebarContent({
  collapsed,
  onNavigate,
  pathname,
  workspaceId,
  workspaceName,
  workspaces,
  workspacesLoading,
  workspacesError,
  hasMoreWorkspaces,
  loadingMoreWorkspaces,
  onLoadMoreWorkspaces,
  user,
  onToggle,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  pathname: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaces: WorkspaceItems;
  workspacesLoading: boolean;
  workspacesError: boolean;
  hasMoreWorkspaces: boolean;
  loadingMoreWorkspaces: boolean;
  onLoadMoreWorkspaces: () => void;
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  onToggle?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex h-14 shrink-0 items-center border-b border-border-subtle px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        <Link href="/workspace" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5 rounded focus-visible:ring-2 focus-visible:ring-focus-ring" aria-label="Commons home">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-700 text-sm font-bold text-white">C</span>
          {!collapsed ? <span className="truncate text-sm font-semibold text-text-primary">Commons</span> : null}
        </Link>
        {!collapsed && onToggle ? (
          <IconButton type="button" aria-label="Collapse sidebar" title="Collapse sidebar" size="sm" variant="ghost" onClick={onToggle}>
            <AppIcon name="panel" />
          </IconButton>
        ) : null}
      </div>

      <div className="shrink-0 p-3">
        <WorkspaceSwitcher
          pathname={pathname}
          currentId={workspaceId}
          currentWorkspace={workspaceName ? { name: workspaceName } : undefined}
          workspaces={workspaces}
          isLoading={workspacesLoading}
          hasError={workspacesError}
          hasMore={hasMoreWorkspaces}
          isFetchingMore={loadingMoreWorkspaces}
          onLoadMore={onLoadMoreWorkspaces}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {!collapsed ? <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase text-text-muted">Workspace</p> : null}
        <WorkspaceNavigation workspaceId={workspaceId} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      <div className="shrink-0 border-t border-border-subtle p-3">
        {collapsed && onToggle ? (
          <IconButton type="button" aria-label="Expand sidebar" title="Expand sidebar" size="sm" variant="ghost" className="mb-2 w-full" onClick={onToggle}>
            <AppIcon name="panel-open" />
          </IconButton>
        ) : null}
        <AccountMenu user={user} collapsed={collapsed} />
      </div>
    </div>
  );
}

export function WorkspaceAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const workspaceId = currentWorkspaceId(pathname);
  const { user } = useAuth();
  const workspacesQuery = useWorkspaceSwitcherList(Boolean(user));
  const workspaceDetail = useWorkspaceDetail(workspaceId ?? "", Boolean(user && workspaceId));
  const workspaces = workspacesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const selectedWorkspace = workspaces.find((item) => item.workspaceId === workspaceId);
  const workspaceName = selectedWorkspace?.name ?? workspaceDetail.data?.name;

  const sidebarExpanded = useUiStore((state) => state.isSidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const mobileNavOpen = useUiStore((state) => state.isMobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (!mobileNavOpen) return;

    const mobileTrigger = mobileTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab" || !mobilePanelRef.current) return;

      const focusable = Array.from(
        mobilePanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      mobileTrigger?.focus();
    };
  }, [mobileNavOpen, setMobileNavOpen]);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setMobileNavOpen(false);
    }
  }, [pathname, setMobileNavOpen]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileNavOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [setMobileNavOpen]);

  const sidebarContent = (
    <SidebarContent
      collapsed={sidebarExpanded === false}
      pathname={pathname}
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      workspaces={workspaces}
      workspacesLoading={workspacesQuery.isLoading}
      workspacesError={workspacesQuery.isError}
      hasMoreWorkspaces={Boolean(workspacesQuery.hasNextPage)}
      loadingMoreWorkspaces={workspacesQuery.isFetchingNextPage}
      onLoadMoreWorkspaces={() => void workspacesQuery.fetchNextPage()}
      user={user!}
      onToggle={toggleSidebar}
    />
  );

  const context = pageContext(pathname);
  const contextName = workspaceName ?? (workspaceId ? "Loading workspace" : "Workspaces");

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <a href="#main-content" className="sr-only z-[60] rounded bg-surface px-3 py-2 text-sm font-medium text-text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside
        aria-label="Application sidebar"
        inert={mobileNavOpen}
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-border-subtle bg-surface md:block ${sidebarExpanded ? "w-64" : "w-[4.5rem]"}`}
      >
        {sidebarContent}
      </aside>

      <div inert={mobileNavOpen} className={`min-h-screen min-w-0 transition-[padding] duration-150 motion-reduce:transition-none ${sidebarExpanded ? "md:pl-64" : "md:pl-[4.5rem]"}`}>
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border-subtle bg-surface px-3 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <IconButton
              ref={mobileTriggerRef}
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-workspace-navigation"
              size="sm"
              variant="ghost"
              onClick={() => setMobileNavOpen(true)}
            >
              <AppIcon name="menu" />
            </IconButton>
            <Link href="/workspace" className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-700 text-sm font-bold text-white" aria-label="Commons home">C</Link>
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">{contextName}</span>
          </div>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-xs text-text-muted md:flex">
            <Link href="/workspace" className="shrink-0 hover:text-text-primary">Workspaces</Link>
            {workspaceId ? <><span aria-hidden="true">/</span><Link href={`/workspace/${workspaceId}`} className="max-w-64 truncate hover:text-text-primary">{contextName}</Link></> : null}
            {workspaceId && context !== "Overview" ? <><span aria-hidden="true">/</span><span aria-current="page" className="text-text-secondary">{context}</span></> : null}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationDropdown compact />
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full min-w-0 max-w-none px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/35" onClick={() => setMobileNavOpen(false)} />
          <aside
            ref={mobilePanelRef}
            id="mobile-workspace-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            tabIndex={-1}
            className="relative z-10 flex h-full w-[min(20rem,calc(100%-2.5rem))] flex-col border-r border-border bg-surface shadow-xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-3">
              <Link href="/workspace" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-2.5 rounded focus-visible:ring-2 focus-visible:ring-focus-ring">
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-brand-700 text-sm font-bold text-white">C</span>
                <span className="text-sm font-semibold">Commons</span>
              </Link>
              <IconButton ref={mobileCloseRef} type="button" aria-label="Close navigation" size="sm" variant="ghost" onClick={() => setMobileNavOpen(false)}>
                <AppIcon name="close" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <SidebarContent
                collapsed={false}
                onNavigate={() => setMobileNavOpen(false)}
                pathname={pathname}
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                workspaces={workspaces}
                workspacesLoading={workspacesQuery.isLoading}
                workspacesError={workspacesQuery.isError}
                hasMoreWorkspaces={Boolean(workspacesQuery.hasNextPage)}
                loadingMoreWorkspaces={workspacesQuery.isFetchingNextPage}
                onLoadMoreWorkspaces={() => void workspacesQuery.fetchNextPage()}
                user={user!}
              />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceShellLoading() {
  return (
    <div className="min-h-screen bg-canvas" role="status" aria-label="Checking your session">
      <aside aria-hidden="true" className="fixed inset-y-0 left-0 hidden w-64 border-r border-border-subtle bg-surface p-4 md:block">
        <div className="h-8 w-32 animate-pulse rounded bg-surface-active" />
        <div className="mt-8 h-11 animate-pulse rounded bg-surface-subtle" />
        <div className="mt-8 space-y-3"><div className="h-9 animate-pulse rounded bg-surface-subtle" /><div className="h-9 animate-pulse rounded bg-surface-subtle" /><div className="h-9 animate-pulse rounded bg-surface-subtle" /></div>
      </aside>
      <header aria-hidden="true" className="h-14 border-b border-border-subtle bg-surface px-4 md:ml-64">
        <div className="ml-auto h-8 w-24 animate-pulse rounded bg-surface-subtle" />
      </header>
      <main className="px-4 py-6 md:ml-64" aria-live="polite">
        <p className="text-sm text-text-muted">Checking your session...</p>
      </main>
    </div>
  );
}
