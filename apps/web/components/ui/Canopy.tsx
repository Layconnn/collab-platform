import type { HTMLAttributes, ReactNode } from "react";

// Small Canopy primitives (dashboard redesign PRD, FR-2): status pills, count
// badges, live dots, section labels, keyboard hints, cards and panels.

export type StatusTone = "proposal" | "decided" | "replaced" | "attention" | "neutral";

const pillTones: Record<StatusTone, string> = {
  proposal: "bg-status-proposal text-on-status-proposal",
  decided: "bg-status-decided text-on-status-decided",
  replaced: "bg-status-replaced text-on-status-replaced",
  attention: "bg-attention-soft text-attention-text",
  neutral: "bg-surface-active text-text-secondary",
};

export function StatusPill({ tone, children, className = "" }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${pillTones[tone]} ${className}`}>{children}</span>;
}

// A number that needs attention (coral) or a quiet count. `label` names it for
// screen readers ("3 unread").
export function CountBadge({ count, tone = "attention", label }: { count: number; tone?: "attention" | "quiet"; label: string }) {
  if (count <= 0) return null;
  const shown = count > 99 ? "99+" : String(count);
  return <span aria-label={label} className={tone === "attention" ? "rounded-full bg-attention px-[7px] py-px text-[11px] font-semibold text-on-attention" : "text-xs text-text-muted"}>{shown}</span>;
}

// A slowly pulsing dot for something live (recent activity). Decorative.
export function LiveDot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`canopy-live inline-block size-[7px] shrink-0 rounded-full bg-live ${className}`} />;
}

// The small mono uppercase label above a section.
export function SectionLabel({ as: Tag = "h2", children, className = "", id }: { as?: "h2" | "h3" | "p"; children: ReactNode; className?: string; id?: string }) {
  return <Tag id={id} className={`type-canopy-label m-0 ${className}`}>{children}</Tag>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] border border-border-subtle bg-surface-subtle px-1.5 py-px font-mono text-[11px] text-text-secondary">{children}</kbd>;
}

// A solid surface. `lift` raises it slightly on hover (cards that open something).
export function Card({ lift = false, className = "", children, ...props }: HTMLAttributes<HTMLElement> & { lift?: boolean }) {
  return <section className={`rounded-[14px] border border-border-subtle bg-surface shadow-card ${lift ? "canopy-lift" : ""} ${className}`} {...props}>{children}</section>;
}

// The context panel beside a page's main column. Stacks below it on narrow screens.
export function ContextPanel({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return <aside aria-label={label} className={`flex min-w-0 flex-col gap-7 border-border-subtle text-[0.8125rem] max-[1099px]:border-t max-[1099px]:pt-7 min-[1100px]:w-80 min-[1100px]:shrink-0 min-[1100px]:border-l min-[1100px]:pl-7 ${className}`}>{children}</aside>;
}

// Tables for tabular lists (decisions, members). The frame scrolls sideways on
// its own so the page never does; the classes keep every table alike.
export const tableClasses = {
  table: "w-full border-collapse text-[0.8125rem]",
  th: "px-4 py-2.5 text-left text-xs font-medium text-text-muted",
  row: "canopy-row border-t border-border-subtle hover:bg-surface-subtle",
  td: "px-4 py-3.5 align-top",
};

export function TableFrame({ label, children }: { label: string; children: ReactNode }) {
  return <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-focus-ring">{children}</div>;
}
