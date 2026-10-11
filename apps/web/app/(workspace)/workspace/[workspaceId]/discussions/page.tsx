"use client";

import { useParams } from "next/navigation";

import { CreateDiscussionForm } from "@/components/discussion/CreateDiscussionForm";
import { DiscussionList } from "@/components/discussion/DiscussionList";

export default function DiscussionListPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  return (
    <div className="space-y-7">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold text-[#16765b]">Project conversations</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#17231f]">Discussions</h1>
        <p className="mt-2 text-sm leading-6 text-[#63716a]">Questions, ideas, and updates from people building together.</p>
      </header>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Discussion feed" className="min-w-0">
        <DiscussionList workspaceId={workspaceId} />
        </section>
        <aside id="new-discussion" className="scroll-mt-20 border-t border-[#dce6e0] pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        <h2 className="text-base font-semibold text-[#17231f]">Start a discussion</h2>
        <p className="mb-5 mt-1 text-sm leading-6 text-[#63716a]">Share a question or update with your workspace.</p>
        <CreateDiscussionForm workspaceId={workspaceId} />
        </aside>
      </div>
    </div>
  );
}
