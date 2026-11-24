"use client";

import { Bell, BellOff, BellRing, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDiscussionFollow } from "@/hooks/useFollow";

type Status = "FOLLOWING" | "MUTED" | "NONE";

const COPY: Record<Status, { label: string; help: string }> = {
  FOLLOWING: { label: "Following", help: "You hear about new replies." },
  MUTED: { label: "Muted", help: "Only mentions reach you." },
  NONE: { label: "Follow", help: "Hear about new replies." },
};

// Follow, unfollow and mute a discussion (Markdown, reactions, follow and pin
// PRD, FR-9 to FR-12).
export function FollowControl({ workspaceId, discussionId }: { workspaceId: string; discussionId: string }) {
  const key = { workspaceId, discussionId };
  const { follow, set } = useDiscussionFollow(workspaceId, discussionId);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const status: Status = follow.data?.status ?? "NONE";

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (next: Status) => {
    setOpen(false);
    triggerRef.current?.focus();
    if (next !== status) set.mutate({ ...key, status: next });
  };

  if (!follow.data) return null;
  const Icon = status === "FOLLOWING" ? BellRing : status === "MUTED" ? BellOff : Bell;
  const options: Array<{ status: Status; label: string; help: string }> = [
    { status: "FOLLOWING", label: "Follow", help: "New replies notify you." },
    { status: "MUTED", label: "Mute", help: "Only mentions notify you." },
    { status: "NONE", label: "Unfollow", help: "Replies don't notify you until you reply or follow." },
  ];

  return <div className="relative">
    <button
      ref={triggerRef}
      type="button"
      onClick={() => (status === "NONE" ? choose("FOLLOWING") : setOpen((value) => !value))}
      disabled={set.isPending}
      aria-haspopup={status === "NONE" ? undefined : "menu"}
      aria-expanded={status === "NONE" ? undefined : open}
      title={COPY[status].help}
      className={`inline-flex min-h-10 items-center gap-2 rounded-sm border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60 ${status === "FOLLOWING" ? "border-brand-link text-brand-link" : "border-border text-text-secondary hover:bg-surface-hover"}`}
    >
      <Icon size={15} aria-hidden="true" />{COPY[status].label}
      {status === "NONE" ? null : <ChevronDown size={14} aria-hidden="true" />}
    </button>
    <p className="sr-only" aria-live="polite">{set.isSuccess ? COPY[status].help : ""}</p>
    {open ? <div ref={menuRef} role="menu" aria-label="Notifications for this discussion" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }
    }} className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-border bg-surface p-1 shadow-lg">
      {options.map((option) => <button key={option.status} type="button" role="menuitemradio" aria-checked={status === option.status} onClick={() => choose(option.status)} className={`block w-full rounded-sm px-3 py-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring ${status === option.status ? "bg-surface-active" : ""}`}>
        <span className="block text-sm font-semibold text-text-primary">{option.label}</span>
        <span className="block text-xs text-text-muted">{option.help}</span>
      </button>)}
    </div> : null}
    {set.error ? <p role="alert" className="mt-1 text-xs text-danger">Could not change notifications. Try again.</p> : null}
  </div>;
}
