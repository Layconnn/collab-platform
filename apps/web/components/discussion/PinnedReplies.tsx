"use client";

import { Pin } from "lucide-react";

import { usePinnedReplies } from "@/hooks/usePins";

// The replies pinned to the top of a discussion (Markdown, reactions, follow
// and pin PRD, FR-14). Nothing is shown when no reply is pinned.
export function PinnedReplies({ workspaceId, discussionId }: { workspaceId: string; discussionId: string }) {
  const pins = usePinnedReplies(workspaceId, discussionId);
  const items = pins.data?.items ?? [];
  if (!items.length) return null;
  return <section aria-labelledby="pinned-heading" className="mt-8 rounded-md border border-border-subtle bg-surface-subtle px-4 py-4 sm:px-5">
    <h2 id="pinned-heading" className="flex items-center gap-2 text-xs font-semibold uppercase text-brand-link"><Pin size={13} aria-hidden="true" /> Pinned {items.length === 1 ? "reply" : "replies"}</h2>
    <ul className="mt-2 divide-y divide-border-subtle">
      {items.map((item) => <li key={item.commentId} className="py-2.5 first:pt-1 last:pb-0">
        <a href={`#comment-${item.commentId}`} className="block rounded-sm text-sm leading-6 text-text-primary hover:text-brand-link focus-visible:outline-2 focus-visible:outline-focus-ring">
          <span className="font-semibold">{item.author}:</span> <span className="wrap-anywhere">{item.excerpt || "(no text)"}</span>
        </a>
        {item.pinnedBy ? <p className="mt-0.5 text-xs text-text-muted">Pinned by {item.pinnedBy}</p> : null}
      </li>)}
    </ul>
  </section>;
}
