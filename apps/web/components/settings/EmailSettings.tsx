"use client";

import { Eye, Mail } from "lucide-react";
import { useState } from "react";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { useDigestPreview } from "@/hooks/useDigest";

// Settings → Email (daily digest PRD, FR-12). The preview shows exactly what
// today's digest would contain; the on/off switches arrive with the
// preferences pull request.
export function EmailSettings() {
  const [previewing, setPreviewing] = useState(false);
  const preview = useDigestPreview(previewing);

  return <div className="mx-auto w-full max-w-[52rem] min-w-0 pb-12">
    <p className="text-xs font-semibold uppercase text-brand-link">Settings</p>
    <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight text-text-primary sm:text-[2.1rem]">Email</h1>

    <section aria-labelledby="digest-heading" className="mt-8 border-t border-border-subtle pt-6">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface-active text-brand-link"><Mail size={17} /></span>
        <div className="min-w-0">
          <h2 id="digest-heading" className="text-lg font-semibold text-text-primary">Daily digest</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-text-secondary">Once a day at 06:00 UTC: what needs you, what was decided in the last day and what changed in your workspaces. Nothing is sent on days with nothing to say.</p>
        </div>
      </div>
      <button type="button" onClick={() => (previewing ? void preview.refetch() : setPreviewing(true))} disabled={previewing && preview.isFetching} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
        <Eye size={15} aria-hidden="true" /> {previewing ? "Refresh preview" : "Preview today's digest"}
      </button>
      {previewing && preview.isLoading ? <div className="mt-4"><LoadingState label="Building your digest..." /></div> : null}
      {preview.error ? <div className="mt-4"><ErrorState title="Could not build the preview" onRetry={() => void preview.refetch()} retrying={preview.isFetching} /></div> : null}
      {preview.data ? (preview.data.empty
        ? <p role="status" className="mt-4 rounded-sm border border-border-subtle bg-surface-subtle px-4 py-3 text-sm text-text-secondary">Nothing would be sent today: nothing needs you and nothing changed in your workspaces in the last day.</p>
        : <div className="mt-4">
          <p className="text-sm text-text-secondary"><span className="font-semibold text-text-primary">Subject:</span> {preview.data.subject}</p>
          {/* The email's own HTML, isolated: no scripts, no access to this page. */}
          <iframe title="Preview of today's digest email" sandbox="" srcDoc={preview.data.html} className="mt-3 h-[640px] w-full rounded-md border border-border-subtle bg-white" />
        </div>) : null}
    </section>
  </div>;
}
