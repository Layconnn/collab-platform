"use client";

import { AlertTriangle, Download, KeyRound, LogIn, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone, UserCheck, UserPen, UserPlus, UserX } from "lucide-react";
import { useState } from "react";

import { timeAgo } from "@/components/activity/RecentActivity";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";
import { SettingsGroup, SettingsHeader, SettingsRow } from "@/components/settings/SettingsFrame";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Canopy";
import { trpc } from "@/lib/trpc/api-client";

// Sessions and the security log (settings PRD, FR-8 to FR-10).

const fullDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try { return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code; } catch { return code; }
}

const isPhone = (device: string) => /iPhone|Android|iPad/.test(device);
const notice = "rounded-[10px] border-l-2 px-3 py-2 text-sm";

export function SecurityOverview() {
  const sessions = trpc.security.sessions.useQuery();
  const twoStep = trpc.security.twoStep.useQuery();
  const count = sessions.data?.length;
  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Security" intro="How you sign in, where you're signed in, and what happened to your account." />
    <SettingsGroup label="Sign-in">
      <SettingsRow label="Password" description="Changing it signs out your other devices." href="/settings/account/password" />
      <SettingsRow label="Two-step sign-in" description="A code from an app on your phone after your password." value={twoStep.data ? (twoStep.data.enabled ? "On" : "Off") : "…"} href="/settings/security/two-step" />
    </SettingsGroup>
    <SettingsGroup label="Activity">
      <SettingsRow label="Sessions" description="Where you're signed in. Sign out a lost or old device." value={count === undefined ? "…" : `${count} active`} href="/settings/security/sessions" />
      <SettingsRow label="Security log" description="Sign-ins, failed attempts and changes from the last 90 days." href="/settings/security/log" />
    </SettingsGroup>
  </div>;
}

export function SessionsSettings() {
  const utils = trpc.useUtils();
  const sessions = trpc.security.sessions.useQuery();
  const refresh = () => Promise.all([utils.security.sessions.invalidate(), utils.security.log.invalidate()]);
  const signOut = trpc.security.signOutSession.useMutation({ onSuccess: refresh, onError: refresh });
  const signOutOthers = trpc.security.signOutOthers.useMutation({ onSuccess: refresh });
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const others = sessions.data?.filter((session) => !session.current) ?? [];

  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Sessions" intro="Every device signed in to your account. Signing one out ends it at once; signing in again starts a new session." back={{ href: "/settings/security", label: "Security" }} />
    {sessions.data ? <>
      <ul className="m-0 mt-7 list-none overflow-hidden rounded-2xl border border-border-subtle bg-surface p-0 shadow-card" aria-label="Signed-in sessions">
        {sessions.data.map((session) => {
          const Icon = isPhone(session.device) ? Smartphone : Monitor;
          const place = countryName(session.country);
          return <li key={session.id} className="flex flex-wrap items-center gap-4 border-t border-border-subtle px-5 py-4 first:border-t-0">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-callout text-brand-link"><Icon size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="m-0 flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-text-primary">
                {session.device}
                {session.current ? <StatusPill tone="decided" className="!py-px text-[11px]">This device</StatusPill> : null}
              </p>
              <p className="m-0 mt-0.5 text-[0.8125rem] text-text-muted">
                {[place, session.current ? "Active now" : `Active ${timeAgo(session.lastSeenAt)}`, `Signed in ${fullDate(session.createdAt)}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            {!session.current ? <Button size="sm" variant="secondary" disabled={signOut.isPending}
              onClick={() => { setDone(null); signOut.mutate({ sessionId: session.id }, { onSuccess: () => setDone(`${session.device} was signed out.`) }); }}
              aria-label={`Sign out ${session.device}${place ? ` in ${place}` : ""}`}>Sign out</Button> : null}
          </li>;
        })}
      </ul>
      {others.length ? <div className="mt-5">
        {confirming
          ? <div role="group" aria-label="Confirm signing out other sessions" className="flex flex-wrap items-center gap-3 rounded-2xl border border-attention/40 bg-surface-subtle px-5 py-4">
            <p className="m-0 min-w-0 flex-1 text-sm text-text-primary">Sign out {others.length === 1 ? "the other session" : `all ${others.length} other sessions`}? This device stays signed in.</p>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button size="sm" variant="danger" disabled={signOutOthers.isPending}
              onClick={() => signOutOthers.mutate(undefined, { onSuccess: (result) => { setConfirming(false); setDone(`${result.ended} ${result.ended === 1 ? "session was" : "sessions were"} signed out.`); } })}>
              {signOutOthers.isPending ? "Signing out..." : "Sign out"}
            </Button>
          </div>
          : <Button variant="secondary" icon={<LogOut size={15} aria-hidden="true" />} onClick={() => { setDone(null); setConfirming(true); }}>Sign out all other sessions</Button>}
      </div> : <p className="mt-5 text-sm text-text-muted">This is the only device signed in.</p>}
      {signOut.error ? <p role="alert" className={`mt-4 ${notice} border-danger bg-surface-subtle text-danger`}>{signOut.error.data?.code === "NOT_FOUND" ? "That session had already ended." : "Could not sign that session out. Try again."}</p> : null}
      {signOutOthers.error ? <p role="alert" className={`mt-4 ${notice} border-danger bg-surface-subtle text-danger`}>Could not sign out your other sessions. Try again.</p> : null}
      {done ? <p role="status" className={`mt-4 ${notice} border-success bg-callout text-text-primary`}>{done}</p> : null}
    </> : <div className="mt-7">{sessions.error
      ? <ErrorState title="Could not load your sessions" description="Please try again in a moment." onRetry={() => void sessions.refetch()} retrying={sessions.isFetching} />
      : <LoadingState label="Loading your sessions…" />}</div>}
  </div>;
}

const EVENTS = {
  ACCOUNT_CREATED: { title: "Account created", Icon: UserPlus, warn: false },
  SIGNED_IN: { title: "Signed in", Icon: LogIn, warn: false },
  SIGN_IN_FAILED: { title: "Failed sign-in attempt", Icon: AlertTriangle, warn: true },
  SIGNED_OUT: { title: "Signed out", Icon: LogOut, warn: false },
  SESSION_SIGNED_OUT: { title: "Signed out another session", Icon: LogOut, warn: false },
  OTHER_SESSIONS_SIGNED_OUT: { title: "Signed out all other sessions", Icon: LogOut, warn: false },
  PASSWORD_CHANGED: { title: "Password changed", Icon: KeyRound, warn: false },
  USERNAME_CHANGED: { title: "Username changed", Icon: UserPen, warn: false },
  TWO_STEP_ENABLED: { title: "Two-step sign-in turned on", Icon: ShieldCheck, warn: false },
  TWO_STEP_DISABLED: { title: "Two-step sign-in turned off", Icon: ShieldOff, warn: true },
  RECOVERY_CODES_REGENERATED: { title: "New recovery codes made", Icon: KeyRound, warn: false },
  RECOVERY_CODE_USED: { title: "Signed in with a recovery code", Icon: KeyRound, warn: true },
  DATA_EXPORTED: { title: "Downloaded your data", Icon: Download, warn: false },
  ACCOUNT_CLOSED: { title: "Account closed", Icon: UserX, warn: true },
  ACCOUNT_RESTORED: { title: "Account reopened by signing in", Icon: UserCheck, warn: false },
} as const;

export function SecurityLogSettings() {
  const log = trpc.security.log.useInfiniteQuery({ take: 25 }, { getNextPageParam: (page) => page.nextCursor ?? undefined });
  const items = log.data?.pages.flatMap((page) => page.items) ?? [];
  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Security log" intro="What happened to your account in the last 90 days. A sign-in you don't recognise? Change your password and sign out your other sessions." back={{ href: "/settings/security", label: "Security" }} />
    {log.data ? items.length ? <>
      <ol className="m-0 mt-7 list-none overflow-hidden rounded-2xl border border-border-subtle bg-surface p-0 shadow-card" aria-label="Security events">
        {items.map((event) => {
          const meta = EVENTS[event.kind as keyof typeof EVENTS] ?? { title: event.kind, Icon: LogIn, warn: false };
          return <li key={event.id} className="flex items-start gap-4 border-t border-border-subtle px-5 py-3.5 first:border-t-0">
            <span aria-hidden="true" className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px] ${meta.warn ? "bg-attention-soft text-attention" : "bg-callout text-brand-link"}`}><meta.Icon size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className={`m-0 text-sm font-medium ${meta.warn ? "text-attention" : "text-text-primary"}`}>{meta.title}</p>
              <p className="m-0 mt-0.5 text-[0.8125rem] text-text-muted">
                {[event.device, countryName(event.country)].filter(Boolean).join(" · ")}{event.device || event.country ? " · " : ""}<time dateTime={new Date(event.createdAt).toISOString()}>{fullDate(event.createdAt)}</time>
              </p>
            </div>
          </li>;
        })}
      </ol>
      {log.hasNextPage ? <div className="mt-4"><Button variant="secondary" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>{log.isFetchingNextPage ? "Loading..." : "Show older"}</Button></div> : null}
    </> : <div className="mt-7"><EmptyState title="Nothing yet" description="Sign-ins and changes to your account will appear here." /></div>
      : <div className="mt-7">{log.error
        ? <ErrorState title="Could not load the security log" description="Please try again in a moment." onRetry={() => void log.refetch()} retrying={log.isFetching} />
        : <LoadingState label="Loading the security log…" />}</div>}
  </div>;
}
