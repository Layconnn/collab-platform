"use client";

import Link from "next/link";
import { Check, Copy, Plus } from "lucide-react";
import { useState } from "react";

import { timeAgo } from "@/components/activity/RecentActivity";
import { readRecent, type RecentEntry } from "@/components/command/commandItems";
import { ErrorState } from "@/components/common/StateNotice";
import { WorkspaceCards } from "@/components/home/WorkspaceCards";
import { useAuth } from "@/hooks/useAuth";
import { useDismissNeeds, useNeedsYou, useRecentDecisions, useWorkspacePulse } from "@/hooks/useHome";
import { useUiStore } from "@/stores/ui.store";

const DAY_MS = 24 * 60 * 60 * 1000;
const URGENT_MS = 2 * DAY_MS;

type NeedItem = {
  id: string;
  kind: "REVIEW_REQUESTED" | "MENTION" | "REPLY" | "PROPOSAL_WAITING" | "OWN_PROPOSAL";
  workspace: { id: string; name: string };
  title: string;
  actor: string | null;
  discussionId: string | null;
  decisionId: string | null;
  at: Date | string;
  notificationId: string | null;
};

type RecentDecision = {
  decisionId: string;
  workspace: { id: string; name: string };
  question: string;
  action: "FINALIZED" | "SUPERSEDED";
  actor: string;
  at: Date | string;
  replacement: { id: string; question: string } | null;
};

export function greeting(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function daysSince(value: Date | string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / DAY_MS));
}

const days = (n: number) => (n === 0 ? "less than a day" : n === 1 ? "1 day" : `${n} days`);

// The line under each item explains why it is here.
export function needReason(item: NeedItem, now = Date.now()) {
  const who = item.actor ?? "Someone";
  switch (item.kind) {
    case "REVIEW_REQUESTED": return `${who} asked for your review · waiting ${days(daysSince(item.at, now))}`;
    case "MENTION": return `${who} mentioned you`;
    case "REPLY": return `${who} replied to your discussion`;
    case "PROPOSAL_WAITING": return `Proposed by ${who} · waiting ${days(daysSince(item.at, now))} for a decision`;
    case "OWN_PROPOSAL": return `Your proposal · open for ${days(daysSince(item.at, now))}`;
  }
}

export function needHref(item: NeedItem) {
  const base = `/workspace/${item.workspace.id}`;
  return item.decisionId ? `${base}/decisions/${item.decisionId}` : `${base}/discussions/${item.discussionId ?? ""}`;
}

const KIND_LABEL: Record<NeedItem["kind"], string> = {
  MENTION: "Mention",
  REPLY: "Reply",
  PROPOSAL_WAITING: "Decision needed",
  REVIEW_REQUESTED: "Review requested",
  OWN_PROPOSAL: "Your proposal",
};

const sectionTitle = "text-lg font-semibold text-text-primary";
const eyebrow = "text-xs font-semibold uppercase text-brand-link";
const quietButton = "min-h-10 rounded-sm px-3 text-sm font-semibold text-brand-link hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60";

function NeedsYou() {
  const [showAll, setShowAll] = useState(false);
  // One clock reading per visit keeps urgency and ages stable across renders.
  const [now] = useState(() => Date.now());
  const needs = useNeedsYou(showAll);
  const { dismiss, dismissAll } = useDismissNeeds();
  const items: NeedItem[] = needs.data?.items ?? [];
  const total = needs.data?.total ?? 0;
  const dismissable = items.some((item) => item.notificationId);

  return <section aria-labelledby="needs-you-heading" className="min-w-0">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className={eyebrow}>Across your workspaces</p>
        <h2 id="needs-you-heading" className={`mt-1 ${sectionTitle}`}>Needs you{needs.data ? ` · ${total}` : ""}</h2>
      </div>
      {dismissable ? <button type="button" disabled={dismissAll.isPending} onClick={() => dismissAll.mutate()} className={quietButton}>{dismissAll.isPending ? "Marking..." : "Mark all done"}</button> : null}
    </div>

    {needs.isLoading ? <div role="status" aria-label="Loading what needs you" className="mt-4 border-t border-border-subtle">
      {[1, 2, 3].map((row) => <div key={row} aria-hidden="true" className="space-y-2 border-b border-border-subtle py-4"><span className="block h-4 w-2/3 animate-pulse rounded-sm bg-surface-active" /><span className="block h-3 w-1/3 animate-pulse rounded-sm bg-surface-subtle" /></div>)}
    </div> : null}
    {needs.error ? <div className="mt-4"><ErrorState title="Could not load what needs you" description="Please try again in a moment." onRetry={() => void needs.refetch()} retrying={needs.isFetching} /></div> : null}
    {needs.data && !items.length ? <div className="mt-4 rounded-sm border border-border-subtle bg-surface-subtle px-4 py-5">
      <p className="font-semibold text-text-primary">You&apos;re all caught up</p>
      <p className="mt-1 text-sm text-text-secondary">Mentions, replies to your discussions and proposals waiting for a decision will appear here.</p>
    </div> : null}

    {items.length ? <ul className="mt-4 border-t border-border-subtle" aria-label="Needs you">
      {items.map((item) => {
        const urgent = item.kind === "PROPOSAL_WAITING" && now - new Date(item.at).getTime() > URGENT_MS;
        return <li key={item.id} className="flex min-w-0 items-start gap-3 border-b border-border-subtle py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className={`rounded-sm px-1.5 py-0.5 font-semibold ${urgent ? "bg-danger-action text-on-danger-action" : "bg-surface-active text-text-secondary"}`}>{KIND_LABEL[item.kind]}</span>
              <span className="text-text-muted">{item.workspace.name}</span>
            </div>
            <Link
              href={needHref(item)}
              onClick={() => { if (item.notificationId) dismiss.mutate({ notificationIds: [item.notificationId] }); }}
              className="mt-1.5 block wrap-anywhere font-semibold text-text-primary underline-offset-2 hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
            >{item.title}</Link>
            <p className="mt-1 text-sm text-text-secondary">{needReason(item, now)} · <time dateTime={new Date(item.at).toISOString()}>{timeAgo(item.at)}</time></p>
          </div>
          {item.notificationId ? <button
            type="button"
            aria-label={`Mark done: ${item.title}`}
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate({ notificationIds: [item.notificationId!] })}
            className="shrink-0 rounded-sm border border-border-subtle px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
          >Done</button> : null}
        </li>;
      })}
    </ul> : null}
    {needs.data && total > items.length ? <button type="button" onClick={() => setShowAll(true)} className={`mt-3 ${quietButton}`}>Show all {total}</button> : null}
  </section>;
}

function DecidedThisWeek() {
  const recent = useRecentDecisions();
  const decisions: RecentDecision[] = recent.data?.decisions ?? [];
  return <section aria-labelledby="decided-heading" className="min-w-0">
    <p className={eyebrow}>The record</p>
    <h2 id="decided-heading" className={`mt-1 ${sectionTitle}`}>Decided this week</h2>
    {recent.isLoading ? <div role="status" aria-label="Loading decisions" className="mt-4 space-y-3">{[1, 2].map((row) => <span key={row} aria-hidden="true" className="block h-10 animate-pulse rounded-sm bg-surface-active" />)}</div> : null}
    {recent.error ? <div className="mt-4"><ErrorState title="Could not load decisions" onRetry={() => void recent.refetch()} retrying={recent.isFetching} /></div> : null}
    {recent.data && !decisions.length ? <p className="mt-3 text-sm leading-6 text-text-secondary">No decisions this week. Finalized and replaced decisions from all your workspaces appear here.</p> : null}
    {decisions.length ? <ol className="mt-3 space-y-1" aria-label="Decided this week">
      {decisions.map((decision) => <li key={decision.decisionId} className="min-w-0 rounded-sm py-2.5">
        <Link href={`/workspace/${decision.workspace.id}/decisions/${decision.decisionId}`} className="wrap-anywhere text-sm font-semibold text-text-primary underline-offset-2 hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">{decision.question}</Link>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          {decision.action === "SUPERSEDED"
            ? <>Replaced{decision.replacement ? <> by <Link href={`/workspace/${decision.workspace.id}/decisions/${decision.replacement.id}`} className="text-brand-link hover:underline">{decision.replacement.question}</Link></> : null} · {decision.actor}</>
            : <>Finalized by {decision.actor}</>}
          {" · "}{decision.workspace.name} · <time dateTime={new Date(decision.at).toISOString()}>{timeAgo(decision.at)}</time>
        </p>
      </li>)}
    </ol> : null}
  </section>;
}

// Home renders only in the browser, after sign-in, so storage can be read
// while the component starts.
function JumpBackIn() {
  const [recent] = useState<RecentEntry[]>(() => {
    try { return typeof window === "undefined" ? [] : readRecent(window.localStorage); } catch { return []; }
  });
  if (!recent.length) return null;
  return <section aria-labelledby="jump-heading" className="min-w-0">
    <h2 id="jump-heading" className={sectionTitle}>Jump back in</h2>
    <ul className="mt-3 flex flex-wrap gap-2">
      {recent.map((entry) => <li key={entry.href}><Link href={entry.href} className="inline-flex min-h-9 max-w-[18rem] items-center gap-2 rounded-sm border border-border-subtle px-3 text-sm text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"><span className="truncate">{entry.label}</span>{entry.hint ? <span className="shrink-0 text-xs text-text-muted">{entry.hint}</span> : null}</Link></li>)}
    </ul>
  </section>;
}

const primaryButton = "inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto";

// First run (FR-14): a member with no workspace creates one or shares their
// username so a teammate can add them. Home switches to the full layout as
// soon as the pulse lists a workspace.
function FirstRun({ username }: { username: string }) {
  const openCreate = useUiStore((state) => state.setCreateWorkspaceOpen);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyUsername = async () => {
    try { await navigator.clipboard.writeText(username); setCopy("copied"); } catch { setCopy("failed"); }
  };
  const step = "grid min-w-0 gap-4 border-t border-border-subtle py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)]";
  const number = "grid size-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800";
  return <section aria-labelledby="first-run-heading" className="max-w-3xl">
    <p className={eyebrow}>Getting started</p>
    <h2 id="first-run-heading" className="mt-1 text-xl font-semibold text-text-primary sm:text-2xl">Start with a workspace</h2>
    <p className="mt-2 max-w-[60ch] text-sm leading-6 text-text-secondary">A workspace holds your team&apos;s discussions and the decisions they lead to. Once you&apos;re in one, this page shows what needs you, what was decided and how each workspace is doing.</p>
    <ol className="mt-6 border-b border-border-subtle">
      <li className={step}>
        <span aria-hidden="true" className={number}>1</span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-primary">Create one for your team</h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">Name it after the team or project. You can add people by their username straight after.</p>
          <button type="button" onClick={() => openCreate(true)} className={`mt-4 ${primaryButton}`}><Plus size={16} aria-hidden="true" /> Create a workspace</button>
        </div>
      </li>
      <li className={step}>
        <span aria-hidden="true" className={number}>2</span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-primary">Or join your team&apos;s workspace</h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">Ask a teammate who already uses Commons to add you from their workspace&apos;s Members page. They&apos;ll need your username:</p>
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 wrap-anywhere rounded-sm border border-border-subtle bg-surface-subtle px-3 py-2 font-mono text-sm text-text-primary">{username}</code>
            <button type="button" onClick={() => void copyUsername()} className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">
              {copy === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} Copy username
            </button>
            <span role="status" className="text-xs text-text-muted">{copy === "copied" ? "Copied" : copy === "failed" ? "Could not copy. Select the username instead." : ""}</span>
          </div>
        </div>
      </li>
    </ol>
  </section>;
}

export function HomePage() {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const firstName = (user?.name?.trim() || user?.username || "").split(/\s+/)[0];
  const openCreate = useUiStore((state) => state.setCreateWorkspaceOpen);
  const pulse = useWorkspacePulse();
  const firstRun = Boolean(pulse.data && !pulse.data.workspaces.length);

  return <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-10 pb-12">
    <header className="flex flex-col gap-4 border-b border-border-subtle pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-text-muted" suppressHydrationWarning>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(now)}</p>
        <h1 className="mt-1 wrap-anywhere text-[1.8rem] font-semibold leading-tight text-text-primary sm:text-[2.1rem]" suppressHydrationWarning>{greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}</h1>
      </div>
      {firstRun ? null : <button type="button" onClick={() => openCreate(true)} className={primaryButton}><Plus size={16} aria-hidden="true" /> New workspace</button>}
    </header>

    {firstRun ? <FirstRun username={user?.username ?? ""} /> : <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <div className="min-w-0 space-y-10">
        <NeedsYou />
        <section aria-labelledby="workspace-directory-heading" className="min-w-0">
          <h2 id="workspace-directory-heading" className={`mb-4 ${sectionTitle}`}>Your workspaces</h2>
          <WorkspaceCards />
        </section>
      </div>
      <aside className="min-w-0 space-y-10" aria-label="This week">
        <DecidedThisWeek />
        <JumpBackIn />
      </aside>
    </div>}

  </div>;
}

