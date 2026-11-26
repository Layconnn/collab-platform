"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AppIcon } from "@/components/common/AppIcon";
import { UserAvatar } from "@/components/common/UserAvatar";
import { resolveUserIdentity } from "@/lib/user-identity";
import { ThemeModePicker } from "@/components/theme/ThemeModePicker";
import { useDismissibleDetails } from "@/components/shell/useDismissibleDetails";
import { menuItemClasses, solidPanelClasses } from "@/components/ui/overlay";

export function AccountMenu({
  user,
  collapsed = false,
}: {
  user: { name: string | null; username: string; email: string };
  collapsed?: boolean;
}) {
  const { detailsRef, summaryRef } = useDismissibleDetails();
  const identity = resolveUserIdentity(user);
  const label = identity.label;

  return (
    <details ref={detailsRef} className="group relative">
      <summary
        ref={summaryRef}
        aria-label={`Account menu for ${label}`}
        title={collapsed ? label : undefined}
        className={`flex min-h-12 w-full cursor-pointer list-none items-center gap-2.5 rounded-[10px] bg-sidebar-field px-2 text-left transition-colors duration-150 ease-out hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-sidebar-live ${collapsed ? "justify-center" : ""}`}
      >
        <UserAvatar name={identity.avatarName} className="size-8 !bg-sidebar-live !text-brand-primary" />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-medium text-sidebar-text-strong">{label}</span>
              <span className="block truncate text-xs text-sidebar-muted">{user.username}</span>
            </span>
            <AppIcon name="chevron" className="size-4 shrink-0 text-sidebar-muted transition-transform group-open:rotate-180" />
          </>
        ) : null}
      </summary>
      <div className={`${solidPanelClasses} absolute bottom-full z-30 mb-2 w-[min(18rem,calc(100vw-2rem))] p-1.5 ${collapsed ? "left-full ml-2" : "left-0"}`}>
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-2 pb-3 pt-2">
          <UserAvatar name={identity.avatarName} className="size-9" />
          <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{label}</p>
          <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
        </div>
        <ThemeModePicker className="border-b border-border-subtle px-2 py-3" />
        <Link href="/settings" className={`${menuItemClasses} mt-1.5`}><AppIcon name="settings" />Settings</Link>
        <div className="border-t border-border-subtle pt-1.5 mt-1.5">
          <SignOutButton />
        </div>
      </div>
    </details>
  );
}
