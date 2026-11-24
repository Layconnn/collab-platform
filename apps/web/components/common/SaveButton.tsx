"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";

import { isSaved, useSavedIds, useSetSaved, type SavedTarget } from "@/hooks/useSaved";

// Saves a discussion, reply or decision to the member's private Saved list
// (Markdown, reactions, follow and pin PRD, FR-16).
export function SaveButton({ workspaceId, target, compact = false, label }: {
  workspaceId: string;
  target: SavedTarget;
  compact?: boolean;
  // What is being saved, for screen readers: "discussion", "reply", "decision".
  label: string;
}) {
  const ids = useSavedIds(workspaceId);
  const set = useSetSaved(workspaceId);
  if (!ids.data) return null;
  const saved = isSaved(ids.data, target);
  const Icon = saved ? BookmarkCheck : Bookmark;
  return <button
    type="button"
    onClick={() => set.mutate({ workspaceId, ...target, saved: !saved })}
    disabled={set.isPending}
    aria-pressed={saved}
    aria-label={saved ? `Saved ${label}, remove from Saved` : `Save ${label} for later`}
    title={saved ? "Remove from Saved" : "Save for later"}
    className={compact
      ? `inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50 ${saved ? "text-brand-link" : "text-text-secondary hover:text-text-primary"}`
      : `inline-flex min-h-10 items-center gap-2 rounded-sm border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60 ${saved ? "border-brand-link text-brand-link" : "border-border text-text-secondary hover:bg-surface-hover"}`}
  >
    <Icon size={compact ? 14 : 15} aria-hidden="true" />{saved ? "Saved" : "Save"}
  </button>;
}
