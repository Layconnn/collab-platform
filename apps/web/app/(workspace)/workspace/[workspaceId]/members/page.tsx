"use client";

import { useParams } from "next/navigation";

import { WorkspaceMembersPanel } from "@/components/workspace/WorkspaceMembersPanel";

export default function WorkspaceMembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Workspace members</h1>
        <p className="text-sm text-slate-600">Manage access for this workspace.</p>
      </div>
      <WorkspaceMembersPanel workspaceId={workspaceId} />
    </section>
  );
}
