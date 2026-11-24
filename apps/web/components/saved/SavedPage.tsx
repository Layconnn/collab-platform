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
  return <li className="flex min-w-0 items-start gap-3 border-b border-border-subtle py-4">
    <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm bg-surface-active text-brand-link"><Icon size={15} /></span>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-text-muted"><span className="font-semibold text-text-secondary">{label}</span> · {item.workspace.name} · saved <time dateTime={new Date(item.savedAt).toISOString()}>{timeAgo(item.savedAt)}</time></p>
      <Link href={item.href} className="mt-0.5 block wrap-anywhere text-sm font-semibold text-text-primary hover:text-brand-link focus-visible:outline-2 focus-visible:outline-focus-ring">{item.type === "REPLY" ? `Reply in ${item.title}` : item.title}</Link>
      {item.excerpt ? <p className="mt-1 line-clamp-2 wrap-anywhere text-sm text-text-secondary">{item.type === "REPLY" ? <><span className="font-medium">{item.by}:</span> {item.excerpt}</> : item.excerpt}</p> : null}
    </div>
    <button type="button" onClick={() => unsave.mutate({ workspaceId: item.workspace.id, ...item.target, saved: false })} disabled={unsave.isPending} aria-label={`Remove ${label.toLowerCase()} “${item.title}” from Saved`} className="min-h-10 shrink-0 rounded-sm px-2 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50">Remove</button>
  </li>;
}

// Everything the member saved, across their workspaces (FR-17).
export function SavedPage() {
  const saved = useSavedList();
  const items = saved.data?.pages.flatMap((page) => page.items) ?? [];
  return <div className="mx-auto w-full max-w-[52rem] min-w-0 pb-12">
    <p className="text-xs font-semibold uppercase text-brand-link">Just for you</p>
    <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight text-text-primary sm:text-[2.1rem]">Saved</h1>
    <p className="mt-2 max-w-[60ch] text-sm leading-6 text-text-secondary">Discussions, replies and decisions you saved to come back to. Only you can see this list.</p>
    <div className="mt-6">
      {saved.isLoading ? <LoadingState label="Loading saved items..." /> : null}
      {saved.error && !saved.data ? <ErrorState title="Could not load saved items" onRetry={() => void saved.refetch()} retrying={saved.isFetching} /> : null}
      {saved.data && !items.length ? <div className="rounded-md border border-border-subtle bg-surface-subtle px-5 py-8">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-sm bg-surface-active text-brand-link"><Bookmark size={18} /></span>
        <h2 className="mt-4 text-base font-semibold text-text-primary">Nothing saved yet</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">Use Save on a discussion, a reply or a decision to keep it here.</p>
      </div> : null}
      {items.length ? <ul aria-label="Saved items" className="border-t border-border-subtle">{items.map((item) => <SavedRow key={item.id} item={item} />)}</ul> : null}
      {saved.hasNextPage ? <button type="button" onClick={() => void saved.fetchNextPage()} disabled={saved.isFetchingNextPage} className="mt-4 min-h-11 rounded-sm border border-border px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{saved.isFetchingNextPage ? "Loading..." : "Load more"}</button> : null}
    </div>
  </div>;
}
