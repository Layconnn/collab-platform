"use client";

import { useId, useState, type FormEvent } from "react";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { SettingsHeader } from "@/components/settings/SettingsFrame";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc/api-client";

// Changing your email (settings PRD, FR-20): the new address and your
// password, then the 6-digit code sent to the new address.

const field = "mt-1.5 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary !outline-none";
const card = "mt-7 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6";
const notice = "rounded-[10px] border-l-2 px-3 py-2 text-sm";

const clock = (value: string) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));

function problemOf(error: { data?: { code?: string } | null; message: string } | null, fallback: string) {
  if (!error) return null;
  const code = error.data?.code;
  if (code === "TOO_MANY_REQUESTS") return "Too many attempts. Wait a while and try again.";
  if (code === "FORBIDDEN" || code === "CONFLICT" || code === "BAD_REQUEST" || code === "PRECONDITION_FAILED" || code === "SERVICE_UNAVAILABLE") return error.message;
  return fallback;
}

export function EmailChangeSettings() {
  const ids = { email: useId(), password: useId(), code: useId(), problem: useId() };
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const status = trpc.security.emailChange.useQuery();
  const request = trpc.security.requestEmailChange.useMutation({ onSuccess: () => utils.security.emailChange.invalidate() });
  const confirm = trpc.security.confirmEmailChange.useMutation();
  const cancel = trpc.security.cancelEmailChange.useMutation({ onSuccess: () => utils.security.emailChange.invalidate() });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [changed, setChanged] = useState<string | null>(null);

  const header = <SettingsHeader title="Change your email" intro="Where the daily digest and account notices go, and what you sign in with. Only you can see it." back={{ href: "/settings/account", label: "Your account" }} />;
  if (!status.data) {
    return <div className="min-w-0 max-w-[40rem]">{header}<div className="mt-7">{status.error
      ? <ErrorState title="Could not load this page" description="Please try again in a moment." onRetry={() => void status.refetch()} retrying={status.isFetching} />
      : <LoadingState label="Loading…" />}</div></div>;
  }
  const { pending, sending } = status.data;

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (request.isPending) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setProblem("Enter a valid email address.");
    if (!password) return setProblem("Enter your password.");
    setProblem(null); setChanged(null); confirm.reset();
    request.mutate({ email: email.trim(), password }, { onSuccess: () => { setPassword(""); setCode(""); } });
  };
  const verify = (event: FormEvent) => {
    event.preventDefault();
    if (confirm.isPending) return;
    if (!/^\d{6}$/.test(code.trim())) return setProblem("Enter the 6-digit code from the email.");
    setProblem(null);
    confirm.mutate({ code: code.trim() }, {
      onSuccess: async (result) => {
        setChanged(`Your email is now ${result.email}.`); setEmail(""); setCode("");
        await Promise.all([utils.auth.me.invalidate(), utils.security.emailChange.invalidate(), utils.security.log.invalidate()]);
      },
      onError: () => { setCode(""); void utils.security.emailChange.invalidate(); },
    });
  };

  const shown = problem ?? (pending ? problemOf(confirm.error, "Could not check the code. Try again.") : problemOf(request.error, "Could not send the code. Try again."));

  return <div className="min-w-0 max-w-[40rem]">
    {header}
    <p className="m-0 mt-7 text-sm text-text-secondary">Current address: <strong className="font-medium text-text-primary">{user?.email}</strong></p>
    {sending === "allowlist" ? <p className={`mt-4 ${notice} border-attention bg-surface-subtle text-text-primary`}>Until Commons has its own email domain, codes can only be sent to addresses on the test list.</p> : null}
    {sending === "off" ? <p className={`mt-4 ${notice} border-attention bg-surface-subtle text-text-primary`}>Email isn’t set up for Commons yet, so your address can’t be changed for now.</p> : null}

    {pending ? <form onSubmit={verify} noValidate aria-label="Confirm your new email" className={`${card} space-y-4`}>
      <p className="mt-0 text-sm text-text-primary">We sent a 6-digit code to <strong className="font-medium">{pending.email}</strong>. It works until {clock(pending.expiresAt)}.</p>
      <div>
        <label htmlFor={ids.code} className="block text-sm font-medium text-text-primary">Code from the email</label>
        <input id={ids.code} value={code} onChange={(event) => { setCode(event.target.value); setProblem(null); }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456"
          className={`${field} max-w-[12rem] font-mono tracking-[0.18em]`} aria-describedby={shown ? ids.problem : undefined} aria-invalid={shown ? true : undefined} />
      </div>
      {shown ? <p id={ids.problem} role="alert" className={`${notice} border-danger bg-surface-subtle text-danger`}>{shown}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
        <Button variant="ghost" disabled={cancel.isPending} onClick={() => { setProblem(null); confirm.reset(); cancel.mutate(); }}>Use a different address</Button>
        <Button type="submit" variant="primary" disabled={confirm.isPending || !code}>{confirm.isPending ? "Checking..." : "Change email"}</Button>
      </div>
    </form> : <form onSubmit={send} noValidate aria-label="Change your email" className={`${card} space-y-4`}>
      <div>
        <label htmlFor={ids.email} className="text-sm font-medium text-text-primary">New email address</label>
        <input id={ids.email} type="email" autoComplete="email" value={email} disabled={sending === "off"} onChange={(event) => { setEmail(event.target.value); setProblem(null); }} className={field} aria-describedby={shown ? ids.problem : undefined} />
      </div>
      <div>
        <label htmlFor={ids.password} className="text-sm font-medium text-text-primary">Password</label>
        <input id={ids.password} type="password" autoComplete="current-password" value={password} disabled={sending === "off"} onChange={(event) => { setPassword(event.target.value); setProblem(null); }} className={field} aria-describedby={shown ? ids.problem : undefined} />
      </div>
      {shown ? <p id={ids.problem} role="alert" className={`${notice} border-danger bg-surface-subtle text-danger`}>{shown}</p> : null}
      {changed ? <p role="status" className={`${notice} border-success bg-callout text-text-primary`}>{changed} We told your old address.</p> : null}
      <div className="flex justify-end border-t border-border-subtle pt-4">
        <Button type="submit" variant="primary" disabled={request.isPending || sending === "off" || !email || !password}>{request.isPending ? "Sending..." : "Send code"}</Button>
      </div>
    </form>}
  </div>;
}
