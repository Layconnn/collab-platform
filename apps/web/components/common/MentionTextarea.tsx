"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import type { UseFormRegisterReturn } from "react-hook-form";

import { UserAvatar } from "@/components/common/UserAvatar";
import { useMentionMembers } from "@/hooks/useMentionMembers";
import { resolveUserIdentity } from "@/lib/user-identity";
import { activeMentionAt, insertMention, type ActiveMention } from "./mention-input";

type Props = {
  as?: "input" | "textarea";
  id: string;
  className?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  workspaceId: string;
  registration: UseFormRegisterReturn;
  value: string;
  onInsert: (value: string) => void;
};

type Editor = HTMLInputElement | HTMLTextAreaElement;

export function MentionTextarea({ as = "textarea", workspaceId, registration, value, onInsert, rows, disabled, ...props }: Props) {
  const id = useId();
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const choosingRef = useRef(false);
  const [token, setToken] = useState<ActiveMention | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectionError, setSelectionError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [panelPlacement, setPanelPlacement] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const liveToken = token && value.slice(token.start, token.end).toLowerCase().startsWith(`@${token.query.toLowerCase()}`) ? token : null;
  const open = Boolean(liveToken && !dismissed && !disabled);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(liveToken?.query.toLowerCase() ?? ""), 180);
    return () => window.clearTimeout(timer);
  }, [liveToken?.query]);

  const ready = open && debouncedQuery === liveToken?.query.toLowerCase();
  const members = useMentionMembers(workspaceId, debouncedQuery, ready);
  const options = ready && !members.isFetching && !members.isError ? members.data ?? [] : [];
  const selectedIndex = Math.min(activeIndex, Math.max(0, options.length - 1));

  useEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = editorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const right = left + (viewport?.width ?? window.innerWidth);
      const anchorTop = Math.max(top + 8, Math.min(rect.top, bottom - 8));
      const anchorBottom = Math.max(top + 8, Math.min(rect.bottom, bottom - 8));
      const above = anchorTop - top - 12;
      const below = bottom - anchorBottom - 12;
      const placeAbove = below < 180 && above > below;
      const maxHeight = Math.max(40, Math.min(256, placeAbove ? above : below));
      const width = Math.min(360, rect.width, right - left - 16);
      setPanelPlacement({
        top: placeAbove ? Math.max(top + 8, anchorTop - maxHeight - 4) : Math.min(bottom - maxHeight - 8, anchorBottom + 4),
        left: Math.max(left + 8, Math.min(rect.left, right - width - 8)),
        width,
        maxHeight,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open]);

  const updateToken = (element: Editor, changed = false) => {
    setToken(activeMentionAt(element.value, element.selectionStart ?? 0, element.selectionEnd ?? 0));
    if (changed) {
      setDismissed(false);
      setSelectionError(false);
    }
    setActiveIndex(0);
  };

  const choose = async (index: number) => {
    if (choosingRef.current) return;
    const option = options[index];
    const editor = editorRef.current;
    if (!option || !editor || !liveToken) return;
    const current = activeMentionAt(editor.value, editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
    if (!current || current.start !== liveToken.start || current.query !== liveToken.query) return;
    choosingRef.current = true;
    setDismissed(true);
    setVerifying(true);
    try {
      const latest = await members.refetch();
      if (latest.isError || !latest.data?.some((member) => member.id === option.id && member.username === option.username)) {
        setSelectionError(true);
        setToken(null);
        editor.focus();
        return;
      }
      const refreshedToken = activeMentionAt(editor.value, editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
      if (!refreshedToken || refreshedToken.start !== current.start || refreshedToken.query !== current.query) {
        setToken(null);
        return;
      }
      const result = insertMention(editor.value, refreshedToken, option.username);
      editor.value = result.value;
      onInsert(result.value);
      setToken(null);
      setSelectionError(false);
      editor.focus();
      editor.setSelectionRange(result.caret, result.caret);
    } catch {
      setSelectionError(true);
      setToken(null);
      editor.focus();
    } finally {
      setVerifying(false);
      choosingRef.current = false;
    }
  };

  const onKeyDown = (event: KeyboardEvent<Editor>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(true);
    } else if (options.length && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (options.length && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (options.length && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void choose(selectedIndex);
    }
  };

  const editorProps = {
    ...props,
    name: registration.name,
    ref: (node: Editor | null) => { editorRef.current = node; registration.ref(node); },
    disabled,
    role: "combobox",
    "aria-autocomplete": "list" as const,
    "aria-haspopup": "listbox" as const,
    "aria-expanded": open && Boolean(panelPlacement),
    "aria-controls": open ? `${id}-list` : undefined,
    "aria-activedescendant": open && options.length ? `${id}-option-${selectedIndex}` : undefined,
    onChange: (event: ChangeEvent<Editor>) => { void registration.onChange(event); updateToken(event.currentTarget, true); },
    onSelect: (event: SyntheticEvent<Editor>) => updateToken(event.currentTarget),
    onClick: (event: MouseEvent<Editor>) => updateToken(event.currentTarget),
    onKeyUp: (event: KeyboardEvent<Editor>) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateToken(event.currentTarget);
    },
    onKeyDown,
    onBlur: (event: FocusEvent<Editor>) => {
      void registration.onBlur(event);
      if (!containerRef.current?.contains(event.relatedTarget)) setToken(null);
    },
  };

  return (
    <div ref={containerRef} className="relative min-w-0">
      {as === "input" ? <input {...editorProps} /> : <textarea {...editorProps} rows={rows} />}
      {open && panelPlacement ? createPortal(
        <div id={`${id}-list`} role="listbox" aria-label="Workspace members" style={panelPlacement} className="fixed z-50 min-w-0 overflow-y-auto rounded-sm border border-border bg-surface p-1 shadow-lg">
          <p className="px-2 py-1 text-[0.7rem] font-semibold uppercase text-text-muted">Mention a workspace member</p>
          {!ready || members.isFetching ? <p role="status" className="px-2 py-2 text-sm text-text-secondary">Searching members...</p> : null}
          {ready && members.isError ? <p role="alert" className="px-2 py-2 text-sm text-danger">Members unavailable. Try typing again.</p> : null}
          {ready && !members.isFetching && !members.isError && !options.length ? <p className="px-2 py-2 text-sm text-text-secondary">No matching members.</p> : null}
          {options.map((member, index) => {
            const identity = resolveUserIdentity(member);
            return (
              <button key={member.id} id={`${id}-option-${index}`} role="option" aria-selected={index === selectedIndex} type="button" tabIndex={-1} onPointerDown={(event) => event.preventDefault()} onClick={() => void choose(index)} className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-focus-ring ${index === selectedIndex ? "bg-surface-active" : "hover:bg-surface-hover"}`}>
                <UserAvatar name={identity.avatarName} className="size-7" />
                <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{identity.label}</span>
                <span className="max-w-[48%] shrink-0 truncate text-xs text-brand-link">@{member.username}</span>
              </button>
            );
          })}
        </div>, document.body
      ) : null}
      {verifying ? <p role="status" className="mt-1 text-xs text-text-muted">Checking member...</p> : null}
      {selectionError ? <p role="alert" className="mt-1 text-xs text-danger">Could not verify that member. Search again.</p> : null}
    </div>
  );
}
