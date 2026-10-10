"use client";

import { useParams } from "next/navigation";

import { WorkspaceMembersPanel } from "@/components/workspace/WorkspaceMembersPanel";

export default function WorkspaceMembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return (
    <section className="space-y-7">
      <div className="max-w-2xl border-b border-[#dce6e0] pb-6">
        <p className="text-sm font-semibold text-[#16765b]">The people behind the project</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#17231f]">Contributors</h1>
        <p className="mt-2 text-sm leading-6 text-[#63716a]">Meet the community, understand each person’s role, and make room for new contributors.</p>
      </div>
      <WorkspaceMembersPanel workspaceId={workspaceId} />
    </section>
  );
}
