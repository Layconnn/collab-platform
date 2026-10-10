"use client";

import { useRef } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { AppIcon } from "@/components/common/AppIcon";

export function AccountMenu({
  user,
  collapsed = false,
}: {
  user: { name: string | null; username: string; email: string };
  collapsed?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const label = user.name?.trim() || user.username || user.email;
  const initials = (user.name?.trim() || user.username || user.email).slice(0, 1).toUpperCase();

  return (
    <details ref={detailsRef} className="group relative">
      <summary
        aria-label={`Account menu for ${label}`}
        title={collapsed ? label : undefined}
        className={`flex min-h-11 w-full cursor-pointer list-none items-center gap-3 rounded-md px-2 text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus-ring ${collapsed ? "justify-center" : ""}`}
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-active text-xs font-semibold text-text-primary">{initials}</span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text-primary">{label}</span>
              <span className="block truncate text-xs text-text-muted">{user.email}</span>
            </span>
            <AppIcon name="chevron" className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
          </>
        ) : null}
      </summary>
      <div className={`absolute bottom-full z-30 mb-2 w-[min(18rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-2 shadow-lg ${collapsed ? "left-full ml-2" : "left-0"}`}>
        <div className="border-b border-border-subtle px-2 pb-3 pt-1">
          <p className="truncate text-sm font-medium text-text-primary">{label}</p>
          <p className="truncate text-xs text-text-muted">{user.email}</p>
        </div>
        <div className="pt-2">
          <SignOutButton />
        </div>
      </div>
    </details>
  );
}
