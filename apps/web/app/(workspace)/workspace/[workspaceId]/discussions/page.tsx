"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { MessageSquareText, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CreateDiscussionForm } from "@/components/discussion/CreateDiscussionForm";
import { DiscussionList } from "@/components/discussion/DiscussionList";
import { useDiscussionList } from "@/hooks/useDiscussion";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";

export default function DiscussionListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = useWorkspaceDetail(workspaceId);
  const discussions = useDiscussionList(workspaceId);
  const [composerOpen, setComposerOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const accessDenied = [discussions.error?.data?.code, workspace.error?.data?.code]
    .some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED");

  const openComposer = useCallback(() => {
    setComposerOpen(true);
    window.history.replaceState(null, "", "#new-discussion");
    requestAnimationFrame(() => document.getElementById("new-discussion")?.scrollIntoView({ block: "start" }));
  }, []);

  const closeComposer = () => {
    setComposerOpen(false);
    if (window.location.hash === "#new-discussion") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    requestAnimationFrame(() => createButtonRef.current?.focus());
  };

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#new-discussion") setComposerOpen(true);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1160px]">
      <header className="border-b border-border-subtle pb-7">
        <nav aria-label="Discussion location" className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
          <Link href={`/workspace/${workspaceId}`} className="max-w-[min(18rem,60vw)] truncate font-medium text-brand-link hover:text-brand-link-hover">
            {accessDenied ? "Workspace" : workspace.data?.name ?? "Workspace"}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Discussions</span>
        </nav>
        <div className="mt-5 flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.8rem] font-semibold leading-tight text-text-primary sm:text-[2rem]">Discussions</h1>
            <p className="mt-2 max-w-[58ch] text-sm leading-6 text-text-secondary">
              Questions, decisions, and updates stay together so everyone can return to the conversation.
            </p>
          </div>
          {!accessDenied ? (
            <button
              ref={createButtonRef}
              type="button"
              aria-expanded={composerOpen}
              aria-controls="new-discussion"
              onClick={composerOpen ? closeComposer : openComposer}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none sm:w-auto"
            >
              {composerOpen ? <X size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
              {composerOpen ? "Close composer" : "New discussion"}
            </button>
          ) : null}
        </div>
      </header>

      <section id="new-discussion" aria-label="New discussion" className="scroll-mt-20">
        {!accessDenied ? (
          <div hidden={!composerOpen} className="border-b border-border-subtle bg-surface-subtle px-4 py-5 sm:px-7 sm:py-7">
            <div className="mb-4 flex items-start gap-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-sm bg-brand-accent text-on-brand-accent"><MessageSquareText size={18} /></span>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Start a discussion</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">Give your question or update a clear title and enough context for a useful reply.</p>
              </div>
            </div>
            <CreateDiscussionForm key={workspaceId} workspaceId={workspaceId} onCancel={closeComposer} open={composerOpen} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="all-discussions-heading" className="pt-7">
        <div className="mb-4 flex min-w-0 items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-brand-link">Conversation archive</p>
            <h2 id="all-discussions-heading" className="mt-1 text-xl font-semibold text-text-primary">All discussions</h2>
          </div>
          {discussions.data && !accessDenied ? (
            <span className="shrink-0 text-xs text-text-muted">
              {discussions.data.pages.reduce((total, page) => total + page.items.length, 0)}{discussions.hasNextPage ? "+" : ""} loaded
            </span>
          ) : null}
        </div>
        <DiscussionList workspaceId={workspaceId} query={discussions} onCreate={openComposer} accessDenied={accessDenied} />
      </section>
    </div>
  );
}
