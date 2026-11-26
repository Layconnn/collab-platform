"use client";

import Link from "next/link";

import { useUnsubscribeLink } from "@/hooks/useDigest";

// Where "Stop daily digests" links in the email land (daily digest PRD,
// FR-10). Opening the link changes nothing, so link scanners in mail systems
// cannot unsubscribe anyone; the member confirms, and can undo.
export function UnsubscribePage({ token }: { token: string }) {
  const { describe, apply } = useUnsubscribeLink(token);
  const target = describe.data?.scope === "workspace" ? `digests for ${describe.data.workspaceName}` : "daily digests";
  const stopped = apply.isSuccess && !apply.variables?.undo;
  const restored = apply.isSuccess && apply.variables?.undo;
  const button = "min-h-11 rounded-sm px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60";

  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-12">
    <div className="w-full max-w-md rounded-md border border-border bg-surface p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-text-primary">Commons</p>
      {describe.isLoading ? <p className="mt-6 text-sm text-text-secondary" role="status">Checking your link...</p> : null}
      {describe.error ? <>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">This link has expired</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">Unsubscribe links work for 60 days. You can change your email settings after signing in.</p>
        <Link href="/settings/notifications/digest" className="mt-5 inline-flex min-h-11 items-center font-semibold text-brand-link hover:text-brand-link-hover">Email settings</Link>
      </> : null}
      {describe.data && !apply.isSuccess ? <>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">Stop {target}?</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{describe.data.scope === "workspace" ? `Your daily digest will leave out ${describe.data.workspaceName}. Your other workspaces stay in it.` : "You will not get the daily email from Commons any more. Everything stays available in the app."}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" disabled={apply.isPending} onClick={() => apply.mutate({ token, undo: false })} className={`${button} bg-brand-action text-on-brand-action hover:bg-brand-action-hover`}>{apply.isPending ? "Stopping..." : `Stop ${target}`}</button>
          <Link href="/workspace" className={`${button} inline-flex items-center text-text-secondary hover:bg-surface-hover`}>Keep them</Link>
        </div>
      </> : null}
      {stopped ? <div role="status">
        <h1 className="mt-4 text-xl font-semibold text-text-primary">Done</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">You will not get {target} any more.</p>
        <button type="button" disabled={apply.isPending} onClick={() => apply.mutate({ token, undo: true })} className={`${button} mt-5 border border-border text-text-primary hover:bg-surface-hover`}>Undo</button>
      </div> : null}
      {restored ? <div role="status">
        <h1 className="mt-4 text-xl font-semibold text-text-primary">Turned back on</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">You will get {target} again.</p>
      </div> : null}
      {apply.error ? <p role="alert" className="mt-4 text-sm text-danger">That did not work. Try again, or change your email settings after signing in.</p> : null}
    </div>
  </main>;
}
