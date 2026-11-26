"use client";

import { useParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CreateDiscussionForm } from "@/components/discussion/CreateDiscussionForm";
import { DiscussionList } from "@/components/discussion/DiscussionList";
import { TopBarActions } from "@/components/shell/TopBarActions";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/Canopy";
import { PageIntro } from "@/components/ui/PageIntro";
import { useDiscussionList } from "@/hooks/useDiscussion";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

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
    requestAnimationFrame(() => {
      const composer = document.getElementById("new-discussion");
      composer?.scrollIntoView?.({ block: "start" });
      composer?.querySelector<HTMLElement>("#discussion-title")?.focus();
    });
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

  const items = discussions.data?.pages.flatMap((page) => page.items) ?? [];
  const decided = items.filter((item) => item.decision?.status === "DECIDED").length;
  const proposals = items.filter((item) => item.decision?.status === "PROPOSED").length;
  const workspaceName = accessDenied ? "Workspace" : workspace.data?.name ?? "Workspace";

  return (
    <div className="min-w-0">
      {!accessDenied ? (
        <TopBarActions>
          <Button
            ref={createButtonRef}
            variant={composerOpen ? "secondary" : "primary"}
            aria-expanded={composerOpen}
            aria-controls="new-discussion"
            onClick={composerOpen ? closeComposer : openComposer}
            icon={composerOpen ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          >
            {composerOpen ? "Close composer" : "New discussion"}
          </Button>
        </TopBarActions>
      ) : null}

      <PageIntro
        eyebrow={`${workspaceName} · Discussions`}
        title="Discussions"
        meta={discussions.data && !accessDenied ? <>
          <span>{plural(items.length, "discussion")}{discussions.hasNextPage ? "+" : ""}</span>
          {proposals ? <><span aria-hidden="true">·</span><span>{plural(proposals, "open proposal")}</span></> : null}
          {decided ? <><span aria-hidden="true">·</span><span>{decided} decided</span></> : null}
        </> : <span>Questions, decisions and updates stay together so everyone can return to the conversation.</span>}
      />

      <section id="new-discussion" aria-label="New discussion" className="scroll-mt-24">
        {!accessDenied ? (
          <div hidden={!composerOpen} className="canopy-rise mt-7 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-7">
            <SectionLabel as="p">New discussion</SectionLabel>
            <h2 className="mt-1.5 font-serif text-[1.75rem] leading-tight text-text-primary">Start a discussion</h2>
            <p className="mt-1.5 max-w-[60ch] text-sm leading-6 text-text-secondary">Give your question or update a clear title and enough context for a useful reply.</p>
            <div className="mt-5">
              <CreateDiscussionForm key={workspaceId} workspaceId={workspaceId} onCancel={closeComposer} open={composerOpen} />
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="all-discussions-heading" className="pt-7">
        <SectionLabel id="all-discussions-heading" className="mb-3.5">All discussions · newest first</SectionLabel>
        <DiscussionList workspaceId={workspaceId} query={discussions} onCreate={openComposer} accessDenied={accessDenied} />
      </section>
    </div>
  );
}
