"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";
import { DecisionDate, DecisionStatus } from "@/components/decision/decisionUI";
import { useDecisionList } from "@/hooks/useDecision";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";

type StatusFilter = "ALL" | "PROPOSED" | "DECIDED" | "SUPERSEDED";

export default function DecisionsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const workspace = useWorkspaceDetail(workspaceId);
  const decisions = useDecisionList(workspaceId, filter === "ALL" ? undefined : filter);
  const denied = [workspace.error?.data?.code, decisions.error?.data?.code].some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND");
  const items = decisions.data?.pages.flatMap((page) => page.items) ?? [];

  if (denied) return <div className="mx-auto max-w-[72rem] space-y-4"><ErrorState title="Decision access restricted" description="You may no longer have access to this workspace's decisions." /><Link href="/workspace" className="font-semibold text-brand-link">All workspaces</Link></div>;

  return <main className="mx-auto w-full min-w-0 max-w-[72rem] pb-16">
    <header className="border-b border-border-subtle pb-7">
      <nav aria-label="Decision location" className="flex gap-2 text-xs text-text-muted"><Link href={`/workspace/${workspaceId}`} className="text-brand-link hover:text-brand-link-hover">{workspace.data?.name ?? "Workspace"}</Link><span aria-hidden="true">/</span><span aria-current="page">Decisions</span></nav>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-brand-link">Reasoning worth keeping</p>
      <h1 className="mt-2 font-display text-[2.25rem] leading-tight text-text-primary sm:text-[2.8rem]">Decisions</h1>
      <p className="mt-3 max-w-[65ch] text-sm leading-6 text-text-secondary">Return to the choices your team made, the alternatives it weighed, and the discussions that started them.</p>
    </header>
    <div className="flex flex-wrap gap-2 border-b border-border-subtle py-5" role="group" aria-label="Filter decisions by status">
      {(["ALL", "PROPOSED", "DECIDED", "SUPERSEDED"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-sm border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus-ring ${filter === value ? "border-brand-accent bg-surface-subtle text-brand-link" : "border-border-subtle text-text-secondary hover:bg-surface-hover"}`}>{value === "ALL" ? "All" : value === "DECIDED" ? "Finalized" : value === "PROPOSED" ? "Proposals" : "Superseded"}</button>)}
    </div>
    {decisions.isLoading && !decisions.data ? <div className="py-8"><LoadingState label="Loading decisions..." /></div> : null}
    {decisions.error && !decisions.data ? <div className="py-6"><ErrorState title="Could not load decisions" description="The decision archive is temporarily unavailable." onRetry={() => void decisions.refetch()} retrying={decisions.isFetching} /></div> : null}
    {decisions.error && decisions.data ? <div className="py-5"><ErrorState title={decisions.isFetchNextPageError ? "Could not load more decisions" : "Could not refresh decisions"} description="Already loaded decisions remain available." onRetry={() => void (decisions.isFetchNextPageError ? decisions.fetchNextPage() : decisions.refetch())} retrying={decisions.isFetching} /></div> : null}
    {!decisions.isLoading && !decisions.error && !items.length ? <div className="py-8"><EmptyState title={filter === "ALL" ? "No decisions yet" : "No decisions in this state"} description={filter === "ALL" ? "Open a discussion and propose a decision to preserve its reasoning here." : "Try another status, or return to all decisions."} /><Link href={`/workspace/${workspaceId}/discussions`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-link hover:text-brand-link-hover">Browse discussions →</Link></div> : null}
    {items.length ? <ol className="divide-y divide-border-subtle">{items.map((decision) => <li key={decision.id} className="py-5 sm:py-6">
      <Link href={`/workspace/${workspaceId}/decisions/${decision.id}`} className="group block min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring">
        <div className="flex flex-wrap items-center gap-3"><DecisionStatus status={decision.status} /><span className="text-xs text-text-muted">Updated <DecisionDate value={decision.updatedAt} /></span></div>
        <h2 className="mt-3 wrap-anywhere text-lg font-semibold leading-snug text-text-primary group-hover:text-brand-link sm:text-xl">{decision.question}</h2>
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap wrap-anywhere text-sm leading-6 text-text-secondary">{decision.outcome || "Outcome still being shaped."}</p>
        <p className="mt-3 text-xs text-text-muted">Proposed by {decision.createdByLabel} · {decision.sourceDiscussionId ? `From ${decision.sourceDiscussionTitle}` : `Source unavailable: ${decision.sourceDiscussionTitle}`}</p>
      </Link>
    </li>)}</ol> : null}
    {decisions.hasNextPage ? <div className="border-t border-border-subtle py-6 text-center"><button type="button" disabled={decisions.isFetchingNextPage} onClick={() => void decisions.fetchNextPage()} className="min-h-11 rounded-sm border border-border px-5 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{decisions.isFetchingNextPage ? "Loading..." : "Load more decisions"}</button></div> : null}
  </main>;
}
