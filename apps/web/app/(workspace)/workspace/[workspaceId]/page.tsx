"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useWorkspaceDetail } from "@/hooks/useWorkspace";
import { LoadingState, ErrorState } from "@/components/common/StateNotice";

export default function WorkspaceOverviewPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const { data, isLoading, error } = useWorkspaceDetail(workspaceId);

  if (isLoading) {
    return <LoadingState label="Loading workspace..." />;
  }

  if (error || !data) {
    return <ErrorState title="Workspace not found" description={error?.message} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">{data.name}</h1>
        <p className="text-sm text-slate-500">Slug: {data.slug}</p>
      </div>
      <div className="rounded border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-800">Quick actions</h2>
        <div className="mt-3 flex gap-3">
          <Link
            href={`/workspace/${workspaceId}/discussions`}
            className="rounded bg-teal-600 px-4 py-2 text-sm font-semibold text-white"
          >
            View discussions
          </Link>
          <Link
            href={`/workspace/${workspaceId}/members`}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Manage members
          </Link>
        </div>
      </div>
    </div>
  );
}
