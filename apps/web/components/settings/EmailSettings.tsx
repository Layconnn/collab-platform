"use client";

import { Eye, Mail } from "lucide-react";
import { useState } from "react";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { useDigestPreferenceActions, useDigestPreferences, useDigestPreview } from "@/hooks/useDigest";

// Settings → Email (daily digest PRD, FR-9 and FR-12): the digest on or off,
// which workspaces it covers, and a preview of exactly what today's would say.
// `embedded`: inside Settings → Notifications → Daily digest, whose header
// already names and explains it (dashboard redesign, #176).
export function EmailSettings({ embedded = false }: { embedded?: boolean }) {
  const [previewing, setPreviewing] = useState(false);
  const preview = useDigestPreview(previewing);
  const preferences = useDigestPreferences();
  const { setEnabled, setWorkspace } = useDigestPreferenceActions();
  // The clicked value shows at once, until the save settles (then the server's).
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [workspaceOverrides, setWorkspaceOverrides] = useState<Record<string, boolean>>({});
  const enabled = enabledOverride ?? preferences.data?.enabled ?? true;
  const toggleEnabled = (next: boolean) => {
    setEnabledOverride(next);
    setEnabled.mutate({ enabled: next }, { onSettled: () => setEnabledOverride(null) });
  };
  const toggleWorkspace = (workspaceId: string, included: boolean) => {
    setWorkspaceOverrides((current) => ({ ...current, [workspaceId]: included }));
    setWorkspace.mutate({ workspaceId, included }, {
      onSettled: () => setWorkspaceOverrides((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== workspaceId))),
    });
  };

  return <div className="w-full min-w-0 pb-12">
    {embedded ? null : <>
      <p className="text-xs font-semibold uppercase text-brand-link">Settings</p>
      <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight text-text-primary sm:text-[2.1rem]">Email</h1>
    </>}

    <section aria-labelledby="digest-heading" aria-label={embedded ? "Daily digest" : undefined} className={embedded ? "mt-7" : "mt-8 border-t border-border-subtle pt-6"}>
      <div className={`flex items-start gap-3 ${embedded ? "sr-only" : ""}`}>
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface-active text-brand-link"><Mail size={17} /></span>
        <div className="min-w-0">
          <h2 id="digest-heading" className="text-lg font-semibold text-text-primary">Daily digest</h2>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-text-secondary">Once a day at the time you choose in Settings: what needs you, what was decided in the last day and what changed in your workspaces. Nothing is sent on days with nothing to say.</p>
        </div>
      </div>
      {preferences.data ? <div className="mt-5 space-y-4">
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-5 shadow-card">
          <input type="checkbox" role="switch" checked={enabled} disabled={setEnabled.isPending} onChange={(event) => toggleEnabled(event.target.checked)} className="size-4 accent-[var(--color-brand-action)]" />
          <span className="text-sm font-semibold text-text-primary">Send me the daily digest</span>
        </label>
        {preferences.data.workspaces.length ? <fieldset disabled={!enabled} className="disabled:opacity-60">
          <legend className="text-sm font-semibold text-text-primary">Include these workspaces</legend>
          <ul className="mt-2 space-y-1">
            {preferences.data.workspaces.map((workspace) => <li key={workspace.id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-surface-hover">
                <input type="checkbox" checked={workspaceOverrides[workspace.id] ?? workspace.included} onChange={(event) => toggleWorkspace(workspace.id, event.target.checked)} className="size-4 accent-[var(--color-brand-action)]" />
                <span className="text-sm text-text-primary">{workspace.name}</span>
              </label>
            </li>)}
          </ul>
        </fieldset> : null}
        {setEnabled.error || setWorkspace.error ? <p role="alert" className="text-sm text-danger">Could not save that change. Try again.</p> : null}
      </div> : preferences.error ? <div className="mt-4"><ErrorState title="Could not load your email settings" onRetry={() => void preferences.refetch()} retrying={preferences.isFetching} /></div> : null}
      <button type="button" onClick={() => (previewing ? void preview.refetch() : setPreviewing(true))} disabled={previewing && preview.isFetching} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
        <Eye size={15} aria-hidden="true" /> {previewing ? "Refresh preview" : "Preview today's digest"}
      </button>
      {previewing && preview.isLoading ? <div className="mt-4"><LoadingState label="Building your digest..." /></div> : null}
      {preview.error ? <div className="mt-4"><ErrorState title="Could not build the preview" onRetry={() => void preview.refetch()} retrying={preview.isFetching} /></div> : null}
      {preview.data ? (preview.data.empty
        ? <p role="status" className="mt-4 rounded-sm border border-border-subtle bg-surface-subtle px-4 py-3 text-sm text-text-secondary">Nothing would be sent today: nothing needs you and nothing changed in your workspaces in the last day.</p>
        : <div className="mt-4">
          {!preview.data.enabled ? <p role="status" className="mb-3 rounded-sm border border-border-subtle bg-surface-subtle px-4 py-3 text-sm text-text-secondary">The daily digest is off, so nothing will be sent. This is what it would say.</p> : null}
          <p className="text-sm text-text-secondary"><span className="font-semibold text-text-primary">Subject:</span> {preview.data.subject}</p>
          {/* The email's own HTML, isolated: no scripts, no access to this page. */}
          <iframe title="Preview of today's digest email" sandbox="" srcDoc={preview.data.html} className="mt-3 h-[640px] w-full rounded-md border border-border-subtle bg-white" />
        </div>) : null}
    </section>
  </div>;
}
