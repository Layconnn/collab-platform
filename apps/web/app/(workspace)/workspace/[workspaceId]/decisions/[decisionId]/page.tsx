"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";

import { editDecisionInputSchema } from "@repo/validators/decision";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";
import { DecisionDate, DecisionSection, DecisionStatus, decisionError } from "@/components/decision/decisionUI";
import { decisionDraftSchema, DecisionFields, optionalEdit, type DecisionDraft } from "@/components/decision/decisionFields";
import { ReplacementHistory } from "@/components/decision/ReplacementHistory";
import { SupersedeDecisionDialog } from "@/components/decision/SupersedeDecisionDialog";
import { useAuth } from "@/hooks/useAuth";
import { useDecisionActions, useDecisionDetail, useDecisionRevisions, useReplacementHistory } from "@/hooks/useDecision";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";

function RevisionHistory({ workspaceId, decisionId }: { workspaceId: string; decisionId: string }) {
  const revisions = useDecisionRevisions(workspaceId, decisionId);
  const denied = ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(revisions.error?.data?.code ?? "");
  if (denied) return <ErrorState title="Decision history unavailable" description="Access to this decision may have changed." />;
  const items = revisions.data?.pages.flatMap((page) => page.items) ?? [];
  return <section aria-labelledby="revision-heading" className="mt-8 border-t border-border pt-8 sm:mt-10">
    <p className="text-xs font-semibold uppercase text-brand-link">Decision record</p>
    <h2 id="revision-heading" className="mt-1 text-xl font-semibold text-text-primary">Revision history</h2>
    <p className="mt-2 max-w-[62ch] text-sm leading-6 text-text-secondary">Each entry keeps the content recorded at that moment. Earlier reasoning stays visible.</p>
    {revisions.isLoading && !revisions.data ? <div className="py-6"><LoadingState label="Loading history..." /></div> : null}
    {revisions.error && !revisions.data ? <div className="py-6"><ErrorState title="Could not load history" onRetry={() => void revisions.refetch()} retrying={revisions.isFetching} /></div> : null}
    {revisions.error && revisions.data ? <div className="py-5"><ErrorState title={revisions.isFetchNextPageError ? "Could not load more history" : "Could not refresh history"} onRetry={() => void (revisions.isFetchNextPageError ? revisions.fetchNextPage() : revisions.refetch())} retrying={revisions.isFetching} /></div> : null}
    {!revisions.isLoading && !revisions.error && !items.length ? <div className="py-6"><EmptyState title="No revisions available" /></div> : null}
    {items.length ? <ol className="mt-6 border-l border-border-subtle pl-4 sm:pl-6">{items.map((revision) => <li key={revision.id} className="relative border-b border-border-subtle py-4 first:pt-0 last:border-0">
      <span aria-hidden="true" className="absolute -left-[1.3rem] top-5 size-2 rounded-full bg-brand-accent sm:-left-[1.8rem]" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-sm font-semibold text-text-primary">{revision.action === "CREATE" ? "Proposal created" : revision.action === "EDIT" ? "Proposal edited" : revision.action === "FINALIZE" ? "Decision finalized" : revision.action === "SUPERSEDE" ? revision.status === "SUPERSEDED" ? "Decision superseded" : "Linked as replacement" : "Decision deleted"}</h3><span className="text-xs text-text-muted">Version {revision.version}</span></div>
      <p className="mt-1 text-xs text-text-muted">{revision.actorLabel} · <DecisionDate value={revision.createdAt} /></p>
      {revision.reason ? <p className="mt-3 whitespace-pre-wrap wrap-anywhere text-sm text-text-secondary">Reason: {revision.reason}</p> : null}
      <details className="mt-2 text-sm"><summary className="min-h-10 cursor-pointer rounded-sm px-2 py-2 font-medium text-brand-link hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Recorded content</summary>
        <dl className="space-y-3 border-t border-border-subtle px-2 pt-3 text-text-secondary"><div><dt className="font-semibold text-text-primary">Recorded status</dt><dd className="mt-1"><DecisionStatus status={revision.status} /></dd></div><div><dt className="font-semibold text-text-primary">Question</dt><dd className="whitespace-pre-wrap wrap-anywhere">{revision.question}</dd></div>{(["outcome", "rationale", "alternatives", "followUp"] as const).map((field) => <div key={field}><dt className="font-semibold text-text-primary">{{ outcome: "Outcome", rationale: "Rationale", alternatives: "Alternatives", followUp: "Follow-up" }[field]}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{revision[field] || "Not recorded"}</dd></div>)}</dl>
      </details>
    </li>)}</ol> : null}
    {revisions.hasNextPage ? <button type="button" disabled={revisions.isFetchingNextPage} onClick={() => void revisions.fetchNextPage()} className="mt-4 min-h-11 rounded-sm border border-border px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{revisions.isFetchingNextPage ? "Loading..." : "Load more history"}</button> : null}
  </section>;
}

function DecisionContent({ workspaceId, decisionId }: { workspaceId: string; decisionId: string }) {
  const workspace = useWorkspaceDetail(workspaceId);
  const decision = useDecisionDetail(workspaceId, decisionId);
  const { user } = useAuth();
  const { edit, finalize } = useDecisionActions(workspaceId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [superseding, setSuperseding] = useState(false);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const finalizeButton = useRef<HTMLButtonElement>(null);
  const supersedeButton = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const form = useForm<DecisionDraft>({ resolver: zodResolver(decisionDraftSchema), shouldFocusError: true });
  useEffect(() => { if (confirming) confirmationRef.current?.focus(); }, [confirming]);
  const revisions = useDecisionRevisions(workspaceId, decisionId, Boolean(decision.data && !decision.error));
  const replacementHistory = useReplacementHistory(workspaceId, decisionId, Boolean(decision.data && !decision.error && decision.data.status !== "PROPOSED"));
  const allRevisions = revisions.data?.pages.flatMap((page) => page.items) ?? [];
  const finalization = allRevisions.find((revision) => revision.action === "FINALIZE");
  const denied = [workspace.error?.data?.code, decision.error?.data?.code, revisions.error?.data?.code, replacementHistory.error?.data?.code].some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED") || [revisions.error?.data?.code, replacementHistory.error?.data?.code].includes("NOT_FOUND");
  const actionAccessLost = [edit.error?.data?.code, finalize.error?.data?.code].some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND");
  const missing = workspace.error?.data?.code === "NOT_FOUND" || decision.error?.data?.code === "NOT_FOUND" || Boolean(decision.data && decision.data.workspaceId !== workspaceId);
  const role = workspace.data?.viewerRole;
  const manager = role === "ADMIN" || role === "OWNER";
  const canEdit = Boolean(user && workspace.data && !workspace.error && decision.data?.status === "PROPOSED" && (manager || decision.data.createdById === user.id));
  const canFinalize = Boolean(user && workspace.data && !workspace.error && decision.data?.status === "PROPOSED" && manager);
  const canSupersede = Boolean(user && workspace.data && !workspace.error && decision.data?.status === "DECIDED" && manager);

  if (denied || actionAccessLost) return <div className="mx-auto max-w-[52rem] space-y-4"><ErrorState title="Decision access restricted" description="You may no longer have access to this workspace's decisions." /><Link href="/workspace" className="font-semibold text-brand-link">All workspaces</Link></div>;
  if (decision.isLoading && !decision.data) return <div className="mx-auto max-w-[52rem] py-8"><LoadingState label="Loading decision..." /></div>;
  if (missing || (!decision.data && !decision.isLoading)) return <div className="mx-auto max-w-[52rem] space-y-4 py-8"><ErrorState title={missing ? "Decision unavailable" : "Could not load decision"} description={missing ? "This decision may have been removed or belongs to another workspace." : "Please try again."} onRetry={missing ? undefined : () => void decision.refetch()} retrying={decision.isFetching} /><Link href={`/workspace/${workspaceId}/decisions`} className="font-semibold text-brand-link">Back to decisions</Link></div>;
  if (!decision.data) return null;
  const record = decision.data;

  const startEdit = () => {
    edit.reset();
    form.reset({ question: record.question, outcome: record.outcome ?? "", rationale: record.rationale ?? "", alternatives: record.alternatives ?? "", followUp: record.followUp ?? "" });
    setEditVersion(record.version);
    setEditing(true);
    requestAnimationFrame(() => form.setFocus("question"));
  };
  const stopEdit = () => { setEditing(false); edit.reset(); requestAnimationFrame(() => editButton.current?.focus()); };
  const onEdit = (event: FormEvent<HTMLFormElement>) => {
    if (saving.current || editVersion === null) { event.preventDefault(); return; }
    saving.current = true;
    void form.handleSubmit(async (draft) => {
      const parsed = editDecisionInputSchema.safeParse({ workspaceId, decisionId, expectedVersion: editVersion, question: draft.question.trim(), outcome: optionalEdit(draft.outcome), rationale: optionalEdit(draft.rationale), alternatives: optionalEdit(draft.alternatives), followUp: optionalEdit(draft.followUp) });
      if (!parsed.success) { saving.current = false; return; }
      try { await edit.mutateAsync(parsed.data); stopEdit(); } catch { /* Keep the draft and its base version. */ } finally { saving.current = false; }
    }, () => { saving.current = false; })(event);
  };
  const onFinalize = async () => {
    try { await finalize.mutateAsync({ workspaceId, decisionId, expectedVersion: record.version }); setConfirming(false); requestAnimationFrame(() => headingRef.current?.focus()); }
    catch { /* The error and refresh action stay in the confirmation. */ }
  };

  return <main className="mx-auto w-full min-w-0 max-w-[52rem] pb-16">
    <Link href={`/workspace/${workspaceId}/decisions`} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-link hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring"><ArrowLeft size={16} aria-hidden="true" /> Back to decisions</Link>
    <article className="mt-6">
      <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-semibold uppercase text-brand-link">Decision</p><DecisionStatus status={record.status} /><span className="text-xs text-text-muted">Version {record.version}</span></div>
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 wrap-anywhere text-[1.85rem] font-semibold leading-tight text-text-primary outline-none sm:text-[2.35rem]">{record.question}</h1>
      <p className="mt-6 text-sm text-text-secondary">Proposed by <strong className="text-text-primary">{record.createdByLabel}</strong> · <DecisionDate value={record.createdAt} /></p>
      {record.decidedAt ? <p className="mt-1 text-sm text-text-secondary">Finalized {finalization ? <>by <strong className="text-text-primary">{finalization.actorLabel}</strong> · </> : null}<DecisionDate value={record.decidedAt} />{!finalization && revisions.hasNextPage ? " · Load more history to see who finalized it" : !finalization && !revisions.isLoading && !revisions.error ? " · Finalizer unavailable" : null}</p> : null}
      {record.status === "DECIDED" ? <p className="mt-2 text-sm font-semibold text-brand-link">Current decision</p> : null}
      <div className="mt-7 border-y border-border-subtle py-4 text-sm leading-6 text-text-secondary">
        <span className="font-semibold text-text-primary">Source discussion: </span>
        {record.sourceDiscussionId ? <Link href={`/workspace/${workspaceId}/discussions/${record.sourceDiscussionId}`} className="wrap-anywhere font-medium text-brand-link underline-offset-2 hover:underline">{record.sourceDiscussionTitle}</Link> : <span className="wrap-anywhere">{record.sourceDiscussionTitle} <span className="text-text-muted">(original discussion unavailable)</span></span>}
      </div>
      {record.previousDecision ? <div className="border-b border-border-subtle py-4 text-sm text-text-secondary"><span className="font-semibold text-text-primary">Previous decision: </span><Link href={`/workspace/${workspaceId}/decisions/${record.previousDecision.id}`} className="wrap-anywhere font-medium text-brand-link underline-offset-2 hover:underline">{record.previousDecision.question}</Link></div> : null}
      {record.supersession ? <div className="border-b border-border-subtle py-4 text-sm leading-6 text-text-secondary"><p><span className="font-semibold text-text-primary">Replaced by: </span>{record.replacementDecision ? <Link href={`/workspace/${workspaceId}/decisions/${record.replacementDecision.id}`} className="wrap-anywhere font-medium text-brand-link underline-offset-2 hover:underline">{record.replacementDecision.question}</Link> : "Replacement unavailable"}</p><p className="mt-2 whitespace-pre-wrap wrap-anywhere"><span className="font-semibold text-text-primary">Why: </span>{record.supersession.reason}</p><p className="mt-1 text-xs text-text-muted">Authorized by {record.supersession.authorizedByLabel} · <DecisionDate value={record.supersession.createdAt} /></p></div> : null}
      {decision.error && decision.data ? <p role="alert" className="mt-5 text-sm text-danger">This decision could not be refreshed. Check again before making changes.</p> : null}
      {editing && canEdit ? <form onSubmit={onEdit} noValidate className="mt-8 space-y-4 border-l-2 border-brand-accent bg-surface-subtle px-4 py-5 sm:px-6">
        <div><h2 className="text-lg font-semibold text-text-primary">Edit proposal</h2><p className="mt-1 text-sm text-text-secondary">Changes create a new revision. Finalized content cannot be edited.</p></div>
        <DecisionFields prefix="edit-decision" register={form.register} errors={form.formState.errors} disabled={edit.isPending} />
        {edit.error ? <div role="alert" className="text-sm text-danger">{decisionError(edit.error, "Could not save changes. Your draft is still here.")}{edit.error.data?.code === "CONFLICT" ? <button type="button" onClick={() => void decision.refetch()} className="ml-2 font-semibold underline">Refresh latest version (then cancel to reopen the editor)</button> : null}</div> : null}
        <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4"><button type="submit" disabled={edit.isPending || form.formState.isSubmitting} className="min-h-11 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{edit.isPending ? "Saving..." : "Save revision"}</button><button type="button" disabled={edit.isPending} onClick={stopEdit} className="min-h-11 rounded-sm px-4 text-sm font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Cancel</button></div>
      </form> : <>
        <div className="mt-8"><DecisionSection title={record.status === "PROPOSED" ? "Proposed outcome" : "Outcome"}>{record.outcome || <span className="text-text-muted">Not recorded yet.</span>}</DecisionSection><DecisionSection title="Rationale">{record.rationale || <span className="text-text-muted">Not recorded yet.</span>}</DecisionSection>{record.alternatives ? <DecisionSection title="Alternatives considered">{record.alternatives}</DecisionSection> : null}{record.followUp ? <DecisionSection title="Follow-up notes">{record.followUp}</DecisionSection> : null}</div>
        {canEdit || canFinalize || canSupersede ? <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-5">{canEdit ? <button ref={editButton} type="button" onClick={startEdit} className="min-h-11 rounded-sm border border-border px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Edit proposal</button> : null}{canFinalize ? <button ref={finalizeButton} type="button" onClick={() => { finalize.reset(); setConfirming(true); }} disabled={!record.outcome?.trim() || !record.rationale?.trim()} title={!record.outcome?.trim() || !record.rationale?.trim() ? "Add an outcome and rationale before finalizing" : undefined} className="min-h-11 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">Finalize decision</button> : null}{canSupersede ? <button ref={supersedeButton} type="button" onClick={() => setSuperseding(true)} className="min-h-11 rounded-sm border border-border px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Supersede decision</button> : null}</div> : null}
      </>}
    </article>
    {superseding && canSupersede ? <SupersedeDecisionDialog workspaceId={workspaceId} oldDecision={{ id: record.id, question: record.question, version: record.version }} onClose={() => { setSuperseding(false); requestAnimationFrame(() => supersedeButton.current?.focus()); }} /> : null}
    {confirming && canFinalize ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onKeyDown={(event) => {
      if (event.key === "Escape" && !finalize.isPending) { setConfirming(false); requestAnimationFrame(() => finalizeButton.current?.focus()); }
      if (event.key === "Tab" && confirmationRef.current) {
        const controls = Array.from(confirmationRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const first = controls[0]; const last = controls[controls.length - 1];
        if (first && last && (event.shiftKey ? document.activeElement === first || document.activeElement === confirmationRef.current : document.activeElement === last || document.activeElement === confirmationRef.current)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        }
      }
    }}>
      <div ref={confirmationRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="finalize-title" aria-describedby="finalize-description" className="w-full max-w-lg rounded-sm border border-border bg-surface p-5 shadow-xl outline-none sm:p-7">
        <h2 id="finalize-title" className="text-xl font-semibold text-text-primary">Finalize this decision?</h2><p id="finalize-description" className="mt-3 text-sm leading-6 text-text-secondary">The outcome and rationale will become immutable. You can still read every earlier revision.</p>
        {!record.sourceDiscussionId ? <p className="mt-3 border-l-2 border-info px-3 text-sm text-text-secondary">The supporting discussion is unavailable. Its title has been retained: {record.sourceDiscussionTitle}.</p> : null}
        {finalize.error ? <div role="alert" className="mt-4 text-sm text-danger">{decisionError(finalize.error, "Finalization failed. Please try again.")}{finalize.error.data?.code === "CONFLICT" ? <button type="button" onClick={() => { setConfirming(false); void decision.refetch(); requestAnimationFrame(() => headingRef.current?.focus()); }} className="ml-2 font-semibold underline">Review latest version</button> : null}</div> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={finalize.isPending} onClick={() => { setConfirming(false); requestAnimationFrame(() => finalizeButton.current?.focus()); }} className="min-h-11 px-4 text-sm font-semibold text-text-secondary">Cancel</button><button type="button" disabled={finalize.isPending} onClick={() => void onFinalize()} className="min-h-11 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action disabled:opacity-60">{finalize.isPending ? "Finalizing..." : "Confirm finalization"}</button></div>
      </div>
    </div> : null}
    <ReplacementHistory workspaceId={workspaceId} decisionId={decisionId} history={replacementHistory} />
    <RevisionHistory workspaceId={workspaceId} decisionId={decisionId} />
  </main>;
}

export default function DecisionDetailPage() {
  const { workspaceId, decisionId } = useParams<{ workspaceId: string; decisionId: string }>();
  return <DecisionContent key={`${workspaceId}:${decisionId}`} workspaceId={workspaceId} decisionId={decisionId} />;
}
