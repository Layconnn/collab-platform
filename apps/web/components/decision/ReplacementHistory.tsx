"use client";

import Link from "next/link";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { useReplacementHistory } from "@/hooks/useDecision";
import { DecisionDate, DecisionStatus } from "./decisionUI";

export function ReplacementHistory({ workspaceId, decisionId, history }: { workspaceId: string; decisionId: string; history: ReturnType<typeof useReplacementHistory> }) {
  if (history.isLoading && !history.data) return <div className="mt-8"><LoadingState label="Loading replacement history..." /></div>;
  if (history.error) return <div className="mt-8"><ErrorState title="Replacement history unavailable" onRetry={() => void history.refetch()} retrying={history.isFetching} /></div>;
  if (!history.data || history.data.items.length < 2) return null;
  // The chain of decisions this one belongs to, oldest first: each card says
  // why it was replaced, and an arrow leads to the next (dashboard redesign).
  return <section aria-labelledby="replacement-history-heading" className="mt-8 border-t border-border-subtle pt-6">
    <h2 id="replacement-history-heading" className="type-canopy-label m-0">Replacement history</h2>
    <p className="mt-2 text-sm leading-6 text-text-secondary">How this choice changed across finalized decisions. Each record keeps its own revision history below.</p>
    <ol className="mt-4 flex flex-col">{history.data.items.map((item, index) => {
      const viewing = item.id === decisionId;
      const current = history.data.effectiveDecisionId === item.id;
      return <li key={item.id} className="min-w-0">
        <div className={`rounded-xl border px-4 py-3 ${viewing ? "border-brand-link bg-callout" : "border-border-subtle bg-surface"}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="font-mono text-[11px] text-text-muted">{index + 1}</span><DecisionStatus status={item.status} />{viewing ? <span className="text-xs font-medium text-brand-link">Viewing</span> : null}{current ? <span className="text-xs font-medium text-success">Current decision</span> : null}</div>
          <Link href={`/workspace/${workspaceId}/decisions/${item.id}`} aria-current={viewing ? "page" : undefined} className={`mt-1.5 block wrap-anywhere font-medium hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring ${item.status === "SUPERSEDED" ? "text-text-secondary" : "text-text-primary"}`}>{item.question}</Link>
          {item.replacement ? <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm text-text-secondary">Replaced by the next decision: {item.replacement.reason}</p> : null}
          {item.replacement ? <p className="mt-1 text-xs text-text-muted">Authorized by {item.replacement.authorizedByLabel} · <DecisionDate value={item.replacement.createdAt} /></p> : null}
        </div>
        {index < history.data.items.length - 1 ? <span aria-hidden="true" className="ml-6 block h-4 w-px bg-border" /> : null}
      </li>;
    })}</ol>
    {history.data.truncated ? <p className="mt-3 text-sm text-text-secondary">Showing up to 20 linked decisions. Open a nearby record to continue through this history.</p> : null}
  </section>;
}
