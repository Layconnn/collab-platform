import type { ReactNode } from "react";

import { Markdown } from "@/components/common/Markdown";

export function DecisionStatus({ status }: { status: "PROPOSED" | "DECIDED" | "SUPERSEDED" }) {
  const label = status === "DECIDED" ? "Finalized" : status === "PROPOSED" ? "Proposal" : "Superseded";
  return <span className={`inline-flex min-h-7 items-center rounded-sm border px-2.5 text-xs font-semibold ${status === "DECIDED" ? "border-success text-success" : status === "PROPOSED" ? "border-info text-info" : "border-border text-text-muted"}`}>{label}</span>;
}

export function DecisionDate({ value }: { value: Date | string }) {
  const date = new Date(value);
  return <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date)}</time>;
}

export function DecisionSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-t border-border-subtle py-5 sm:py-6">
    <h2 className="text-xs font-semibold uppercase text-brand-link">{title}</h2>
    <div className="mt-2 wrap-anywhere text-[0.96rem] leading-7 text-text-primary sm:text-base">{typeof children === "string" ? <Markdown text={children} /> : children}</div>
  </section>;
}

export function decisionError(error: { data?: { code?: string } | null; message?: string } | null | undefined, fallback: string) {
  if (!error) return null;
  const code = error.data?.code;
  if (code === "CONFLICT") return "This decision changed while you were working. Your draft is still here. Review the latest version before trying again.";
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return "You no longer have permission for this action. Your draft is still here.";
  if (code === "NOT_FOUND") return "This decision or its source discussion is no longer available.";
  if (code === "TOO_MANY_REQUESTS") return "Too many attempts. Please wait a moment and try again.";
  return fallback;
}
