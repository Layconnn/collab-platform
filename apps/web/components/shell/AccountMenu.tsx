"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AppIcon } from "@/components/common/AppIcon";
import { UserAvatar } from "@/components/common/UserAvatar";
import { resolveUserIdentity } from "@/lib/user-identity";
import { ThemeModePicker } from "@/components/theme/ThemeModePicker";
import { useDismissibleDetails } from "@/components/shell/useDismissibleDetails";

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
      <div className={`absolute bottom-full z-30 mb-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-2 shadow-lg ${collapsed ? "left-full ml-2" : "left-0"}`}>
        <div className="border-b border-border-subtle px-2 pb-3 pt-1">
          <p className="truncate text-sm font-medium text-text-primary">{label}</p>
          <p className="truncate text-xs text-text-muted">{user.email}</p>
        </div>
        <ThemeModePicker className="border-b border-border-subtle px-2 py-3" />
        <Link href="/settings/email" className="mt-2 flex min-h-10 items-center rounded-sm px-2 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">Email settings</Link>
        <div className="pt-1">
          <SignOutButton />
        </div>
      </div>
    </details>
  );
}
