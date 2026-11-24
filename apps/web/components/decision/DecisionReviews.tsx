"use client";

import { Check, CircleDashed, MinusCircle, UserPlus, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Modal } from "@/components/common/Modal";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { DecisionDate } from "@/components/decision/decisionUI";
import { useDecisionReviews, useReviewActions } from "@/hooks/useDecisionReviews";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";

type ReviewState = "PENDING" | "APPROVED" | "OBJECTED" | "WITHDRAWN";
type Rule = "ALL" | "AT_LEAST";
export type ReviewSummary = { rule: Rule; needed: number; active: number; approved: number; objected: number; pending: number; met: boolean };
type HistoryEvent = { id: string; kind: string; actorLabel: string; summary: unknown; createdAt: Date | string };

const MAX_REVIEWERS = 10;
const STATE_TEXT: Record<ReviewState, string> = { PENDING: "Waiting", APPROVED: "Approved", OBJECTED: "Objected", WITHDRAWN: "Withdrawn" };
const STATE_STYLE: Record<ReviewState, string> = {
  PENDING: "border-border text-text-secondary",
  APPROVED: "border-success text-success",
  OBJECTED: "border-danger text-danger",
  WITHDRAWN: "border-border-subtle text-text-muted",
};
const STATE_ICON = { PENDING: CircleDashed, APPROVED: Check, OBJECTED: X, WITHDRAWN: MinusCircle } as const;

const button = "min-h-10 rounded-sm px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60";
const primary = `${button} bg-brand-action px-4 text-on-brand-action hover:bg-brand-action-hover`;
const quiet = `${button} border border-border text-text-primary hover:bg-surface-hover`;
const control = "min-w-0 rounded-sm border border-control-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-focus-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/25";
const field = `w-full ${control}`;
const numberField = `w-20 ${control}`;

// "1 of 2 approved", "No reviewers yet".
export function reviewProgress(summary: ReviewSummary) {
  if (!summary.active) return "No reviewers yet";
  return `${summary.approved} of ${summary.needed} ${summary.rule === "ALL" ? "approved" : "approvals needed"}`;
}

export function ruleText(summary: Pick<ReviewSummary, "rule" | "needed" | "active">) {
  return summary.rule === "ALL" ? "Everyone asked must approve" : `At least ${summary.needed} of ${summary.active} must approve`;
}

// One line of review history in plain language.
export function reviewEventText(event: Pick<HistoryEvent, "kind" | "actorLabel" | "summary">) {
  const summary = (event.summary ?? {}) as Record<string, string | number | null | undefined>;
  const who = event.actorLabel;
  switch (event.kind) {
    case "DECISION_REVIEW_REQUESTED": return `${who} asked ${summary.reviewer ?? "someone"} to review`;
    case "DECISION_REVIEW_RESPONDED": {
      const verb = summary.response === "APPROVED" ? "approved" : "objected";
      const changed = summary.previous === "APPROVED" || summary.previous === "OBJECTED" ? ` (changed from ${summary.previous === "APPROVED" ? "approved" : "objected"})` : "";
      return `${who} ${verb}${summary.version ? ` version ${summary.version}` : ""}${changed}${summary.note ? `: “${summary.note}”` : ""}`;
    }
    case "DECISION_REVIEW_WITHDRAWN": return summary.reason === "left the workspace"
      ? `${summary.reviewer ?? "A reviewer"} left the workspace, so their review was withdrawn`
      : `${who} withdrew the request to ${summary.reviewer ?? "a reviewer"}`;
    case "DECISION_REVIEWS_RESET": return `${who} changed the proposal, so ${summary.reviewers === 1 ? "1 reviewer was" : `${summary.reviewers ?? "the"} reviewers were`} asked again`;
    case "DECISION_REVIEW_RULE_CHANGED": return summary.rule === "AT_LEAST"
      ? `${who} set the rule to at least ${summary.requiredApprovals} approvals`
      : `${who} set the rule to everyone must approve`;
    default: return `${who} updated the review`;
  }
}

function StateBadge({ state }: { state: ReviewState }) {
  const Icon = STATE_ICON[state];
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-sm border px-2 text-xs font-semibold ${STATE_STYLE[state]}`}><Icon size={13} aria-hidden="true" />{STATE_TEXT[state]}</span>;
}

function RequestDialog({ workspaceId, decisionId, authorId, asked, summary, onClose }: {
  workspaceId: string; decisionId: string; authorId: string | null; asked: Set<string>; summary: ReviewSummary; onClose: () => void;
}) {
  const members = useWorkspaceMembers(workspaceId);
  const { request } = useReviewActions(workspaceId, decisionId);
  const [chosen, setChosen] = useState<string[]>([]);
  const [rule, setRule] = useState<Rule>(summary.rule);
  const [atLeast, setAtLeast] = useState(Math.max(1, summary.needed));
  const candidates = (members.members.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((member) => member.userId !== authorId && !asked.has(member.userId));
  const room = MAX_REVIEWERS - summary.active;
  const total = summary.active + chosen.length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!chosen.length || request.isPending) return;
    request.mutate(
      { workspaceId, decisionId, reviewerIds: chosen, rule: rule === "ALL" ? { rule } : { rule, requiredApprovals: Math.min(atLeast, total) } },
      { onSuccess: onClose },
    );
  };

  return <Modal title="Request review" description="Reviewers approve or object, and their answers stay on the record." onClose={onClose} busy={request.isPending}>
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold text-text-primary">Who should review?</legend>
        <p className="mt-1 text-xs text-text-muted">{room > 0 ? `Up to ${room} more ${room === 1 ? "person" : "people"}. The author can't review their own proposal.` : "This proposal already has 10 reviewers."}</p>
        {members.members.isLoading ? <div className="py-4"><LoadingState label="Loading members..." /></div> : null}
        {members.members.error ? <p role="alert" className="mt-3 text-sm text-danger">Could not load members.</p> : null}
        {members.members.data && !candidates.length ? <p className="mt-3 text-sm text-text-secondary">Everyone who can review has been asked.</p> : null}
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {candidates.map((member) => {
            const checked = chosen.includes(member.userId);
            const name = member.user.name?.trim() || member.user.username;
            return <li key={member.userId}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-surface-hover">
                <input type="checkbox" checked={checked} disabled={!checked && chosen.length >= room} onChange={() => setChosen((list) => checked ? list.filter((id) => id !== member.userId) : [...list, member.userId])} className="size-4 accent-[var(--color-brand-action)]" />
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{name}</span>
                <span className="shrink-0 text-xs text-text-muted">@{member.user.username}</span>
              </label>
            </li>;
          })}
        </ul>
        {members.members.hasNextPage ? <button type="button" onClick={() => void members.members.fetchNextPage()} disabled={members.members.isFetchingNextPage} className={`mt-2 ${quiet}`}>{members.members.isFetchingNextPage ? "Loading..." : "Show more members"}</button> : null}
      </fieldset>
      <fieldset className="border-t border-border-subtle pt-4">
        <legend className="text-sm font-semibold text-text-primary">When can it be finalized?</legend>
        <label className="mt-3 flex min-h-10 items-center gap-3 text-sm text-text-primary"><input type="radio" name="review-rule" checked={rule === "ALL"} onChange={() => setRule("ALL")} className="size-4 accent-[var(--color-brand-action)]" /> When everyone asked approves</label>
        <div className="flex min-h-10 flex-wrap items-center gap-3 text-sm text-text-primary">
          <label className="flex items-center gap-3"><input type="radio" name="review-rule" checked={rule === "AT_LEAST"} onChange={() => setRule("AT_LEAST")} className="size-4 accent-[var(--color-brand-action)]" /> When at least</label>
          <input type="number" aria-label="Approvals needed" min={1} max={Math.max(1, total)} value={atLeast} onChange={(event) => setAtLeast(Math.max(1, Number(event.target.value) || 1))} onFocus={() => setRule("AT_LEAST")} className={numberField} />
          <span>{total === 1 ? "person approves" : "people approve"}</span>
        </div>
        {rule === "AT_LEAST" && atLeast > total && total > 0 ? <p className="mt-1 text-xs text-text-muted">Only {total} {total === 1 ? "reviewer is" : "reviewers are"} asked, so {total} will be required.</p> : null}
      </fieldset>
      {request.error ? <p role="alert" className="text-sm text-danger">{request.error.message || "Could not request review. Please try again."}</p> : null}
      <div className="flex flex-col-reverse gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={request.isPending} className={`${button} text-text-secondary hover:bg-surface-hover`}>Cancel</button>
        <button type="submit" disabled={!chosen.length || request.isPending} className={primary}>{request.isPending ? "Asking..." : chosen.length ? `Ask ${chosen.length} ${chosen.length === 1 ? "person" : "people"}` : "Choose reviewers"}</button>
      </div>
    </form>
  </Modal>;
}

function RespondForm({ workspaceId, decisionId, version, current }: {
  workspaceId: string; decisionId: string; version: number; current: { state: ReviewState; note: string | null };
}) {
  const { respond } = useReviewActions(workspaceId, decisionId);
  const answered = current.state === "APPROVED" || current.state === "OBJECTED";
  const [choice, setChoice] = useState<"APPROVED" | "OBJECTED">(current.state === "OBJECTED" ? "OBJECTED" : "APPROVED");
  const [note, setNote] = useState(current.note ?? "");
  const [editing, setEditing] = useState(!answered);
  const [missingReason, setMissingReason] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (respond.isPending) return;
    if (choice === "OBJECTED" && !note.trim()) { setMissingReason(true); noteRef.current?.focus(); return; }
    respond.mutate(
      { workspaceId, decisionId, expectedVersion: version, response: choice, note: note.trim() || undefined },
      { onSuccess: () => setEditing(false) },
    );
  };

  if (!editing) {
    return <div className="mt-5 flex flex-wrap items-center gap-3 rounded-sm border border-border-subtle bg-surface-subtle px-4 py-3">
      <p className="text-sm text-text-primary">You {current.state === "APPROVED" ? "approved" : "objected to"} this version.</p>
      <button type="button" onClick={() => setEditing(true)} className={quiet}>Change your review</button>
    </div>;
  }

  return <form onSubmit={submit} aria-labelledby="your-review-heading" className="mt-5 space-y-3 rounded-sm border border-brand-accent bg-surface-subtle px-4 py-4 sm:px-5">
    <h3 id="your-review-heading" className="text-sm font-semibold text-text-primary">Your review</h3>
    <div role="radiogroup" aria-label="Your answer" className="flex flex-wrap gap-2">
      {(["APPROVED", "OBJECTED"] as const).map((value) => <label key={value} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm font-semibold ${choice === value ? "border-brand-action bg-surface text-text-primary" : "border-border text-text-secondary hover:bg-surface-hover"}`}>
        <input type="radio" name="review-answer" value={value} checked={choice === value} onChange={() => { setChoice(value); setMissingReason(false); }} className="size-4 accent-[var(--color-brand-action)]" />
        {value === "APPROVED" ? "Approve" : "Object"}
      </label>)}
    </div>
    <div>
      <label htmlFor="review-note" className="text-sm font-medium text-text-primary">{choice === "OBJECTED" ? "Why do you object?" : "Note (optional)"}</label>
      <textarea id="review-note" ref={noteRef} rows={3} maxLength={2000} value={note} onChange={(event) => { setNote(event.target.value); setMissingReason(false); }} aria-invalid={missingReason} aria-describedby={missingReason ? "review-note-error" : undefined} className={`mt-1 ${field}`} />
      {missingReason ? <p id="review-note-error" role="alert" className="mt-1 text-xs text-danger">Say why you object, so the author can respond.</p> : null}
    </div>
    {respond.error ? <p role="alert" className="text-sm text-danger">{respond.error.data?.code === "CONFLICT" ? "The proposal changed since you opened it. Reload and review the current version." : respond.error.message || "Could not send your review."}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="submit" disabled={respond.isPending} className={primary}>{respond.isPending ? "Sending..." : choice === "APPROVED" ? "Approve" : "Object"}</button>
      {answered ? <button type="button" onClick={() => setEditing(false)} disabled={respond.isPending} className={`${button} text-text-secondary hover:bg-surface-hover`}>Cancel</button> : null}
    </div>
  </form>;
}

function RuleEditor({ workspaceId, decisionId, summary, requiredApprovals }: { workspaceId: string; decisionId: string; summary: ReviewSummary; requiredApprovals: number | null }) {
  const { setRule } = useReviewActions(workspaceId, decisionId);
  const [rule, setRuleChoice] = useState<Rule>(summary.rule);
  const [atLeast, setAtLeast] = useState(requiredApprovals ?? summary.active);
  const changed = rule !== summary.rule || (rule === "AT_LEAST" && atLeast !== requiredApprovals);
  return <details className="mt-3 text-sm">
    <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-sm px-2 font-medium text-brand-link hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Change the rule</summary>
    <form onSubmit={(event) => { event.preventDefault(); if (changed) setRule.mutate(rule === "ALL" ? { workspaceId, decisionId, rule } : { workspaceId, decisionId, rule, requiredApprovals: atLeast }); }} className="mt-2 flex flex-wrap items-center gap-3 px-2">
      <label className="flex items-center gap-2"><input type="radio" name="edit-rule" checked={rule === "ALL"} onChange={() => setRuleChoice("ALL")} className="size-4 accent-[var(--color-brand-action)]" /> Everyone</label>
      <label className="flex items-center gap-2"><input type="radio" name="edit-rule" checked={rule === "AT_LEAST"} onChange={() => setRuleChoice("AT_LEAST")} className="size-4 accent-[var(--color-brand-action)]" /> At least</label>
      <input type="number" aria-label="Approvals needed" min={1} max={summary.active} value={atLeast} onChange={(event) => setAtLeast(Math.min(summary.active, Math.max(1, Number(event.target.value) || 1)))} onFocus={() => setRuleChoice("AT_LEAST")} className={numberField} />
      <button type="submit" disabled={!changed || setRule.isPending} className={quiet}>{setRule.isPending ? "Saving..." : "Save rule"}</button>
      {setRule.error ? <p role="alert" className="basis-full text-xs text-danger">{setRule.error.message}</p> : null}
    </form>
  </details>;
}

export function DecisionReviews({ workspaceId, decisionId, authorId }: { workspaceId: string; decisionId: string; authorId: string | null }) {
  const reviews = useDecisionReviews(workspaceId, decisionId);
  const { withdraw } = useReviewActions(workspaceId, decisionId);
  const [requesting, setRequesting] = useState(false);
  const data = reviews.data;

  return <section aria-labelledby="review-heading" className="mt-8 border-t border-border pt-8 sm:mt-10">
    <p className="text-xs font-semibold uppercase text-brand-link">Review</p>
    <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="review-heading" className="text-xl font-semibold text-text-primary">{data ? `Review · ${reviewProgress(data.summary)}` : "Review"}</h2>
      {data?.viewer.canManage ? <button type="button" onClick={() => setRequesting(true)} disabled={data.summary.active >= MAX_REVIEWERS} className={`${quiet} inline-flex items-center gap-2`}><UserPlus size={15} aria-hidden="true" /> Request review</button> : null}
    </div>
    {reviews.isLoading ? <div className="py-5"><LoadingState label="Loading reviews..." /></div> : null}
    {reviews.error && !data ? <div className="py-5"><ErrorState title="Could not load reviews" onRetry={() => void reviews.refetch()} retrying={reviews.isFetching} /></div> : null}
    {data ? <>
      {data.summary.active ? <p className="mt-2 text-sm text-text-secondary">{ruleText(data.summary)}. {data.summary.met ? <strong className="font-semibold text-success">The rule is met.</strong> : <span>Waiting for {data.summary.needed - data.summary.approved} more {data.summary.needed - data.summary.approved === 1 ? "approval" : "approvals"}.</span>}</p>
        : <p className="mt-2 max-w-[62ch] text-sm leading-6 text-text-secondary">{data.viewer.canManage ? "Ask teammates to approve or object before this is finalized. Their answers are kept with the decision." : "Nobody has been asked to review this proposal."}</p>}
      {data.viewer.canManage && data.summary.active ? <RuleEditor key={`${data.summary.rule}-${data.requiredApprovals}`} workspaceId={workspaceId} decisionId={decisionId} summary={data.summary} requiredApprovals={data.requiredApprovals} /> : null}
      {data.reviews.length ? <ul aria-label="Reviewers" className="mt-4 border-t border-border-subtle">
        {data.reviews.map((review) => <li key={`${review.reviewerId ?? review.reviewerLabel}-${review.createdAt.toString()}`} className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border-subtle py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className={`text-sm font-semibold ${review.state === "WITHDRAWN" ? "text-text-muted line-through" : "text-text-primary"}`}>{review.reviewerLabel}</span><StateBadge state={review.state} />{review.stale ? <span className="text-xs text-text-muted">answered an earlier version</span> : null}</div>
            {review.note ? <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-text-secondary">“{review.note}”</p> : null}
            <p className="mt-1 text-xs text-text-muted">{review.respondedAt ? <>Answered <DecisionDate value={review.respondedAt} /></> : <>Asked by {review.requestedByLabel} · <DecisionDate value={review.createdAt} /></>}</p>
          </div>
          {data.viewer.canManage && review.state !== "WITHDRAWN" && review.reviewerId ? <button type="button" onClick={() => withdraw.mutate({ workspaceId, decisionId, reviewerId: review.reviewerId! })} disabled={withdraw.isPending} aria-label={`Withdraw review request to ${review.reviewerLabel}`} className={`${button} text-text-secondary hover:bg-surface-hover`}>Withdraw</button> : null}
        </li>)}
      </ul> : null}
      {withdraw.error ? <p role="alert" className="mt-2 text-sm text-danger">{withdraw.error.message || "Could not withdraw the request."}</p> : null}
      {data.viewer.canRespond && data.viewer.review ? <RespondForm key={`${data.decisionVersion}-${data.viewer.review.state}`} workspaceId={workspaceId} decisionId={decisionId} version={data.decisionVersion} current={data.viewer.review} /> : null}
      {data.history.length ? <details className="mt-5 text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-sm px-2 font-medium text-brand-link hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Review history ({data.history.length})</summary>
        <ol className="mt-2 space-y-2 border-l border-border-subtle pl-4">
          {data.history.map((event) => <li key={event.id} className="text-sm text-text-secondary"><span className="wrap-anywhere">{reviewEventText(event)}</span> <span className="text-xs text-text-muted">· <DecisionDate value={event.createdAt} /></span></li>)}
        </ol>
      </details> : null}
    </> : null}
    {requesting && data ? <RequestDialog workspaceId={workspaceId} decisionId={decisionId} authorId={authorId} asked={new Set(data.reviews.filter((review) => review.state !== "WITHDRAWN" && review.reviewerId).map((review) => review.reviewerId!))} summary={data.summary} onClose={() => setRequesting(false)} /> : null}
  </section>;
}
