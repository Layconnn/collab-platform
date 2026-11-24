"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";
import { useUiStore } from "@/stores/ui.store";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Opens the create form over any page: from Home, the palette, the sidebar
// and the workspace switcher. Old links to /workspace#new-workspace open it too.
export function CreateWorkspaceDialog() {
  const open = useUiStore((state) => state.isCreateWorkspaceOpen);
  const setOpen = useUiStore((state) => state.setCreateWorkspaceOpen);
  const pathname = usePathname();
  const openedAt = useRef(pathname);

  useEffect(() => {
    if (window.location.hash !== "#new-workspace") return;
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setOpen(true);
  }, [pathname, setOpen]);

  // Creating a workspace navigates to it; the dialog closes on arrival.
  useEffect(() => {
    if (open && pathname !== openedAt.current) setOpen(false);
  }, [open, pathname, setOpen]);

  if (!open) return null;
  return <DialogPanel onOpen={() => { openedAt.current = pathname; }} onClose={() => setOpen(false)} />;
}

function DialogPanel({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpen();
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLInputElement>("#new-workspace-name")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div
    className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }}
  >
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="create-workspace-title" aria-describedby="create-workspace-description" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-md border border-border bg-surface p-5 shadow-xl sm:rounded-md sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="create-workspace-title" className="text-xl font-semibold text-text-primary">Create a workspace</h2>
          <p id="create-workspace-description" className="mt-2 text-sm leading-6 text-text-secondary">A shared place for your team&apos;s discussions and decisions. You can add people by their username once it exists.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="mt-6"><CreateWorkspaceForm /></div>
    </div>
  </div>;
}
