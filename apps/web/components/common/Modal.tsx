"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A modal dialog: focus moves to the first field (or `initialFocus`), Tab stays
// inside, Escape and the backdrop close it unless `busy`, and focus returns to
// whatever opened it. A bottom sheet on phones.
export function Modal({ title, description, onClose, busy = false, initialFocus, size = "default", children }: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  initialFocus?: string;
  // "wide" for content such as an image viewer.
  size?: "default" | "wide";
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const target = (initialFocus ? panel?.querySelector<HTMLElement>(initialFocus) : null)
      ?? panel?.querySelector<HTMLElement>("input, textarea, select")
      ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div
    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
    onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }}
  >
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`max-h-[92dvh] w-full ${size === "wide" ? "max-w-4xl" : "max-w-lg"} overflow-y-auto rounded-t-md border border-border bg-surface p-5 shadow-xl sm:rounded-md sm:p-7`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-xl font-semibold text-text-primary">{title}</h2>
          {description ? <div className="mt-2 text-sm leading-6 text-text-secondary">{description}</div> : null}
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-50"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  </div>;
}
