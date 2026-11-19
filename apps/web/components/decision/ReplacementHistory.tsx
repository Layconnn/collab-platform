"use client";

import Link from "next/link";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { useReplacementHistory } from "@/hooks/useDecision";
import { DecisionDate, DecisionStatus } from "./decisionUI";

export function ReplacementHistory({ workspaceId, decisionId, history }: { workspaceId: string; decisionId: string; history: ReturnType<typeof useReplacementHistory> }) {
  if (history.isLoading && !history.data) return <div className="mt-8"><LoadingState label="Loading replacement history..." /></div>;
  if (history.error) return <div className="mt-8"><ErrorState title="Replacement history unavailable" onRetry={() => void history.refetch()} retrying={history.isFetching} /></div>;
  if (!history.data || history.data.items.length < 2) return null;
  return <section aria-labelledby="replacement-history-heading" className="mt-8 border-t border-border pt-8 sm:mt-10">
    <p className="text-xs font-semibold uppercase text-brand-link">Decision evolution</p>
    <h2 id="replacement-history-heading" className="mt-1 text-xl font-semibold text-text-primary">Replacement history</h2>
    <p className="mt-2 text-sm leading-6 text-text-secondary">How this choice changed across finalized decisions. Each record keeps its own revision history below.</p>
    <ol className="mt-5 border-l border-border-subtle pl-4 sm:pl-6">{history.data.items.map((item, index) => <li key={item.id} className="relative border-b border-border-subtle py-4 first:pt-0 last:border-0">
      <span aria-hidden="true" className="absolute -left-[1.3rem] top-5 size-2 rounded-full bg-brand-accent sm:-left-[1.8rem]" />
      <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-xs font-semibold text-text-muted">{index + 1}</span><DecisionStatus status={item.status} />{item.id === decisionId ? <span className="text-xs font-semibold text-brand-link">Viewing</span> : null}{history.data.effectiveDecisionId === item.id ? <span className="text-xs font-semibold text-brand-link">Current decision</span> : null}</div>
      <Link href={`/workspace/${workspaceId}/decisions/${item.id}`} className="mt-1 block wrap-anywhere text-sm font-semibold text-text-primary hover:text-brand-link focus-visible:outline-2 focus-visible:outline-focus-ring">{item.question}</Link>
      {item.replacement ? <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm text-text-secondary">Replaced by the next decision: {item.replacement.reason}</p> : null}
      {item.replacement ? <p className="mt-1 text-xs text-text-muted">Authorized by {item.replacement.authorizedByLabel} · <DecisionDate value={item.replacement.createdAt} /></p> : null}
    </li>)}</ol>
    {history.data.truncated ? <p className="mt-3 text-sm text-text-secondary">Showing up to 20 linked decisions. Open a nearby record to continue through this history.</p> : null}
  </section>;
}
