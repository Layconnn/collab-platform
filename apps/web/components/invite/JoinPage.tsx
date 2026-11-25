"use client";

import { LoaderCircle, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/useAuth";
import { useInviteLink } from "@/hooks/useInvites";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60";

// Where an invite link lands (invite links PRD, FR-6 to FR-11): who invited
// you to what, then one click to join; signed out, sign in or register and
// come back here.
export function JoinPage({ token }: { token: string }) {
  const router = useRouter();
  const auth = useAuth();
  const { describe, join } = useInviteLink(token, !auth.isLoading);
  const here = `/join/${encodeURIComponent(token)}`;
  const invitation = describe.data;
  const signedIn = Boolean(auth.user);

  const onJoin = () => join.mutate({ token }, { onSuccess: (result) => router.push(`/workspace/${result.workspaceId}`) });
  const roleText = invitation?.role === "ADMIN" ? "an admin" : "a member";

  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-12">
    <div className="w-full max-w-md rounded-md border border-border bg-surface p-6 shadow-sm sm:p-8">
      <p className="text-sm font-semibold text-text-primary">Commons</p>
      {auth.isLoading || describe.isLoading ? <p className="mt-6 flex items-center gap-2 text-sm text-text-secondary" role="status"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> Checking your invitation...</p> : null}

      {describe.error ? <>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">This invite link no longer works</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{describe.error.data?.code === "TOO_MANY_REQUESTS" ? "Too many tries from your network. Wait a minute and open the link again." : "It may have expired, been used up or been revoked. Ask the person who shared it for a new one."}</p>
        <Link href={signedIn ? "/workspace" : "/"} className={`${button} mt-5 border border-border text-text-primary hover:bg-surface-hover`}>{signedIn ? "Go to your workspaces" : "About Commons"}</Link>
      </> : null}

      {invitation ? <>
        <span aria-hidden="true" className="mt-5 grid size-11 place-items-center rounded-sm bg-surface-active text-brand-link"><Users size={20} /></span>
        <h1 className="mt-4 text-xl font-semibold leading-snug text-text-primary">
          {invitation.alreadyMember ? <>You are already in {invitation.workspace.name}</> : <>{invitation.invitedBy ?? "Someone"} invited you to join <span className="wrap-anywhere">{invitation.workspace.name}</span></>}
        </h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {invitation.alreadyMember
            ? "This link does not change your role."
            : signedIn
              ? `You will join as ${roleText}, signed in as ${auth.user?.username}.`
              : `Commons is where the team's discussions and decisions live. You will join as ${roleText}.`}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {invitation.alreadyMember
            ? <Link href={`/workspace/${invitation.workspace.id}`} className={`${button} bg-brand-action text-on-brand-action hover:bg-brand-action-hover`}>Open {invitation.workspace.name}</Link>
            : signedIn
              ? <button type="button" onClick={onJoin} disabled={join.isPending || join.isSuccess} className={`${button} bg-brand-action text-on-brand-action hover:bg-brand-action-hover`}>
                {join.isPending || join.isSuccess ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
                {join.isSuccess ? "Opening..." : join.isPending ? "Joining..." : `Join ${invitation.workspace.name}`}
              </button>
              : <>
                <Link href={`/register?next=${encodeURIComponent(here)}`} className={`${button} bg-brand-action text-on-brand-action hover:bg-brand-action-hover`}>Create account</Link>
                <Link href={`/login?next=${encodeURIComponent(here)}`} className={`${button} border border-border text-text-primary hover:bg-surface-hover`}>Sign in</Link>
              </>}
        </div>
        {join.error ? <p role="alert" className="mt-4 text-sm text-danger">{join.error.data?.code === "NOT_FOUND" ? "This invite link stopped working. Ask the person who shared it for a new one." : "Could not join. Try again."}</p> : null}
      </> : null}
    </div>
  </main>;
}
