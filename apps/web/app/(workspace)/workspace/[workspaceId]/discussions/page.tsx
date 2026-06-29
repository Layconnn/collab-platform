"use client";

import { useParams } from "next/navigation";

import { CreateDiscussionForm } from "@/components/discussion/CreateDiscussionForm";
import { DiscussionList } from "@/components/discussion/DiscussionList";

export default function DiscussionListPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  return (
    <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Discussions</h2>
        <DiscussionList workspaceId={workspaceId} />
      </div>
      <div className="rounded border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Start a discussion</h2>
        <CreateDiscussionForm workspaceId={workspaceId} />
      </div>
    </div>
  );
}
