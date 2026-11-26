"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DecisionDate, decisionError } from "./decisionUI";
import { useDecisionActions, useReplacementCandidates } from "@/hooks/useDecision";
import { dialogPanelClasses, dialogTitleClasses, overlayLabelClasses, scrimClasses } from "@/components/ui/overlay";

type Candidate = { id: string; question: string; outcome: string | null; sourceDiscussionTitle: string; version: number; decidedAt: Date | null };

export function SupersedeDecisionDialog({ workspaceId, oldDecision, onClose }: {
  workspaceId: string;
  oldDecision: { id: string; question: string; version: number };
  onClose: () => void;
}) {
  const router = useRouter();
  const { supersede } = useDecisionActions(workspaceId);
  const candidates = useReplacementCandidates(workspaceId, oldDecision.id, true);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  useEffect(() => { dialogRef.current?.focus(); }, [confirming]);
  const items: Candidate[] = candidates.data?.pages.flatMap((page) => page.items) ?? [];
  const selected = items.find((item) => item.id === selectedId);
  const accessLost = ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(candidates.error?.data?.code ?? "") || ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(supersede.error?.data?.code ?? "");

  const submit = async () => {
    if (submitting.current || !selected || reason.trim().length < 10) return;
    submitting.current = true;
    try {
      await supersede.mutateAsync({
        workspaceId, oldDecisionId: oldDecision.id, replacementDecisionId: selected.id,
        expectedOldVersion: oldDecision.version, expectedReplacementVersion: selected.version,
        reason: reason.trim(),
      });
      onClose();
      router.push(`/workspace/${workspaceId}/decisions/${selected.id}`);
    } catch { /* Keep selection and reason for review. */ }
    finally { submitting.current = false; }
  };

  return <div className={`${scrimClasses} z-50 flex items-center justify-center p-3 sm:p-4`} onKeyDown={(event) => {
    if (event.key === "Escape" && !supersede.isPending) onClose();
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (first && last && (event.shiftKey ? document.activeElement === first || document.activeElement === dialogRef.current : document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  }}>
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="supersede-title" aria-describedby="supersede-description" className={`${dialogPanelClasses} max-h-[90vh] w-full max-w-2xl overflow-y-auto !rounded-2xl p-4 sm:p-6`}>
      <p className={overlayLabelClasses}>Decision history</p>
      <h2 id="supersede-title" className={`${dialogTitleClasses} mt-1.5`}>{confirming ? "Confirm replacement" : "Supersede decision"}</h2>
      <p id="supersede-description" className="mt-2 wrap-anywhere text-sm leading-6 text-text-secondary">Replacing <strong className="text-text-primary">{oldDecision.question}</strong></p>
      {accessLost ? <p role="alert" className="mt-5 text-sm text-danger">Decision access changed. Close this dialog and return to the workspace.</p> : confirming ? <div className="mt-5 space-y-3 text-sm leading-6 text-text-secondary">
        <p>The original decision will be marked Superseded. <strong className="wrap-anywhere text-text-primary">{selected?.question}</strong> becomes the current decision.</p>
        <p>The original record and reasoning remain accessible. This creates permanent historical metadata.</p>
        <div className="border-l-2 border-brand-accent pl-3"><p className="font-semibold text-text-primary">Reason</p><p className="whitespace-pre-wrap wrap-anywhere">{reason}</p></div>
      </div> : <div className="mt-5 space-y-5">
        <fieldset disabled={supersede.isPending}>
          <legend className="text-sm font-semibold text-text-primary">Choose a finalized replacement</legend>
          <p className="mt-1 text-xs leading-5 text-text-muted">Only standalone finalized decisions in this workspace are eligible. Check the outcome and source before selecting.</p>
          {candidates.isLoading && !candidates.data ? <p role="status" className="mt-3 text-sm text-text-secondary">Loading decisions...</p> : null}
          {candidates.error ? <div role="alert" className="mt-3 text-sm text-danger">Could not load eligible decisions. <button type="button" onClick={() => void candidates.refetch()} className="font-semibold underline">Retry</button></div> : null}
          {!candidates.isLoading && !candidates.error && !items.length ? <p className="mt-3 text-sm text-text-secondary">No eligible finalized decisions are available yet.</p> : null}
          {items.length ? <div className="mt-3 max-h-64 overflow-y-auto border-y border-border-subtle">{items.map((item) => <label key={item.id} className="flex min-w-0 cursor-pointer gap-3 border-b border-border-subtle px-2 py-3 last:border-b-0 hover:bg-surface-hover">
            <input type="radio" name="replacement" value={item.id} checked={selectedId === item.id} onChange={() => { setSelectedId(item.id); supersede.reset(); }} className="mt-1 accent-brand-accent" />
            <span className="min-w-0"><span className="block wrap-anywhere text-sm font-semibold text-text-primary">{item.question}</span><span className="mt-1 block line-clamp-2 wrap-anywhere text-sm text-text-secondary">{item.outcome}</span><span className="mt-1 block wrap-anywhere text-xs text-text-muted">From {item.sourceDiscussionTitle}{item.decidedAt ? <> · Finalized <DecisionDate value={item.decidedAt} /></> : null}</span></span>
          </label>)}</div> : null}
          {candidates.hasNextPage ? <button type="button" disabled={candidates.isFetchingNextPage} onClick={() => void candidates.fetchNextPage()} className="mt-2 min-h-10 rounded-sm border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{candidates.isFetchingNextPage ? "Loading..." : "Load more decisions"}</button> : null}
        </fieldset>
        <div><label htmlFor="supersession-reason" className="block text-sm font-semibold text-text-primary">Why is this decision being replaced?</label><textarea id="supersession-reason" required minLength={10} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} aria-describedby="supersession-reason-help" className="mt-2 min-h-24 w-full resize-y rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring" /><p id="supersession-reason-help" className="mt-1 text-xs text-text-muted">Use at least 10 characters. This reason becomes part of the permanent decision history.</p></div>
      </div>}
      {supersede.error ? <p role="alert" className="mt-4 text-sm text-danger">{decisionError(supersede.error, "Could not replace the decision. Your reason is still here.")}{supersede.error.data?.code === "CONFLICT" ? " Another manager may have changed a decision. Close and review both records before trying again." : null}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:justify-end">
        <button type="button" disabled={supersede.isPending} onClick={confirming ? () => setConfirming(false) : onClose} className="min-h-11 rounded-sm px-4 text-sm font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">{confirming ? "Back" : "Cancel"}</button>
        <button type="button" disabled={supersede.isPending || accessLost || (!confirming && (!selected || reason.trim().length < 10))} onClick={confirming ? () => void submit() : () => setConfirming(true)} className="min-h-11 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{confirming ? supersede.isPending ? "Replacing..." : "Confirm replacement" : "Review replacement"}</button>
      </div>
    </div>
  </div>;
}
