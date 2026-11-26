"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Scale } from "lucide-react";

// With no record chosen, the space beside the list explains what it holds.
// On smaller screens the list alone is the page (decisions/layout.tsx).
export default function DecisionsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return <section aria-labelledby="pick-decision-heading" className="canopy-rise grid min-h-[50vh] place-items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
    <div className="max-w-md">
      <span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-xl bg-callout text-brand-link"><Scale size={20} /></span>
      <h2 id="pick-decision-heading" className="mt-5 font-serif text-[1.875rem] leading-tight text-text-primary">Pick a decision</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Each record keeps the question, the outcome, why it was chosen and who reviewed it. Proposals start from a discussion.</p>
      <Link href={`/workspace/${workspaceId}/discussions`} className="mt-4 inline-flex min-h-9 items-center text-sm font-medium text-brand-link hover:underline">Browse discussions →</Link>
    </div>
  </section>;
}
