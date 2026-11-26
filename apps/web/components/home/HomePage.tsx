"use client";

import Link from "next/link";
import { Check, Clock3, Copy, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { timeAgo } from "@/components/activity/RecentActivity";
import { readRecent, type RecentEntry } from "@/components/command/commandItems";
import { ErrorState } from "@/components/common/StateNotice";
import { UserAvatar } from "@/components/common/UserAvatar";
import { FileCount } from "@/components/files/FileCount";
import { QuickReply, ReviewActions } from "@/components/home/HomeActions";
import { WorkspaceActivity } from "@/components/home/WorkspaceActivity";
import { TopBarActions } from "@/components/shell/TopBarActions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ContextPanel, SectionLabel, StatusPill } from "@/components/ui/Canopy";
import { PageIntro } from "@/components/ui/PageIntro";
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
  excerpt?: string | null;
  outcome?: string | null;
  rationale?: string | null;
  reviews?: { approved: number; requested: number } | null;
  decisionVersion?: number | null;
  replyToCommentId?: string | null;
};

type RecentDecision = {
  decisionId: string;
  workspace: { id: string; name: string };
  question: string;
  action: "FINALIZED" | "SUPERSEDED";
  actor: string;
  at: Date | string;
  replacement: { id: string; question: string } | null;
  files?: number;
  outcome?: string | null;
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
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

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

// Review progress in words: "1 of 2 approved", or that nobody was asked yet.
export function reviewProgress(reviews: NeedItem["reviews"]) {
  return reviews ? `${reviews.approved} of ${reviews.requested} approved` : "No reviewers yet";
}

// Card chrome shared by every item: the actor and why, then the content.
const cardClasses = "canopy-lift canopy-rise min-w-0 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:px-[22px]";

function ItemLink({ item, onOpen, className, children }: { item: NeedItem; onOpen: () => void; className: string; children: ReactNode }) {
  return <Link href={needHref(item)} onClick={onOpen} className={`wrap-anywhere underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring ${className}`}>{children}</Link>;
}

function Lead({ actor, children, aside }: { actor: string | null; children: ReactNode; aside?: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[0.8125rem] text-text-muted">
    <UserAvatar name={actor ?? "?"} className="size-[26px] text-[10px]" />
    <p className="min-w-0 flex-1 basis-56">{children}</p>
    {aside}
  </div>;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-subtle px-3.5 py-3">
    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</p>
    <p className="mt-1.5 wrap-anywhere text-[0.8125rem] leading-relaxed text-text-secondary">{children}</p>
  </div>;
}

// A proposal someone asked the member to review, or one waiting for the
// member to decide: the outcome and reasoning are on the card.
function ProposalCard({ item, now, onOpen }: { item: NeedItem; now: number; onOpen: () => void }) {
  const waited = days(daysSince(item.at, now));
  const review = item.kind === "REVIEW_REQUESTED";
  const urgent = review || now - new Date(item.at).getTime() > URGENT_MS;
  return <article className={cardClasses}>
    <Lead actor={item.actor} aside={<StatusPill tone={urgent ? "attention" : "neutral"}>{review ? "Waiting on you" : "Decision needed"} · {waited}</StatusPill>}>
      <strong className="font-medium text-text-primary">{item.actor ?? "Someone"}</strong>{review ? " asked you to review" : " proposed a decision"} · {item.workspace.name}
    </Lead>
    <h3 className="mt-3 font-serif text-[1.5rem] leading-tight text-text-primary sm:text-[1.625rem]"><ItemLink item={item} onOpen={onOpen} className="">{item.title}</ItemLink></h3>
    {item.outcome || item.rationale ? <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
      {item.outcome ? <Detail label="Outcome">{item.outcome}</Detail> : null}
      {item.rationale ? <Detail label="Why">{item.rationale}</Detail> : null}
    </div> : null}
    <div className="mt-4 flex flex-wrap items-center gap-2.5">
      <span className="text-[0.8125rem] text-text-muted">{reviewProgress(item.reviews)}</span>
      {review && item.decisionId && item.decisionVersion
        ? <ReviewActions workspaceId={item.workspace.id} decisionId={item.decisionId} version={item.decisionVersion} href={needHref(item)} title={item.title} />
        : <ButtonLink href={needHref(item)} onClick={onOpen} variant="primary" size="md" className="ml-auto">{review ? "Review" : "Open decision"}</ButtonLink>}
    </div>
  </article>;
}

// A mention or a reply: the words themselves, so most can be read here.
function ConversationCard({ item, onOpen, onDone, doneDisabled }: { item: NeedItem; onOpen: () => void; onDone: () => void; doneDisabled: boolean }) {
  return <article className={cardClasses}>
    <Lead actor={item.actor} aside={<time dateTime={new Date(item.at).toISOString()} className="text-xs">{timeAgo(item.at)}</time>}>
      <strong className="font-medium text-text-primary">{item.actor ?? "Someone"}</strong>
      {item.kind === "MENTION" ? " mentioned you in " : " replied in "}
      <ItemLink item={item} onOpen={onOpen} className="font-medium text-brand-link">{item.title}</ItemLink>
      {" · "}{item.workspace.name}
    </Lead>
    {item.excerpt ? <blockquote className="mt-3 wrap-anywhere border-l-2 border-callout-line pl-3.5 text-[0.9375rem] leading-relaxed text-text-primary">{item.excerpt}</blockquote> : null}
    {item.discussionId ? <QuickReply discussionId={item.discussionId} parentCommentId={item.replyToCommentId ?? null} actor={item.actor} onReplied={onDone} /> : null}
    <div className={`flex flex-wrap items-center justify-end gap-2 ${item.discussionId ? "mt-1" : "mt-4"}`}>
      {item.notificationId ? <Button variant="ghost" aria-label={`Mark done: ${item.title}`} disabled={doneDisabled} onClick={onDone} icon={<Check size={15} aria-hidden="true" />}>Done</Button> : null}
      <ButtonLink href={needHref(item)} onClick={onOpen} variant="secondary">Open discussion</ButtonLink>
    </div>
  </article>;
}

// The member's own open proposal: one line, how long it has waited.
function OwnProposalRow({ item, now }: { item: NeedItem; now: number }) {
  return <article className={`${cardClasses} flex flex-wrap items-center gap-3.5 !py-4`}>
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-status-proposal text-on-status-proposal"><Clock3 size={17} /></span>
    <span className="min-w-0 flex-[1_1_16rem]">
      <ItemLink item={item} onOpen={() => {}} className="block text-[0.9375rem] font-medium text-text-primary">{item.title}</ItemLink>
      <span className="mt-0.5 block text-[0.8125rem] text-text-muted">Your proposal · open for {days(daysSince(item.at, now))} · {item.reviews ? reviewProgress(item.reviews) : "no reviewers yet"} · {item.workspace.name}</span>
    </span>
    <ButtonLink href={needHref(item)} variant="secondary">Open</ButtonLink>
  </article>;
}

function NeedsYou({ now }: { now: number }) {
  const [showAll, setShowAll] = useState(false);
  const needs = useNeedsYou(showAll);
  const { dismiss, dismissAll } = useDismissNeeds();
  const items: NeedItem[] = needs.data?.items ?? [];
  const total = needs.data?.total ?? 0;
  const dismissable = items.some((item) => item.notificationId);
  const done = (item: NeedItem) => { if (item.notificationId) dismiss.mutate({ notificationIds: [item.notificationId] }); };

  return <section aria-labelledby="needs-you-heading" className="min-w-0 pt-6">
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
      <SectionLabel id="needs-you-heading">Needs you{needs.data ? ` · ${total}` : ""}</SectionLabel>
      {dismissable ? <Button variant="ghost" size="sm" disabled={dismissAll.isPending} onClick={() => dismissAll.mutate()}>{dismissAll.isPending ? "Marking..." : "Mark all done"}</Button> : null}
    </div>

    {needs.isLoading ? <div role="status" aria-label="Loading what needs you" className="space-y-3.5">
      {[1, 2].map((row) => <span key={row} aria-hidden="true" className="block h-36 animate-pulse rounded-2xl bg-surface-active" />)}
    </div> : null}
    {needs.error ? <ErrorState title="Could not load what needs you" description="Please try again in a moment." onRetry={() => void needs.refetch()} retrying={needs.isFetching} /> : null}
    {needs.data && !items.length ? <div className="rounded-2xl border border-dashed border-border px-5 py-6">
      <p className="font-serif text-[1.375rem] text-text-primary">You&apos;re all caught up</p>
      <p className="mt-1 text-[0.8125rem] text-text-secondary">Mentions, replies to your discussions and proposals waiting for a decision will appear here.</p>
    </div> : null}

    {items.length ? <ul aria-label="Needs you" className="canopy-stagger flex flex-col gap-3.5">
      {items.map((item) => <li key={item.id} className="min-w-0">
        {item.kind === "REVIEW_REQUESTED" || item.kind === "PROPOSAL_WAITING"
          ? <ProposalCard item={item} now={now} onOpen={() => done(item)} />
          : item.kind === "OWN_PROPOSAL"
            ? <OwnProposalRow item={item} now={now} />
            : <ConversationCard item={item} onOpen={() => done(item)} onDone={() => done(item)} doneDisabled={dismiss.isPending} />}
      </li>)}
    </ul> : null}
    {needs.data && total > items.length ? <Button variant="ghost" className="mt-3" onClick={() => setShowAll(true)}>Show all {total}</Button> : null}
  </section>;
}

// "Pick up where you left off": places opened from the palette, kept in this
// browser. Home renders only in the browser, after sign-in, so storage can be
// read while the component starts.
function kindOf(href: string) {
  if (/\/discussions\/[^/]+/.test(href)) return "Discussion";
  if (/\/decisions\/[^/]+/.test(href)) return "Decision";
  return "Page";
}

function PickUp() {
  const [recent] = useState<RecentEntry[]>(() => {
    try { return typeof window === "undefined" ? [] : readRecent(window.localStorage); } catch { return []; }
  });
  if (!recent.length) return null;
  return <section aria-labelledby="pick-up-heading" className="min-w-0 pt-8">
    <SectionLabel id="pick-up-heading" className="mb-3.5">Pick up where you left off</SectionLabel>
    <ul className="canopy-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {recent.slice(0, 6).map((entry) => <li key={entry.href} className="min-w-0">
        <Link href={entry.href} className="canopy-lift block h-full rounded-[14px] border border-border-subtle bg-surface p-4 focus-visible:outline-2 focus-visible:outline-focus-ring">
          <span className="block text-xs text-text-muted">{kindOf(entry.href)}{entry.hint ? ` · ${entry.hint}` : ""}</span>
          <span className="mt-2 block wrap-anywhere font-medium leading-snug text-text-primary">{entry.label}</span>
        </Link>
      </li>)}
    </ul>
  </section>;
}

const weekday = (value: Date | string) => new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date(value));

function dayName(value: Date | string, now: number) {
  const age = daysSince(value, now);
  return age === 0 ? "Today" : age === 1 ? "Yesterday" : weekday(value);
}

// The right rail's timeline: what was decided or replaced this week.
function ThisWeek({ now }: { now: number }) {
  const recent = useRecentDecisions();
  const decisions: RecentDecision[] = recent.data?.decisions ?? [];
  return <section aria-labelledby="decided-heading" className="min-w-0">
    <SectionLabel id="decided-heading" className="mb-3.5">Decided this week</SectionLabel>
    {recent.isLoading ? <div role="status" aria-label="Loading decisions" className="space-y-3">{[1, 2].map((row) => <span key={row} aria-hidden="true" className="block h-12 animate-pulse rounded-[10px] bg-surface-active" />)}</div> : null}
    {recent.error ? <ErrorState title="Could not load decisions" onRetry={() => void recent.refetch()} retrying={recent.isFetching} /> : null}
    {recent.data && !decisions.length ? <p className="leading-6 text-text-secondary">No decisions this week. Finalized and replaced decisions from all your workspaces appear here.</p> : null}
    {decisions.length ? <ol aria-label="Decided this week" className="ml-1 flex flex-col gap-[18px] border-l border-border-subtle pl-4">
      {decisions.map((decision) => {
        const replaced = decision.action === "SUPERSEDED";
        const href = `/workspace/${decision.workspace.id}/decisions/${decision.decisionId}`;
        return <li key={decision.decisionId} className="relative min-w-0">
          <span aria-hidden="true" className={`absolute -left-[21px] top-1 size-[9px] rounded-full ring-[3px] ring-canvas ${replaced ? "bg-on-status-replaced" : "bg-live"}`} />
          <p className="text-xs text-text-muted"><time dateTime={new Date(decision.at).toISOString()}>{dayName(decision.at, now)}</time> · {replaced ? "Replaced" : "Decided"} · {decision.workspace.name}</p>
          {replaced
            ? <p className="mt-1 wrap-anywhere text-text-secondary">
              <Link href={href} className="line-through decoration-text-muted hover:text-text-primary">{decision.question}</Link>
              {decision.replacement ? <> → <Link href={`/workspace/${decision.workspace.id}/decisions/${decision.replacement.id}`} className="font-medium text-brand-link hover:underline">{decision.replacement.question}</Link></> : null}
            </p>
            : <Link href={href} className="mt-1 block wrap-anywhere font-medium text-text-primary hover:underline">{decision.question}</Link>}
          {!replaced && decision.outcome ? <p className="mt-1 wrap-anywhere italic text-text-muted">&ldquo;{decision.outcome}&rdquo;</p> : null}
          <p className="mt-1 text-xs text-text-muted">{replaced ? "Replaced" : "Finalized"} by {decision.actor}{decision.files ? <> · <FileCount count={decision.files} /></> : null}</p>
        </li>;
      })}
    </ol> : null}
  </section>;
}

// First run (FR-14): a member with no workspace creates one or shares their
// username so a teammate can add them. Home switches to the full layout as
// soon as the pulse lists a workspace.
function FirstRun({ username }: { username: string }) {
  const openCreate = useUiStore((state) => state.setCreateWorkspaceOpen);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyUsername = async () => {
    try { await navigator.clipboard.writeText(username); setCopy("copied"); } catch { setCopy("failed"); }
  };
  const step = "canopy-rise grid min-w-0 gap-4 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:p-6";
  const number = "grid size-9 place-items-center rounded-full bg-status-decided font-mono text-sm text-on-status-decided";
  return <section aria-labelledby="first-run-heading" className="max-w-3xl pt-6">
    <SectionLabel as="p">Getting started</SectionLabel>
    <h2 id="first-run-heading" className="mt-2 font-serif text-[1.875rem] leading-tight text-text-primary">Start with a workspace</h2>
    <p className="mt-2 max-w-[60ch] text-[0.875rem] leading-6 text-text-secondary">A workspace holds your team&apos;s discussions and the decisions they lead to. Once you&apos;re in one, this page shows what needs you, what was decided and how each workspace is doing.</p>
    <ol className="canopy-stagger mt-6 flex flex-col gap-3.5">
      <li className={step}>
        <span aria-hidden="true" className={number}>1</span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-primary">Create one for your team</h3>
          <p className="mt-1 text-[0.875rem] leading-6 text-text-secondary">Name it after the team or project. You can add people by their username straight after.</p>
          <Button variant="primary" className="mt-4" onClick={() => openCreate(true)} icon={<Plus size={16} aria-hidden="true" />}>Create a workspace</Button>
        </div>
      </li>
      <li className={step}>
        <span aria-hidden="true" className={number}>2</span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-primary">Or join your team&apos;s workspace</h3>
          <p className="mt-1 text-[0.875rem] leading-6 text-text-secondary">Ask a teammate who already uses Commons to add you from their workspace&apos;s Members page, or to send you an invite link. To be added by name, they&apos;ll need your username:</p>
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 wrap-anywhere rounded-[9px] border border-border-subtle bg-surface-subtle px-3 py-2 font-mono text-sm text-text-primary">{username}</code>
            <Button variant="secondary" onClick={() => void copyUsername()} icon={copy === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}>Copy username</Button>
            <span role="status" className="text-xs text-text-muted">{copy === "copied" ? "Copied" : copy === "failed" ? "Could not copy. Select the username instead." : ""}</span>
          </div>
        </div>
      </li>
    </ol>
  </section>;
}

// Home v2 (dashboard redesign PRD): a briefing. What needs you comes first,
// with enough on each card to act; the rail shows the week and each workspace.
export function HomePage() {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const firstName = (user?.name?.trim() || user?.username || "").split(/\s+/)[0];
  const openCreate = useUiStore((state) => state.setCreateWorkspaceOpen);
  const pulse = useWorkspacePulse();
  const needs = useNeedsYou(false);
  const recent = useRecentDecisions();
  const firstRun = Boolean(pulse.data && !pulse.data.workspaces.length);
  const date = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" }).format(now);
  const needCount = needs.data?.total;
  const decidedCount = recent.data?.decisions.length;
  const workspaceCount = pulse.data?.workspaces.length;

  const meta = <>
    {needCount !== undefined ? <span className={needCount ? "inline-flex items-center gap-1.5 font-medium text-attention-text" : ""}>
      {needCount ? <span aria-hidden="true" className="size-[7px] rounded-full bg-attention" /> : null}
      {needCount ? `${plural(needCount, "thing")} need${needCount === 1 ? "s" : ""} you` : "Nothing needs you"}
    </span> : null}
    {decidedCount !== undefined ? <><span aria-hidden="true">·</span><span>{plural(decidedCount, "decision")} this week</span></> : null}
    {workspaceCount !== undefined ? <><span aria-hidden="true">·</span><span>{plural(workspaceCount, "workspace")}</span></> : null}
  </>;

  return <div className="min-w-0">
    {firstRun ? null : <TopBarActions>
      <Button variant="secondary" onClick={() => openCreate(true)} icon={<Plus size={15} aria-hidden="true" />}>New workspace</Button>
    </TopBarActions>}
    <div className="flex min-w-0 flex-col gap-8 min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:gap-0">
      <div className="min-w-0 flex-1 min-[1100px]:pr-10">
        <PageIntro
          eyebrow={<span suppressHydrationWarning>Your briefing · {date}</span>}
          title={<span suppressHydrationWarning>{greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}</span>}
          meta={firstRun ? undefined : meta}
        />
        {firstRun ? <FirstRun username={user?.username ?? ""} /> : <>
          <NeedsYou now={now.getTime()} />
          <PickUp />
        </>}
      </div>
      {firstRun ? null : <ContextPanel label="This week" className="canopy-rise min-[1100px]:min-h-[calc(100dvh-9rem)] min-[1100px]:w-[21rem]">
        <ThisWeek now={now.getTime()} />
        <section aria-labelledby="workspace-activity-heading" className="min-w-0">
          <SectionLabel id="workspace-activity-heading" className="mb-2.5">Workspaces · last 7 days</SectionLabel>
          <WorkspaceActivity />
        </section>
      </ContextPanel>}
    </div>
  </div>;
}
