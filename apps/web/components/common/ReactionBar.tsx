"use client";

import { SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { REACTION_EMOJI } from "@repo/validators/discussion";
import { useSetReaction, type ReactionSummary } from "@/hooks/useReactions";

// "Maya, Kim and Lee", "You and 4 others".
export function reactedBy(item: Pick<ReactionSummary, "count" | "people">) {
  const shown = item.people.slice(0, 3);
  const others = item.count - shown.length;
  if (others > 0) return `${shown.join(", ")} and ${others} ${others === 1 ? "other" : "others"}`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

const NAMES: Record<string, string> = { "👍": "thumbs up", "❤️": "heart", "🎉": "party", "😄": "smile", "🤔": "thinking", "👀": "eyes", "🚀": "rocket", "✅": "check" };

// Reactions on a discussion or a reply (Markdown, reactions, follow and pin
// PRD, FR-6 and FR-7): counts with who reacted, the viewer's own highlighted,
// and a small picker of the eight emoji.
export function ReactionBar({ workspaceId, discussionId, commentId, reactions, disabled = false }: {
  workspaceId: string;
  discussionId: string;
  commentId?: string;
  reactions: ReactionSummary[];
  disabled?: boolean;
}) {
  const setReaction = useSetReaction(workspaceId, discussionId);
  const [picking, setPicking] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const target = commentId ? { commentId } : { discussionId };

  useEffect(() => {
    if (!picking) return;
    pickerRef.current?.querySelector("button")?.focus();
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node) && event.target !== triggerRef.current) setPicking(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picking]);

  const react = (emoji: string, active: boolean) => {
    if (disabled) return;
    setReaction.mutate({ workspaceId, ...target, emoji: emoji as (typeof REACTION_EMOJI)[number], active });
  };

  return <div className="relative flex flex-wrap items-center gap-1.5" aria-label="Reactions" role="group">
    {reactions.map((item) => {
      const who = reactedBy(item);
      return <button
        key={item.emoji}
        type="button"
        onClick={() => react(item.emoji, !item.mine)}
        disabled={disabled}
        aria-pressed={item.mine}
        aria-label={`${NAMES[item.emoji] ?? item.emoji} ${item.count}${item.mine ? ", you reacted" : ""}. ${who}`}
        title={who}
        className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60 motion-reduce:transition-none ${item.mine ? "border-brand-link bg-surface-active text-brand-link" : "border-border-subtle text-text-secondary hover:bg-surface-hover"}`}
      ><span aria-hidden="true" className="text-sm leading-none">{item.emoji}</span>{item.count}</button>;
    })}
    {disabled ? null : <button
      ref={triggerRef}
      type="button"
      onClick={() => setPicking((open) => !open)}
      aria-expanded={picking}
      aria-label="Add reaction"
      title="Add reaction"
      className="inline-flex size-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
    ><SmilePlus size={16} aria-hidden="true" /></button>}
    {picking ? <div
      ref={pickerRef}
      role="menu"
      aria-label="Choose a reaction"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); setPicking(false); triggerRef.current?.focus(); }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          const buttons = Array.from(pickerRef.current?.querySelectorAll("button") ?? []);
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
        }
      }}
      className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-md border border-border bg-surface p-1 shadow-lg"
    >
      {REACTION_EMOJI.map((emoji) => {
        const mine = reactions.some((item) => item.emoji === emoji && item.mine);
        return <button key={emoji} type="button" role="menuitemcheckbox" aria-checked={mine} aria-label={`React with ${NAMES[emoji]}`} onClick={() => { react(emoji, !mine); setPicking(false); triggerRef.current?.focus(); }} className={`grid size-9 place-items-center rounded-sm text-lg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring ${mine ? "bg-surface-active" : ""}`}>{emoji}</button>;
      })}
    </div> : null}
  </div>;
}
