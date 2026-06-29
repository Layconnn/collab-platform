"use client";

import Link from "next/link";

import { useWorkspaceList } from "@/hooks/useWorkspace";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";

export function WorkspaceList() {
  const { data, isLoading, error } = useWorkspaceList();

  if (isLoading) {
    return <LoadingState label="Loading workspaces..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load workspaces" description={error.message} />;
  }

  if (!data || data.items.length === 0) {
    return <EmptyState title="No workspaces yet" description="Create your first workspace." />;
  }

  return (
    <ul className="space-y-3">
      {data.items.map((workspace) => (
        <li key={workspace.workspaceId} className="rounded border border-slate-200 p-4">
          <Link href={`/workspace/${workspace.workspaceId}`}>
            <div className="text-base font-semibold text-slate-900">{workspace.name}</div>
            <div className="text-xs text-slate-500">{workspace.slug}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
