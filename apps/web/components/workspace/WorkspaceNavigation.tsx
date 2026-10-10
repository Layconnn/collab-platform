"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppIcon, type AppIconName } from "@/components/common/AppIcon";

type NavItem = { label: string; href: string; icon: AppIconName; active: boolean };

export function WorkspaceNavigation({
  workspaceId,
  collapsed = false,
  onNavigate,
}: {
  workspaceId?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items: NavItem[] = [
    {
      label: "Workspaces",
      href: "/workspace",
      icon: "workspaces",
      active: pathname === "/workspace",
    },
  ];

  if (workspaceId) {
    items.push(
      { label: "Overview", href: `/workspace/${workspaceId}`, icon: "home", active: pathname === `/workspace/${workspaceId}` },
      { label: "Discussions", href: `/workspace/${workspaceId}/discussions`, icon: "discussions", active: pathname.startsWith(`/workspace/${workspaceId}/discussions`) },
      { label: "Members", href: `/workspace/${workspaceId}/members`, icon: "members", active: pathname.startsWith(`/workspace/${workspaceId}/members`) },
    );
  }

  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-label={collapsed ? item.label : undefined}
          aria-current={item.active ? "page" : undefined}
          title={collapsed ? item.label : undefined}
          onClick={onNavigate}
          className={`flex min-h-10 items-center gap-3 border-l-2 px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring ${collapsed ? "justify-center" : ""} ${item.active ? "border-brand bg-surface-subtle text-brand-800" : "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary"}`}
        >
          <AppIcon name={item.icon} />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
        </Link>
      ))}
      <Link
        href="/workspace#new-workspace"
        aria-label={collapsed ? "Create a workspace" : undefined}
        title={collapsed ? "Create a workspace" : undefined}
        onClick={onNavigate}
        className={`mt-3 flex min-h-10 items-center gap-3 border-l-2 border-transparent px-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring ${collapsed ? "justify-center" : ""}`}
      >
        <AppIcon name="plus" />
        {!collapsed ? <span className="truncate">Create workspace</span> : null}
      </Link>
    </nav>
  );
}
