"use client";

import Link from "next/link";
import { useState } from "react";

import { LEVELS } from "@/components/settings/NotificationPreferences";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Canopy";
import { useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc/api-client";
import { workspaceInitials } from "@/lib/workspace-identity";

// Settings PRD, FR-14: every workspace you're in, how much of it reaches you,
// and leaving it. An owner hands the workspace on before leaving.

const ROLE = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" } as const;
const notice = "rounded-[10px] border-l-2 px-3 py-2 text-sm";

export function YourWorkspaces({ titleId }: { titleId: string }) {
  const utils = trpc.useUtils();
  const workspaces = useWorkspaceSwitcherList();
  const levels = trpc.preferences.notificationLevels.useQuery();
  const leave = trpc.workspace.leave.useMutation();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const list = workspaces.data?.pages.flatMap((page) => page.items) ?? [];
  const levelOf = (workspaceId: string) => {
    const level = levels.data?.find((row) => row.workspaceId === workspaceId)?.level ?? "ALL";
    return LEVELS.find((item) => item.level === level)?.label ?? "Everything";
  };

  const confirmLeave = (workspaceId: string, name: string) => {
    leave.mutate({ workspaceId }, {
      onSuccess: async () => {
        setConfirming(null);
        setLeft(`You left ${name}.`);
        await Promise.all([utils.workspace.listForUser.invalidate(), utils.preferences.get.invalidate(), utils.preferences.notificationLevels.invalidate()]);
      },
    });
  };

  const problem = leave.error
    ? leave.error.data?.code === "CONFLICT" ? "Transfer ownership before leaving this workspace."
      : leave.error.data?.code === "NOT_FOUND" ? "You're no longer a member of that workspace."
        : leave.error.data?.code === "TOO_MANY_REQUESTS" ? "Too many attempts. Wait a minute and try again."
          : "Could not leave the workspace. Try again."
    : null;

  return <section aria-labelledby={titleId} className="mt-7">
    <h2 id={titleId} className="type-canopy-label m-0 mb-2.5">Your workspaces</h2>
    {list.length ? <ul aria-label="Your workspaces" className="m-0 list-none overflow-hidden rounded-2xl border border-border-subtle bg-surface p-0 shadow-card">
      {list.map((item) => {
        const isOwner = item.role === "OWNER";
        const open = confirming === item.workspaceId;
        return <li key={item.workspaceId} className="border-t border-border-subtle px-5 py-4 first:border-t-0">
          <div className="flex flex-wrap items-center gap-4">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-editorial-cream font-serif text-[1.05rem] text-brand-primary">{workspaceInitials(item.name)}</span>
            <div className="min-w-0 flex-1">
              <p className="m-0 flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-text-primary">
                <Link href={`/workspace/${item.workspaceId}`} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">{item.name}</Link>
                <StatusPill tone={isOwner ? "decided" : "neutral"} className="!py-px text-[11px]">{ROLE[item.role]}</StatusPill>
              </p>
              <p className="m-0 mt-0.5 text-[0.8125rem] text-text-muted">
                Notifications: <Link href="/settings/notifications/workspaces" className="text-brand-link underline underline-offset-2 hover:decoration-2">{levelOf(item.workspaceId)}</Link>
              </p>
            </div>
            {!open ? <Button size="sm" variant="secondary" disabled={isOwner || leave.isPending}
              aria-label={`Leave ${item.name}`} aria-describedby={isOwner ? `owner-${item.workspaceId}` : undefined}
              onClick={() => { setLeft(null); leave.reset(); setConfirming(item.workspaceId); }}>Leave</Button> : null}
          </div>
          {isOwner ? <p id={`owner-${item.workspaceId}`} className="m-0 mt-2 text-[0.8125rem] text-text-muted sm:pl-14">
            You own this workspace. To leave, first <Link href={`/workspace/${item.workspaceId}/members`} className="text-brand-link underline underline-offset-2 hover:decoration-2">transfer ownership</Link> to another member.
          </p> : null}
          {open ? <div role="group" aria-label={`Confirm leaving ${item.name}`} className="mt-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-attention/40 bg-surface-subtle px-4 py-3">
            <p className="m-0 min-w-0 flex-1 basis-64 text-sm text-text-primary">Leave {item.name}? You’ll lose access to its discussions and decisions, and open review requests to you are withdrawn. An admin can add you back.</p>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button size="sm" variant="danger" disabled={leave.isPending} onClick={() => confirmLeave(item.workspaceId, item.name)}>{leave.isPending ? "Leaving..." : "Leave workspace"}</Button>
          </div> : null}
        </li>;
      })}
    </ul> : <p className="m-0 rounded-2xl border border-border-subtle bg-surface p-5 text-sm text-text-muted shadow-card">{workspaces.isLoading ? "Loading your workspaces…" : "You’re not in any workspaces yet."}</p>}
    {problem ? <p role="alert" className={`mt-4 ${notice} border-danger bg-surface-subtle text-danger`}>{problem}</p> : null}
    {left ? <p role="status" className={`mt-4 ${notice} border-success bg-callout text-text-primary`}>{left}</p> : null}
  </section>;
}
