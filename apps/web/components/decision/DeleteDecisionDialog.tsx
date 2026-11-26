"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { decisionError } from "./decisionUI";
import { useDecisionActions } from "@/hooks/useDecision";
import { dialogPanelClasses, dialogTitleClasses, scrimClasses } from "@/components/ui/overlay";

export function DeleteDecisionDialog({ workspaceId, decision, onClose }: {
  workspaceId: string;
  decision: { id: string; question: string; version: number; status: "PROPOSED" | "DECIDED" | "SUPERSEDED" };
  onClose: () => void;
}) {
  const router = useRouter();
  const { remove } = useDecisionActions(workspaceId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  useEffect(() => { dialogRef.current?.focus(); }, []);

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await remove.mutateAsync({ workspaceId, decisionId: decision.id, expectedVersion: decision.version });
      router.push(`/workspace/${workspaceId}/decisions`);
    } catch { /* The error stays in the dialog. */ }
    finally { submitting.current = false; }
  };

  const message = remove.error?.data?.code === "CONFLICT"
    ? "This decision changed or is now part of a replacement history. Close this dialog and review it before trying again."
    : decisionError(remove.error, "Could not delete the decision. Please try again.");

  return <div className={`${scrimClasses} z-50 flex items-center justify-center p-3 sm:p-4`} onKeyDown={(event) => {
    if (event.key === "Escape" && !remove.isPending) onClose();
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (first && last && (event.shiftKey ? document.activeElement === first || document.activeElement === dialogRef.current : document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  }}>
    <div ref={dialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" className={`${dialogPanelClasses} w-full max-w-lg !rounded-2xl p-5 sm:p-7`}>
      <h2 id="delete-title" className={dialogTitleClasses}>{decision.status === "PROPOSED" ? "Delete this proposal?" : "Delete this decision?"}</h2>
      <p id="delete-description" className="mt-3 wrap-anywhere text-sm leading-6 text-text-secondary"><strong className="text-text-primary">{decision.question}</strong> will be removed for everyone in this workspace. This cannot be undone from Commons.</p>
      {message ? <p role="alert" className="mt-4 text-sm text-danger">{message}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" disabled={remove.isPending} onClick={onClose} className="min-h-11 rounded-sm px-4 text-sm font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Cancel</button>
        <button type="button" disabled={remove.isPending} onClick={() => void submit()} className="min-h-11 rounded-sm bg-danger-action px-4 text-sm font-semibold text-on-danger-action hover:opacity-90 focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{remove.isPending ? "Deleting..." : "Delete"}</button>
      </div>
    </div>
  </div>;
}
