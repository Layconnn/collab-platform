"use client";

import Link from "next/link";
import { IconButton } from "@chakra-ui/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { AccountMenu } from "@/components/shell/AccountMenu";
import { AppIcon } from "@/components/common/AppIcon";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { CommandPalette, ShortcutsSheet, useCommandShortcuts } from "@/components/command/CommandPalette";
import { CreateWorkspaceDialog } from "@/components/workspace/CreateWorkspaceDialog";
import { TopBarSlotProvider, useTopBarSlot } from "@/components/shell/TopBarActions";
import { isMacPlatform } from "@/components/command/commandItems";
import { NotificationDropdown } from "@/components/notification/NotificationDropdown";
import { WorkspaceNavigation } from "@/components/workspace/WorkspaceNavigation";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceDetail, useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { useUiStore } from "@/stores/ui.store";

type WorkspaceItems = NonNullable<ReturnType<typeof useWorkspaceSwitcherList>["data"]>["pages"][number]["items"];

function currentWorkspaceId(pathname: string) {
  return pathname.match(/^\/workspace\/([^/]+)/)?.[1];
}

// How far below a workspace section the page is: 0 on /workspace/<id>/decisions,
// 1 on a decision.
function sectionDepth(pathname: string) {
  return Math.max(0, pathname.split("/").filter(Boolean).length - 3);
}

function pageContext(pathname: string) {
  if (pathname === "/workspace") return "Home";
  if (pathname.startsWith("/search")) return "Search";
  if (pathname.startsWith("/saved")) return "Saved";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.includes("/members")) return "Members";
  if (pathname.includes("/discussions")) return "Discussions";
  if (pathname.includes("/decisions")) return "Decisions";
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
  onRetryWorkspaces,
  hasMoreWorkspaces,
  loadingMoreWorkspaces,
  onLoadMoreWorkspaces,
  user,
  onToggle,
  showBrandHeader = true,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  pathname: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaces: WorkspaceItems;
  workspacesLoading: boolean;
  workspacesError: boolean;
  onRetryWorkspaces: () => void;
  hasMoreWorkspaces: boolean;
  loadingMoreWorkspaces: boolean;
  onLoadMoreWorkspaces: () => void;
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  onToggle?: () => void;
  showBrandHeader?: boolean;
}) {
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-3 pb-4 pt-3.5">
      {showBrandHeader ? <span className="sr-only">Commons</span> : null}
      <div className="shrink-0">
        <WorkspaceSwitcher
          pathname={pathname}
          currentId={workspaceId}
          currentWorkspace={workspaceName ? { name: workspaceName } : undefined}
          workspaces={workspaces}
          isLoading={workspacesLoading}
          hasError={workspacesError}
          onRetry={onRetryWorkspaces}
          hasMore={hasMoreWorkspaces}
          isFetchingMore={loadingMoreWorkspaces}
          onLoadMore={onLoadMoreWorkspaces}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>

      <button
        type="button"
        onClick={() => { onNavigate?.(); setCommandPaletteOpen(true); }}
        aria-keyshortcuts="Control+K Meta+K"
        aria-label={collapsed ? "Search or jump to" : undefined}
        title={collapsed ? "Search or jump to" : undefined}
        className={`flex min-h-[34px] shrink-0 items-center gap-2 rounded-[9px] border border-sidebar-line bg-sidebar-field px-2.5 text-[0.8125rem] text-sidebar-muted transition-colors duration-150 ease-out hover:text-sidebar-text-strong focus-visible:outline-2 focus-visible:outline-sidebar-live ${collapsed ? "justify-center" : ""}`}
      >
        <AppIcon name="search" />
        {!collapsed ? <>
          <span className="flex-1 text-left">Search or jump to</span>
          <kbd suppressHydrationWarning className="rounded-[5px] bg-sidebar-hover px-1.5 py-px font-mono text-[11px] text-sidebar-text">{isMacPlatform() ? "⌘K" : "Ctrl K"}</kbd>
        </> : null}
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkspaceNavigation workspaceId={workspaceId} workspaceName={workspaceName} workspaces={workspaces} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        {onToggle ? (
          <IconButton type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} size="sm" variant="ghost" className={`!text-sidebar-muted hover:!bg-sidebar-hover hover:!text-sidebar-text-strong ${collapsed ? "w-full" : "self-end"}`} onClick={onToggle}>
            <AppIcon name={collapsed ? "panel-open" : "panel"} />
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
  const workspaceUnavailable = ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(workspaceDetail.error?.data?.code ?? "");
  const visibleWorkspaceId = workspaceUnavailable ? undefined : workspaceId;
  const workspaces = (workspacesQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((item) => !workspaceUnavailable || item.workspaceId !== workspaceId);
  const selectedWorkspace = workspaces.find((item) => item.workspaceId === visibleWorkspaceId);
  const workspaceName = selectedWorkspace?.name ?? (workspaceUnavailable ? undefined : workspaceDetail.data?.name);

  const sidebarExpanded = useUiStore((state) => state.isSidebarOpen);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const mobileNavOpen = useUiStore((state) => state.isMobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  useCommandShortcuts();
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);
  const { slot, slotRef } = useTopBarSlot();

  useEffect(() => {
    if (!mobileNavOpen) return;

    const mobileTrigger = mobileTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mobilePanelRef.current?.querySelector("details[open]")) return;
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
      workspaceId={visibleWorkspaceId}
      workspaceName={workspaceName}
      workspaces={workspaces}
      workspacesLoading={workspacesQuery.isLoading}
      workspacesError={workspacesQuery.isError}
      onRetryWorkspaces={() => void workspacesQuery.refetch()}
      hasMoreWorkspaces={Boolean(workspacesQuery.hasNextPage)}
      loadingMoreWorkspaces={workspacesQuery.isFetchingNextPage}
      onLoadMoreWorkspaces={() => void workspacesQuery.fetchNextPage()}
      user={user!}
      onToggle={toggleSidebar}
    />
  );

  const context = pageContext(pathname);
  const contextName = workspaceUnavailable
    ? "Workspace unavailable"
    : workspaceName ?? (workspaceId ? "Loading workspace" : context);

  return (
    <div className={`min-h-screen bg-canvas text-text-primary md:grid md:transition-[grid-template-columns] md:duration-150 motion-reduce:transition-none ${sidebarExpanded ? "md:grid-cols-[16.5rem_minmax(0,1fr)]" : "md:grid-cols-[4.5rem_minmax(0,1fr)]"}`}>
      <a href="#main-content" className="sr-only z-[60] rounded bg-surface px-3 py-2 text-sm font-medium text-text-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside
        aria-label="Application sidebar"
        inert={mobileNavOpen}
        className="sticky top-0 z-30 hidden h-dvh min-w-0 self-start border-r border-sidebar-line bg-sidebar text-sidebar-text md:block"
      >
        {sidebarContent}
      </aside>

      <div inert={mobileNavOpen} className="min-h-screen min-w-0">
        <header className="glass-bar sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b px-4 py-2.5 sm:px-7">
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
            <span className="min-w-0 truncate text-sm font-medium text-text-primary">{contextName}</span>
          </div>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-[0.8125rem] text-text-muted md:flex">
            <Link href="/workspace" className="shrink-0 hover:text-text-primary">Home</Link>
            {visibleWorkspaceId ? <><span aria-hidden="true">/</span><Link href={`/workspace/${visibleWorkspaceId}`} className="max-w-64 truncate hover:text-text-primary">{contextName}</Link></> : null}
            {visibleWorkspaceId && context !== "Overview" ? <><span aria-hidden="true">/</span>{sectionDepth(pathname) > 0
              // On a discussion or a decision, the section leads back to its list.
              ? <Link href={`/workspace/${visibleWorkspaceId}/${context.toLowerCase()}`} className="shrink-0 hover:text-text-primary">{context}</Link>
              : <span aria-current="page" className="font-medium text-text-primary">{context}</span>}</> : null}
            {!visibleWorkspaceId && context !== "Home" ? <><span aria-hidden="true">/</span><span aria-current="page" className="font-medium text-text-primary">{context}</span></> : null}
          </nav>
          {/* Search and the inbox stay on the first line on phones; a page's
              own actions take a line of their own below them. */}
          <div className="ml-auto flex shrink-0 items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Search or jump to"
              className="grid size-9 place-items-center rounded-[9px] text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              <AppIcon name="search" />
            </button>
            <NotificationDropdown compact />
          </div>
          <div ref={slotRef} className="flex min-w-0 flex-wrap items-center gap-2 empty:hidden max-sm:order-last max-sm:w-full sm:ml-auto md:justify-end" />
        </header>

        <main id="main-content" className="w-full min-w-0 max-w-none wrap-anywhere px-5 pb-12 pt-8 sm:px-7 lg:px-10">
          <TopBarSlotProvider slot={slot}>{children}</TopBarSlotProvider>
        </main>
        <CommandPalette />
        <ShortcutsSheet />
        <CreateWorkspaceDialog />
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
            className="relative z-10 flex h-full w-[min(20rem,calc(100%-2.5rem))] flex-col bg-sidebar text-sidebar-text shadow-xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-line px-3">
              <Link href="/workspace" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-2.5 rounded text-sidebar-text-strong focus-visible:ring-2 focus-visible:ring-sidebar-live">
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-editorial-cream text-sm font-bold text-brand-primary">C</span>
                <span className="text-sm font-semibold">Commons</span>
              </Link>
              <IconButton ref={mobileCloseRef} type="button" aria-label="Close navigation" size="sm" variant="ghost" className="!text-sidebar-text hover:!bg-sidebar-hover" onClick={() => setMobileNavOpen(false)}>
                <AppIcon name="close" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <SidebarContent
                collapsed={false}
                showBrandHeader={false}
                onNavigate={() => setMobileNavOpen(false)}
                pathname={pathname}
                workspaceId={visibleWorkspaceId}
                workspaceName={workspaceName}
                workspaces={workspaces}
                workspacesLoading={workspacesQuery.isLoading}
                workspacesError={workspacesQuery.isError}
                onRetryWorkspaces={() => void workspacesQuery.refetch()}
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
    <div className="min-h-screen bg-canvas md:grid md:grid-cols-[16.5rem_minmax(0,1fr)]" role="status" aria-label="Checking your session">
      <aside aria-hidden="true" className="sticky top-0 hidden h-dvh min-w-0 self-start bg-sidebar p-4 md:block">
        <div className="h-12 animate-pulse rounded-[10px] bg-sidebar-hover" />
        <div className="mt-4 h-[34px] animate-pulse rounded-[9px] bg-sidebar-field" />
        <div className="mt-6 space-y-2"><div className="h-[34px] animate-pulse rounded-lg bg-sidebar-hover" /><div className="h-[34px] animate-pulse rounded-lg bg-sidebar-hover" /><div className="h-[34px] animate-pulse rounded-lg bg-sidebar-hover" /></div>
      </aside>
      <div className="min-w-0">
        <header aria-hidden="true" className="h-14 border-b border-border-subtle bg-canvas px-4">
          <div className="ml-auto h-8 w-24 animate-pulse rounded bg-surface-subtle" />
        </header>
        <main className="px-4 py-6" aria-live="polite">
          <p className="text-sm text-text-muted">Checking your session...</p>
        </main>
      </div>
    </div>
  );
}
