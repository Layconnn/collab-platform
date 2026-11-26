"use client";

import Link from "next/link";
import { Bookmark, BookOpen, CornerDownRight, MessageSquare } from "lucide-react";

import { timeAgo } from "@/components/activity/RecentActivity";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { useSavedList, useSetSaved } from "@/hooks/useSaved";

const TYPE = {
  DISCUSSION: { label: "Discussion", Icon: MessageSquare },
  REPLY: { label: "Reply", Icon: CornerDownRight },
  DECISION: { label: "Decision", Icon: BookOpen },
} as const;

type Item = NonNullable<ReturnType<typeof useSavedList>["data"]>["pages"][number]["items"][number];

function SavedRow({ item }: { item: Item }) {
  const unsave = useSetSaved(item.workspace.id);
  const { label, Icon } = TYPE[item.type];
  return <li className="canopy-row flex min-w-0 items-start gap-3 border-t border-border-subtle px-5 py-4 first:border-t-0 hover:bg-surface-subtle">
    <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-callout text-brand-link"><Icon size={15} /></span>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-text-muted"><span className="font-semibold text-text-secondary">{label}</span> · {item.workspace.name} · saved <time dateTime={new Date(item.savedAt).toISOString()}>{timeAgo(item.savedAt)}</time></p>
      <Link href={item.href} className="mt-0.5 block wrap-anywhere text-[0.9375rem] font-medium text-text-primary hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">{item.type === "REPLY" ? `Reply in ${item.title}` : item.title}</Link>
      {item.excerpt ? <p className="mt-1 line-clamp-2 wrap-anywhere text-sm text-text-secondary">{item.type === "REPLY" ? <><span className="font-medium">{item.by}:</span> {item.excerpt}</> : item.excerpt}</p> : null}
    </div>
    <button type="button" onClick={() => unsave.mutate({ workspaceId: item.workspace.id, ...item.target, saved: false })} disabled={unsave.isPending} aria-label={`Remove ${label.toLowerCase()} “${item.title}” from Saved`} className="min-h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50">Remove</button>
  </li>;
}

// Everything the member saved, across their workspaces (FR-17).
export function SavedPage() {
  const saved = useSavedList();
  const items = saved.data?.pages.flatMap((page) => page.items) ?? [];
  return <div className="w-full min-w-0 pb-12">
    <header className="canopy-rise border-b border-border-subtle pb-6">
      <p className="type-canopy-label m-0 text-xs tracking-[0.06em]">Just for you</p>
      <h1 className="type-canopy-title mt-2 text-[2.35rem] sm:text-[2.875rem]">Saved</h1>
      <p className="mt-3 max-w-[60ch] text-[0.8125rem] leading-6 text-text-muted">Discussions, replies and decisions you saved to come back to. Only you can see this list.</p>
    </header>
    <div className="mt-6">
      {saved.isLoading ? <LoadingState label="Loading saved items..." /> : null}
      {saved.error && !saved.data ? <ErrorState title="Could not load saved items" onRetry={() => void saved.refetch()} retrying={saved.isFetching} /> : null}
      {saved.data && !items.length ? <div className="rounded-2xl border border-dashed border-border px-6 py-9">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-callout text-brand-link"><Bookmark size={18} /></span>
        <h2 className="mt-4 font-serif text-[1.5rem] leading-tight text-text-primary">Nothing saved yet</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">Use Save on a discussion, a reply or a decision to keep it here.</p>
      </div> : null}
      {items.length ? <ul aria-label="Saved items" className="canopy-rise overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">{items.map((item) => <SavedRow key={item.id} item={item} />)}</ul> : null}
      {saved.hasNextPage ? <button type="button" onClick={() => void saved.fetchNextPage()} disabled={saved.isFetchingNextPage} className="mt-4 inline-flex min-h-9 items-center rounded-[9px] border border-border bg-surface px-3.5 text-[0.8125rem] font-medium text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{saved.isFetchingNextPage ? "Loading..." : "Load more"}</button> : null}
    </div>
  </div>;
}
