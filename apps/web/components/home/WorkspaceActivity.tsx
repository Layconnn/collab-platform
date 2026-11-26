"use client";

import Link from "next/link";

import { timeAgo } from "@/components/activity/RecentActivity";
import { ErrorState } from "@/components/common/StateNotice";
import { useWorkspacePulse } from "@/hooks/useHome";
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

// Seven small bars. They share one scale across all workspaces, so a busy
// workspace looks busier than a quiet one; the last 24 hours is highlighted.
function Bars({ daily, max }: { daily: number[]; max: number }) {
  return <span aria-hidden="true" className="flex h-[18px] shrink-0 items-end gap-0.5">
    {daily.map((events, index) => <span
      key={index}
      title={dayPhrase(daily, index)}
      className={`w-1 rounded-[1px] ${index === daily.length - 1 && events ? "bg-live" : "bg-border"}`}
      style={{ height: events ? `${Math.max(15, Math.round((events / max) * 100))}%` : "2px" }}
    />)}
  </span>;
}

function Row({ card, max }: { card: PulseCard; max: number }) {
  const total = card.daily.reduce((sum, events) => sum + events, 0);
  const quiet = isQuiet(card);
  return <li className="canopy-row relative -mx-2.5 flex min-w-0 items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 focus-within:outline-2 focus-within:outline-focus-ring hover:bg-surface-hover">
    <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-md bg-editorial-cream text-[9px] font-bold text-brand-primary">{workspaceInitials(card.name)}</span>
    <span className="min-w-0 flex-1">
      {/* The link covers the row; its name stays the workspace name. */}
      <Link href={`/workspace/${card.id}`} className="block truncate text-text-primary outline-none after:absolute after:inset-0 after:content-['']">{card.name}</Link>
      <span className="sr-only">
        {quiet ? "Quiet this week." : `${plural(total, "event")} this week. ${dailySummary(card.daily)}.`}
        {card.openProposals ? ` ${plural(card.openProposals, "open proposal")}.` : ""}
        {card.lastActivityAt ? ` Active ${timeAgo(card.lastActivityAt)}.` : " No activity yet."}
      </span>
    </span>
    {quiet
      ? <span aria-hidden="true" className="shrink-0 text-xs text-text-muted">Quiet this week</span>
      : <>
        <Bars daily={card.daily} max={max} />
        <span aria-hidden="true" className="w-9 shrink-0 text-right tabular-nums text-text-muted">{total}</span>
      </>}
  </li>;
}

// Home's right rail (dashboard redesign, Home v2): every workspace in one
// line with its last seven days, most active first.
export function WorkspaceActivity() {
  const pulse = useWorkspacePulse();
  const cards: PulseCard[] = pulse.data?.workspaces ?? [];

  if (pulse.isLoading) {
    return <div role="status" aria-label="Loading workspaces" className="space-y-2">
      {[1, 2, 3].map((item) => <span key={item} aria-hidden="true" className="block h-9 animate-pulse rounded-[10px] bg-surface-active" />)}
    </div>;
  }
  if (pulse.error) {
    return <ErrorState title="Could not load workspaces" description="Your workspaces are temporarily unavailable." onRetry={() => void pulse.refetch()} retrying={pulse.isFetching} />;
  }

  const max = Math.max(1, ...cards.flatMap((card) => card.daily));
  return <ul aria-label="Your workspaces" className="flex flex-col">
    {cards.map((card) => <Row key={card.id} card={card} max={max} />)}
  </ul>;
}
