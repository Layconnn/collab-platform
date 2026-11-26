"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppIcon, type AppIconName } from "@/components/common/AppIcon";
import { NotificationDropdown } from "@/components/notification/NotificationDropdown";
import { workspaceInitials } from "@/lib/workspace-identity";
import { useUiStore } from "@/stores/ui.store";

type NavItem = { label: string; href: string; icon: AppIconName; active: boolean };
type WorkspaceLink = { workspaceId: string; name: string };

// The forest sidebar's navigation (dashboard redesign PRD, FR-3): Home, Inbox
// and Saved; the current workspace's pages; the member's workspaces.
const rowClasses = (active: boolean, collapsed: boolean) =>
  `flex min-h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-sidebar-live ${collapsed ? "justify-center" : ""} ${active ? "bg-sidebar-active font-medium text-sidebar-text-strong" : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-strong"}`;

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      aria-label={collapsed ? item.label : undefined}
      aria-current={item.active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={rowClasses(item.active, collapsed)}
    >
      <AppIcon name={item.icon} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

export function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 truncate px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-sidebar-muted">{children}</p>;
}

export function WorkspaceNavigation({
  workspaceId,
  workspaceName,
  workspaces = [],
  collapsed = false,
  onNavigate,
}: {
  workspaceId?: string;
  workspaceName?: string;
  workspaces?: WorkspaceLink[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const setCreateWorkspaceOpen = useUiStore((state) => state.setCreateWorkspaceOpen);
  const pathname = usePathname();
  const primary: NavItem[] = [
    { label: "Home", href: "/workspace", icon: "home", active: pathname === "/workspace" },
    { label: "Saved", href: "/saved", icon: "saved", active: pathname.startsWith("/saved") },
  ];
  const workspaceItems: NavItem[] = workspaceId ? [
    { label: "Overview", href: `/workspace/${workspaceId}`, icon: "overview", active: pathname === `/workspace/${workspaceId}` },
    { label: "Discussions", href: `/workspace/${workspaceId}/discussions`, icon: "discussions", active: pathname.startsWith(`/workspace/${workspaceId}/discussions`) },
    { label: "Decisions", href: `/workspace/${workspaceId}/decisions`, icon: "decisions", active: pathname.startsWith(`/workspace/${workspaceId}/decisions`) },
    { label: "Members", href: `/workspace/${workspaceId}/members`, icon: "members", active: pathname.startsWith(`/workspace/${workspaceId}/members`) },
  ] : [];

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Primary navigation" className="flex flex-col gap-0.5">
        <NavLink item={primary[0]!} collapsed={collapsed} onNavigate={onNavigate} />
        <NotificationDropdown variant="sidebar" collapsed={collapsed} />
        <NavLink item={primary[1]!} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>
      {workspaceItems.length ? (
        <div>
          {!collapsed ? <SidebarSectionLabel>{workspaceName ?? "Workspace"}</SidebarSectionLabel> : null}
          <nav aria-label="Workspace navigation" className="flex flex-col gap-0.5">
            {workspaceItems.map((item) => <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />)}
          </nav>
        </div>
      ) : null}
      {!collapsed ? (
        <div>
          <SidebarSectionLabel>Your workspaces</SidebarSectionLabel>
          <nav aria-label="Your workspaces" className="flex flex-col gap-0.5">
            {workspaces.slice(0, 6).map((workspace) => (
              <Link
                key={workspace.workspaceId}
                href={`/workspace/${workspace.workspaceId}`}
                aria-current={workspace.workspaceId === workspaceId ? "true" : undefined}
                onClick={onNavigate}
                className={rowClasses(false, false)}
              >
                <span aria-hidden="true" className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-editorial-cream text-[9px] font-bold text-brand-primary">{workspaceInitials(workspace.name)}</span>
                <span className="truncate">{workspace.name}</span>
              </Link>
            ))}
            <button type="button" onClick={() => { onNavigate?.(); setCreateWorkspaceOpen(true); }} className={`${rowClasses(false, false)} w-full text-left text-sidebar-muted`}>
              <AppIcon name="plus" />
              <span className="truncate">Create workspace</span>
            </button>
          </nav>
        </div>
      ) : (
        <button type="button" aria-label="Create a workspace" title="Create a workspace" onClick={() => setCreateWorkspaceOpen(true)} className={rowClasses(false, true)}>
          <AppIcon name="plus" />
        </button>
      )}
    </div>
  );
}
