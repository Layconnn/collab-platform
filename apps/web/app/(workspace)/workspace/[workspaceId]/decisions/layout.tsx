"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";

import { ErrorState } from "@/components/common/StateNotice";
import { DecisionRail } from "@/components/decision/DecisionRail";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";

// Decisions v2 (dashboard redesign): the grouped list beside the record. On
// large screens both show; on smaller ones the list is the index page and a
// record opens on its own, with a way back.
export default function DecisionsLayout({ children }: { children: ReactNode }) {
  const { workspaceId, decisionId } = useParams<{ workspaceId: string; decisionId?: string }>();
  const workspace = useWorkspaceDetail(workspaceId);
  const denied = ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(workspace.error?.data?.code ?? "");
  if (denied) {
    return <div className="max-w-[52rem] space-y-4"><ErrorState title="Decision access restricted" description="You may no longer have access to this workspace's decisions." /><Link href="/workspace" className="font-semibold text-brand-link">All workspaces</Link></div>;
  }
  return <div className="flex min-w-0 flex-col gap-8 lg:flex-row lg:items-start lg:gap-0">
    <aside className={`min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7.5rem)] lg:w-[21rem] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-border-subtle lg:pr-5 ${decisionId ? "max-lg:hidden" : ""}`}>
      <DecisionRail workspaceId={workspaceId} workspaceName={workspace.data?.name ?? "Workspace"} selectedId={decisionId} />
    </aside>
    <div className={`min-w-0 flex-1 lg:pl-10 ${decisionId ? "" : "max-lg:hidden"}`}>{children}</div>
  </div>;
}
