"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";
import { reviewProgress } from "@/components/decision/DecisionReviews";
import { DecisionDate, DecisionStatus } from "@/components/decision/decisionUI";
import { useDecisionList } from "@/hooks/useDecision";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";
import { FileCount } from "@/components/files/FileCount";

type StatusFilter = "ALL" | "MINE" | "PROPOSED" | "DECIDED" | "SUPERSEDED";

export default function DecisionsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const workspace = useWorkspaceDetail(workspaceId);
  const decisions = useDecisionList(workspaceId, filter === "ALL" || filter === "MINE" ? undefined : filter, filter === "MINE");
  const denied = [workspace.error?.data?.code, decisions.error?.data?.code].some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND");
  const items = decisions.data?.pages.flatMap((page) => page.items) ?? [];

  if (denied) return <div className="mx-auto max-w-[1160px] space-y-4"><ErrorState title="Decision access restricted" description="You may no longer have access to this workspace's decisions." /><Link href="/workspace" className="font-semibold text-brand-link">All workspaces</Link></div>;

  return <main className="mx-auto w-full min-w-0 max-w-[1160px] pb-16">
    <header className="border-b border-border-subtle pb-7">
      <nav aria-label="Decision location" className="flex min-w-0 items-center gap-2 text-xs text-text-muted"><Link href={`/workspace/${workspaceId}`} className="max-w-[min(18rem,60vw)] truncate font-medium text-brand-link hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring">{workspace.data?.name ?? "Workspace"}</Link><span aria-hidden="true">/</span><span aria-current="page">Decisions</span></nav>
      <div className="mt-5 min-w-0">
        <h1 className="text-[1.8rem] font-semibold leading-tight text-text-primary sm:text-[2rem]">Decisions</h1>
        <p className="mt-2 max-w-[58ch] text-sm leading-6 text-text-secondary">Find the choices your team made, the reasoning behind them, and the discussions that started them.</p>
      </div>
    </header>
    <section aria-labelledby="decision-archive-heading" className="pt-7">
      <div className="mb-4 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase text-brand-link">Decision archive</p><h2 id="decision-archive-heading" className="mt-1 text-xl font-semibold text-text-primary">All decisions</h2></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter decisions by status">
          {(["ALL", "MINE", "PROPOSED", "DECIDED", "SUPERSEDED"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-sm border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus-ring ${filter === value ? "border-brand-accent bg-surface-subtle text-brand-link" : "border-border-subtle text-text-secondary hover:bg-surface-hover"}`}>{value === "ALL" ? "All" : value === "MINE" ? "Waiting for my review" : value === "DECIDED" ? "Finalized" : value === "PROPOSED" ? "Proposals" : "Superseded"}</button>)}
        </div>
      </div>
    {decisions.isLoading && !decisions.data ? <div className="py-8"><LoadingState label="Loading decisions..." /></div> : null}
    {decisions.error && !decisions.data ? <div className="py-6"><ErrorState title="Could not load decisions" description="The decision archive is temporarily unavailable." onRetry={() => void decisions.refetch()} retrying={decisions.isFetching} /></div> : null}
    {decisions.error && decisions.data ? <div className="py-5"><ErrorState title={decisions.isFetchNextPageError ? "Could not load more decisions" : "Could not refresh decisions"} description="Already loaded decisions remain available." onRetry={() => void (decisions.isFetchNextPageError ? decisions.fetchNextPage() : decisions.refetch())} retrying={decisions.isFetching} /></div> : null}
    {!decisions.isLoading && !decisions.error && !items.length ? <div className="py-8"><EmptyState title={filter === "ALL" ? "No decisions yet" : filter === "MINE" ? "Nothing waiting for your review" : "No decisions in this state"} description={filter === "MINE" ? "Proposals you are asked to review appear here until you answer." : filter === "ALL" ? "Open a discussion and propose a decision to preserve its reasoning here." : "Try another status, or return to all decisions."} /><Link href={`/workspace/${workspaceId}/discussions`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-link hover:text-brand-link-hover">Browse discussions →</Link></div> : null}
    {items.length ? <ol className="border-t border-border-subtle">{items.map((decision) => <li key={decision.id} className="min-w-0 border-b border-border-subtle">
      <Link href={`/workspace/${workspaceId}/decisions/${decision.id}`} className="group block min-w-0 rounded-sm px-1 py-4 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring motion-reduce:transition-none sm:px-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><DecisionStatus status={decision.status} />{decision.status === "DECIDED" ? <span className="text-xs font-semibold text-brand-link">Current decision</span> : null}<h3 className="min-w-0 flex-1 wrap-anywhere text-[0.95rem] font-semibold leading-5 text-text-primary group-hover:text-brand-link sm:text-base">{decision.question}</h3></div>
        {decision.status === "PROPOSED" && decision.review ? <p className={`mt-1.5 text-xs font-semibold ${decision.review.waitingForMe ? "text-brand-link" : decision.review.met ? "text-success" : "text-text-secondary"}`}>{decision.review.waitingForMe ? "Your review is requested · " : "Review · "}{reviewProgress(decision.review)}</p> : null}
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-text-secondary">{decision.outcome || "Outcome still being shaped."}</p>
        <p className="mt-2 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 wrap-anywhere text-xs leading-5 text-text-muted"><span>Proposed by {decision.createdByLabel}</span><span aria-hidden="true">/</span><span>Updated <DecisionDate value={decision.updatedAt} /></span>{decision.attachments.length ? <><span aria-hidden="true">/</span><FileCount count={decision.attachments.length} /></> : null}<span aria-hidden="true">/</span><span>{decision.sourceDiscussionId ? `From ${decision.sourceDiscussionTitle}` : `Source unavailable: ${decision.sourceDiscussionTitle}`}</span></p>
      </Link>
    </li>)}</ol> : null}
    {decisions.hasNextPage ? <div className="border-t border-border-subtle py-6 text-center"><button type="button" disabled={decisions.isFetchingNextPage} onClick={() => void decisions.fetchNextPage()} className="min-h-11 rounded-sm border border-border px-5 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{decisions.isFetchingNextPage ? "Loading..." : "Load more decisions"}</button></div> : null}
    </section>
  </main>;
}
