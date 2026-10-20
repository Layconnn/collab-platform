"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";

import { createDecisionInputSchema } from "@repo/validators/decision";
import { useDecisionActions } from "@/hooks/useDecision";
import { blankDecisionDraft, decisionDraftSchema, DecisionFields, optionalCreate, type DecisionDraft } from "./decisionFields";
import { decisionError } from "./decisionUI";

export function CreateDecisionForm({ workspaceId, discussionId, discussionTitle, onCancel }: {
  workspaceId: string; discussionId: string; discussionTitle: string; onCancel: () => void;
}) {
  const router = useRouter();
  const { create } = useDecisionActions(workspaceId);
  const form = useForm<DecisionDraft>({ resolver: zodResolver(decisionDraftSchema), defaultValues: blankDecisionDraft, shouldFocusError: true });
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const inFlight = useRef(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const busy = create.isPending || form.formState.isSubmitting || Boolean(createdId);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (inFlight.current || createdId) { event.preventDefault(); return; }
    inFlight.current = true;
    void form.handleSubmit(async (draft) => {
      const content = {
        workspaceId, sourceDiscussionId: discussionId, question: draft.question.trim(),
        outcome: optionalCreate(draft.outcome), rationale: optionalCreate(draft.rationale),
        alternatives: optionalCreate(draft.alternatives), followUp: optionalCreate(draft.followUp),
      };
      const fingerprint = JSON.stringify(content);
      if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: crypto.randomUUID() };
      const parsed = createDecisionInputSchema.safeParse({ ...content, idempotencyKey: submission.current.key });
      if (!parsed.success) { inFlight.current = false; return; }
      try {
        const decision = await create.mutateAsync(parsed.data);
        setCreatedId(decision.id);
        router.push(`/workspace/${workspaceId}/decisions/${decision.id}`);
      } catch {
        // The draft and key remain intact so retrying the same payload is safe.
      } finally { inFlight.current = false; }
    }, () => { inFlight.current = false; })(event);
  };

  return <form onSubmit={onSubmit} noValidate className="space-y-6">
    <p className="text-sm leading-6 text-text-secondary">This proposal will stay linked to <strong className="wrap-anywhere text-text-primary">{discussionTitle}</strong>. Workspace managers can finalize it after the outcome and rationale are ready.</p>
    <DecisionFields prefix="propose-decision" register={form.register} errors={form.formState.errors} disabled={busy} />
    {create.error ? <div role="alert" className="border-l-2 border-danger bg-surface px-4 py-3 text-sm text-danger">{decisionError(create.error, "Could not save the proposal. Your draft is still here; please try again.")}{["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(create.error.data?.code ?? "") ? <Link href={`/workspace/${workspaceId}/decisions`} className="mt-2 block font-semibold underline">Open decisions</Link> : null}</div> : null}
    {createdId ? <p role="status" className="text-sm text-text-secondary">Proposal saved. <Link href={`/workspace/${workspaceId}/decisions/${createdId}`} className="font-semibold text-brand-link underline">Open decision</Link></p> : null}
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-sm px-4 text-sm font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">Cancel</button>
      <button type="submit" disabled={busy} className="min-h-11 rounded-sm bg-brand-action px-5 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{createdId ? "Proposal saved" : busy ? "Saving proposal..." : "Save proposal"}</button>
    </div>
  </form>;
}
