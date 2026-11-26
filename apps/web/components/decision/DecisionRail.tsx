"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/api/root";
import { timeAgo } from "@/components/activity/RecentActivity";
import { ErrorState } from "@/components/common/StateNotice";
import { reviewProgress } from "@/components/decision/DecisionReviews";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Canopy";
import { useDecisionList } from "@/hooks/useDecision";

type DecisionItem = inferRouterOutputs<AppRouter>["decision"]["listByWorkspace"]["items"][number];
type GroupKey = "waiting" | "proposals" | "decided" | "replaced";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const GROUPS: Array<{ key: GroupKey; label: string; attention?: boolean }> = [
  { key: "waiting", label: "Waiting on you", attention: true },
  { key: "proposals", label: "Proposals" },
  { key: "decided", label: "Decided" },
  { key: "replaced", label: "Replaced" },
];

export function groupOf(item: Pick<DecisionItem, "status" | "review">): GroupKey {
  if (item.status === "PROPOSED") return item.review?.waitingForMe ? "waiting" : "proposals";
  return item.status === "DECIDED" ? "decided" : "replaced";
}

function Item({ item, workspaceId, current }: { item: DecisionItem; workspaceId: string; current: boolean }) {
  const replaced = item.status === "SUPERSEDED";
  const detail = item.status === "PROPOSED"
    ? `${item.createdByLabel} · ${item.review ? reviewProgress(item.review) : `open ${timeAgo(item.createdAt)}`}`
    : item.decidedAt ? `${replaced ? "Replaced" : "Decided"} ${timeAgo(item.updatedAt)}` : timeAgo(item.updatedAt);
  return <li>
    <Link
      href={`/workspace/${workspaceId}/decisions/${item.id}`}
      aria-current={current ? "page" : undefined}
      className={`canopy-row block rounded-[10px] px-3 py-3 focus-visible:outline-2 focus-visible:outline-focus-ring ${current ? "bg-surface-active shadow-[inset_2px_0_0_var(--live)]" : "hover:bg-surface-subtle"}`}
    >
      <span className={`block wrap-anywhere leading-snug ${replaced ? "text-text-muted line-through decoration-text-muted/60" : "font-medium text-text-primary"}`}>{item.question}</span>
      <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
        {item.status === "PROPOSED" ? <StatusPill tone="proposal" className="!py-px">Proposal</StatusPill> : item.status === "DECIDED" ? <StatusPill tone="decided" className="!py-px">Decided</StatusPill> : null}
        <span className="min-w-0 truncate">{detail}</span>
      </span>
    </Link>
  </li>;
}

// The grouped list beside the record (dashboard redesign, Decisions v2):
// what waits on the member first, then open proposals, decided and replaced.
// The filter narrows the loaded records by their question.
export function DecisionRail({ workspaceId, workspaceName, selectedId }: { workspaceId: string; workspaceName: string; selectedId?: string }) {
  const decisions = useDecisionList(workspaceId);
  const [filter, setFilter] = useState("");
  const items = decisions.data?.pages.flatMap((page) => page.items) ?? [];
  const query = filter.trim().toLowerCase();
  const shown = query ? items.filter((item) => item.question.toLowerCase().includes(query)) : items;
  const counts = {
    proposals: items.filter((item) => item.status === "PROPOSED").length,
    waiting: items.filter((item) => groupOf(item) === "waiting").length,
  };
  const more = decisions.hasNextPage ? "+" : "";
  const Title = selectedId ? "h2" : "h1";

  return <nav aria-label="Decision list" className="canopy-rise min-w-0">
    <div className="px-1">
      <p className="type-canopy-label m-0 text-xs tracking-[0.06em]">{workspaceName} · decision record</p>
      <Title className="type-canopy-title mt-1.5 text-[2.5rem]">Decisions</Title>
      {decisions.data ? <p className="mt-2 text-[0.8125rem] text-text-muted">
        {plural(items.length, "record")}{more} · {plural(counts.proposals, "proposal")}
        {counts.waiting ? <> · <span className="font-medium text-attention-text">{counts.waiting} waiting on you</span></> : null}
      </p> : null}
    </div>

    <label className="mt-4 flex min-h-9 items-center gap-2 rounded-[9px] border border-border-subtle bg-surface px-2.5 text-text-muted focus-within:outline-2 focus-within:outline-focus-ring">
      <Search size={14} aria-hidden="true" />
      <span className="sr-only">Filter decisions</span>
      <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter decisions" className="canopy-inset min-w-0 flex-1 bg-transparent text-[0.8125rem] text-text-primary outline-none placeholder:text-text-muted" />
    </label>

    {decisions.isLoading && !decisions.data ? <div role="status" aria-label="Loading decisions" className="mt-5 space-y-2">
      {[1, 2, 3, 4].map((row) => <span key={row} aria-hidden="true" className="block h-14 animate-pulse rounded-[10px] bg-surface-active" />)}
    </div> : null}
    {decisions.error && !decisions.data ? <div className="mt-5"><ErrorState title="Could not load decisions" description="The decision record is temporarily unavailable." onRetry={() => void decisions.refetch()} retrying={decisions.isFetching} /></div> : null}
    {decisions.error && decisions.data ? <div className="mt-4"><ErrorState title={decisions.isFetchNextPageError ? "Could not load more decisions" : "Could not refresh decisions"} description="Already loaded decisions remain available." onRetry={() => void (decisions.isFetchNextPageError ? decisions.fetchNextPage() : decisions.refetch())} retrying={decisions.isFetching} /></div> : null}

    {decisions.data && !items.length ? <div className="mt-5 rounded-2xl border border-dashed border-border px-4 py-6">
      <p className="font-serif text-[1.375rem] text-text-primary">No decisions yet</p>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-text-secondary">Open a discussion and propose a decision to keep its reasoning here.</p>
      <Link href={`/workspace/${workspaceId}/discussions`} className="mt-3 inline-flex min-h-9 items-center text-[0.8125rem] font-medium text-brand-link hover:underline">Browse discussions →</Link>
    </div> : null}
    {items.length && !shown.length ? <p role="status" className="mt-5 px-1 text-[0.8125rem] text-text-muted">No loaded decision matches &ldquo;{filter.trim()}&rdquo;.</p> : null}

    {GROUPS.map((group) => {
      const groupItems = shown.filter((item) => groupOf(item) === group.key);
      if (!groupItems.length) return null;
      return <section key={group.key} aria-labelledby={`rail-${group.key}`} className="mt-5">
        <h3 id={`rail-${group.key}`} className={`mb-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.1em] ${group.attention ? "text-attention-text" : "text-text-muted"}`}>{group.label} · {groupItems.length}</h3>
        <ul className="flex flex-col gap-0.5">
          {groupItems.map((item) => <Item key={item.id} item={item} workspaceId={workspaceId} current={item.id === selectedId} />)}
        </ul>
      </section>;
    })}

    {decisions.hasNextPage && !decisions.isFetchNextPageError ? <Button variant="ghost" className="mt-3 w-full" disabled={decisions.isFetchingNextPage} onClick={() => void decisions.fetchNextPage()}>{decisions.isFetchingNextPage ? "Loading..." : "Load more decisions"}</Button> : null}
  </nav>;
}
