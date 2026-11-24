"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";

import { timeAgo } from "@/components/activity/RecentActivity";
import { ErrorState } from "@/components/common/StateNotice";
import { useWorkspacePulse } from "@/hooks/useHome";
import { useUiStore } from "@/stores/ui.store";
import { workspaceInitials } from "@/lib/workspace-identity";

export type PulseCard = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  lastActivityAt: Date | string | null;
  decisionsFinalized: number;
  discussionsStarted: number;
  replies: number;
  activePeople: number;
  openProposals: number;
  daily: number[];
};

const ROLE_LABEL: Record<PulseCard["role"], string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function isQuiet(card: PulseCard) {
  return card.daily.every((events) => events === 0);
}

const dayLabel = (ago: number) => ago === 0 ? "Last 24 hours" : ago === 1 ? "1 day ago" : `${ago} days ago`;
const dayPhrase = (daily: number[], index: number) => `${dayLabel(daily.length - 1 - index)}: ${plural(daily[index]!, "event")}`;

// The text equivalent of the chart (NFR-3): one phrase per day, oldest first.
export function dailySummary(daily: number[]) {
  return daily.map((_, index) => dayPhrase(daily, index)).join("; ");
}

// Bars share one scale across all cards, so a busy workspace looks busier
// than a quiet one instead of every card filling its own chart.
function DailyChart({ daily, max }: { daily: number[]; max: number }) {
  return <figure className="mt-4">
    <div aria-hidden="true" className="flex h-10 items-end gap-0.5">
      {daily.map((events, index) => <span
        key={index}
        title={dayPhrase(daily, index)}
        className={events ? "flex-1 rounded-t-[4px] bg-brand-link" : "h-0.5 flex-1 rounded-full bg-border"}
        style={events ? { height: `${Math.max(12, Math.round((events / max) * 100))}%` } : undefined}
      />)}
    </div>
    <figcaption className="sr-only">Activity per day over the last seven days. {dailySummary(daily)}.</figcaption>
  </figure>;
}

function Figures({ card }: { card: PulseCard }) {
  const figures: Array<[string, number]> = [
    ["Decided", card.decisionsFinalized],
    ["Open proposals", card.openProposals],
    ["Discussions", card.discussionsStarted],
    ["Replies", card.replies],
    ["People", card.activePeople],
  ];
  return <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
    {figures.map(([label, value]) => <div key={label}>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-text-primary">{value}</dd>
    </div>)}
  </dl>;
}

function Card({ card, max }: { card: PulseCard; max: number }) {
  const quiet = isQuiet(card);
  return <li className="relative min-w-0 rounded-md border border-border-subtle bg-surface p-4 transition-colors focus-within:outline-2 focus-within:outline-focus-ring hover:border-border hover:bg-surface-hover motion-reduce:transition-none sm:p-5">
    <div className="flex min-w-0 items-start gap-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-sm bg-brand-100 text-xs font-semibold text-brand-800">{workspaceInitials(card.name)}</span>
      <div className="min-w-0 flex-1">
        <h3 className="min-w-0">
          {/* The link covers the whole card; its name stays the workspace name. */}
          <Link href={`/workspace/${card.id}`} className="wrap-anywhere text-base font-semibold text-text-primary outline-none after:absolute after:inset-0 after:content-['']">{card.name}</Link>
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">
          {card.lastActivityAt ? <>Active <time dateTime={new Date(card.lastActivityAt).toISOString()}>{timeAgo(card.lastActivityAt)}</time></> : "No activity yet"}
        </p>
      </div>
      <span className="shrink-0 rounded-sm bg-surface-active px-2 py-0.5 text-xs font-medium text-text-secondary">{ROLE_LABEL[card.role]}</span>
    </div>
    {quiet
      ? <p className="mt-4 text-sm text-text-secondary">Quiet this week{card.openProposals ? ` · ${plural(card.openProposals, "open proposal")}` : ""}</p>
      : <><Figures card={card} /><DailyChart daily={card.daily} max={max} /></>}
  </li>;
}

export function WorkspaceCards() {
  const pulse = useWorkspacePulse();
  const openCreate = useUiStore((state) => state.setCreateWorkspaceOpen);
  const cards: PulseCard[] = pulse.data?.workspaces ?? [];

  if (pulse.isLoading) {
    return <div role="status" aria-label="Loading workspaces" className="grid gap-3 md:grid-cols-2">
      {[1, 2].map((item) => <span key={item} aria-hidden="true" className="block h-40 animate-pulse rounded-md bg-surface-active" />)}
    </div>;
  }
  if (pulse.error) {
    return <ErrorState title="Could not load workspaces" description="Your workspaces are temporarily unavailable." onRetry={() => void pulse.refetch()} retrying={pulse.isFetching} />;
  }
  if (!cards.length) {
    return <div className="rounded-md border border-border-subtle bg-surface-subtle px-5 py-8 sm:px-7">
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-sm bg-surface-active text-brand-link"><Building2 size={21} /></span>
      <h3 className="mt-5 text-lg font-semibold text-text-primary">Your first workspace starts here.</h3>
      <p className="mt-2 max-w-[48ch] text-sm leading-6 text-text-secondary">Give your project a shared place for discussions, decisions and the people who make them.</p>
      <button type="button" onClick={() => openCreate(true)} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-link hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Create a workspace</button>
    </div>;
  }

  const max = Math.max(1, ...cards.flatMap((card) => card.daily));
  return <div>
    <p className="mb-3 text-xs font-medium text-text-muted">{plural(cards.length, "workspace")} · most active first</p>
    <ul aria-label="Your workspaces" className="grid gap-3 md:grid-cols-2">
      {cards.map((card) => <Card key={card.id} card={card} max={max} />)}
    </ul>
  </div>;
}
