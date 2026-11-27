"use client";

import { Check, Copy, Download, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { encode } from "uqr";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { SettingsHeader } from "@/components/settings/SettingsFrame";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Canopy";
import { trpc } from "@/lib/trpc/api-client";

// Two-step sign-in (settings PRD, FR-11 and FR-12): set up with an
// authenticator app, recovery codes shown once, and turning it off with the
// password and a code.

const field = "mt-1.5 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary !outline-none";
const codeField = `${field} font-mono tracking-[0.18em]`;
const card = "rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6";
const notice = "rounded-[10px] border-l-2 px-3 py-2 text-sm";

const fullDate = (value: Date | string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
const sixDigits = (value: string) => /^\d{6}$/.test(value.replace(/\s/g, ""));

function problemOf(error: { data?: { code?: string } | null; message: string } | null, fallback: string) {
  if (!error) return null;
  if (error.data?.code === "TOO_MANY_REQUESTS") return "Too many attempts. Wait a minute and try again.";
  if (error.data?.code === "FORBIDDEN" || error.data?.code === "BAD_REQUEST") return error.message;
  return fallback;
}

// The otpauth link as a QR code, drawn from the module grid. Always dark on
// white so every phone camera reads it, whatever the theme.
export function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 2 });
    let d = "";
    qr.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z`; }));
    return { path: d, size: qr.size };
  }, [value]);
  return <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="size-44 rounded-[10px] bg-white p-1">
    <rect width={size} height={size} fill="#ffffff" />
    <path d={path} fill="#111111" />
  </svg>;
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return <Button size="sm" variant="secondary" icon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    onClick={async () => { if (await copyText(text)) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); } }}>
    {copied ? done : label}
  </Button>;
}

// Shown once, after turning on or getting new codes.
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `Commons recovery codes\nEach code works once, in place of a code from your authenticator app.\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: "commons-recovery-codes.txt" });
    link.click();
    URL.revokeObjectURL(url);
  };
  return <section aria-labelledby="recovery-codes-title" className={`mt-7 ${card}`}>
    <h2 id="recovery-codes-title" className="m-0 text-base font-semibold text-text-primary">Save your recovery codes</h2>
    <p className="m-0 mt-1.5 max-w-[60ch] text-sm text-text-secondary">If you lose your phone, each of these signs you in once instead of a code. Keep them somewhere safe, like a password manager. This is the only time they’re shown.</p>
    <ol aria-label="Recovery codes" className="m-0 mt-5 grid list-none grid-cols-2 gap-x-6 gap-y-2 rounded-[12px] bg-surface-subtle p-4 font-mono text-[0.9375rem] tabular-nums text-text-primary sm:grid-cols-[repeat(2,max-content)]">
      {codes.map((code) => <li key={code}>{code}</li>)}
    </ol>
    <div className="mt-4 flex flex-wrap gap-2">
      <CopyButton text={codes.join("\n")} label="Copy codes" done="Copied" />
      <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden="true" />} onClick={download}>Download</Button>
    </div>
    <label className="mt-5 flex items-center gap-2.5 border-t border-border-subtle pt-4 text-sm text-text-primary">
      <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="size-4 accent-[var(--color-brand-action)] !outline-none" />
      I’ve saved my recovery codes
    </label>
    <div className="mt-4 flex justify-end"><Button variant="primary" disabled={!saved} onClick={onDone}>Done</Button></div>
  </section>;
}

function SetUp({ onCancel, onEnabled }: { onCancel: () => void; onEnabled: (codes: string[]) => void }) {
  const ids = { code: useId(), problem: useId() };
  const begin = trpc.security.beginTwoStep.useMutation();
  const enable = trpc.security.enableTwoStep.useMutation();
  const started = useRef(false);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // A new key each time setup opens; nothing changes until a code confirms it.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin.mutate();
  }, [begin]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (enable.isPending) return;
    if (!sixDigits(code)) return setProblem("Enter the 6-digit code from your app.");
    setProblem(null);
    enable.mutate({ code: code.replace(/\s/g, "") }, { onSuccess: (result) => onEnabled(result.recoveryCodes), onError: () => setCode("") });
  };

  const shown = problem ?? problemOf(enable.error, "Could not turn on two-step sign-in. Try again.");
  if (begin.error) {
    return <div className="mt-7"><ErrorState title="Could not start setup" description={begin.error.data?.code === "TOO_MANY_REQUESTS" ? "Too many attempts. Wait a minute and try again." : "Please try again in a moment."} onRetry={() => begin.mutate()} retrying={begin.isPending} /></div>;
  }
  if (!begin.data) return <div className="mt-7"><LoadingState label="Preparing your setup key…" /></div>;
  const groupedKey = begin.data.secret.match(/.{1,4}/g)!.join(" ");

  return <form onSubmit={submit} noValidate aria-label="Set up two-step sign-in" className={`mt-7 ${card}`}>
    <ol className="m-0 list-none space-y-6 p-0">
      <li className="flex flex-wrap gap-5">
        <QrCode value={begin.data.otpauthUrl} label="QR code to add Commons to your authenticator app" />
        <div className="min-w-0 flex-1 basis-60">
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Step 1</p>
          <h2 className="m-0 mt-1 text-base font-semibold text-text-primary">Scan this with your authenticator app</h2>
          <p className="m-0 mt-1.5 text-sm text-text-secondary">Google Authenticator, Microsoft Authenticator, 1Password, Authy, or any app that shows 6-digit codes.</p>
          <p className="m-0 mt-4 text-sm text-text-secondary">Can’t scan it? Enter this key instead:</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code aria-label="Setup key" className="rounded-[8px] bg-surface-subtle px-2.5 py-1.5 font-mono text-sm tracking-[0.06em] text-text-primary [overflow-wrap:anywhere]">{groupedKey}</code>
            <CopyButton text={begin.data.secret} label="Copy key" done="Copied" />
          </div>
        </div>
      </li>
      <li className="border-t border-border-subtle pt-5">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Step 2</p>
        <label htmlFor={ids.code} className="mt-1 block text-base font-semibold text-text-primary">Enter the 6-digit code it shows</label>
        <input id={ids.code} value={code} onChange={(event) => { setCode(event.target.value); setProblem(null); }} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456"
          className={`${codeField} max-w-[12rem]`} aria-describedby={shown ? ids.problem : undefined} aria-invalid={shown ? true : undefined} />
      </li>
    </ol>
    {shown ? <p id={ids.problem} role="alert" className={`mt-4 ${notice} border-danger bg-surface-subtle text-danger`}>{shown}</p> : null}
    <div className="mt-5 flex justify-end gap-2 border-t border-border-subtle pt-4">
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="primary" disabled={enable.isPending || !code}>{enable.isPending ? "Turning on..." : "Turn on"}</Button>
    </div>
  </form>;
}

function NewCodes({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const ids = { code: useId(), problem: useId() };
  const regenerate = trpc.security.regenerateRecoveryCodes.useMutation();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (regenerate.isPending) return;
    if (!sixDigits(code)) return setProblem("Enter the 6-digit code from your app.");
    setProblem(null);
    regenerate.mutate({ code: code.replace(/\s/g, "") }, { onSuccess: (result) => onCodes(result.recoveryCodes), onError: () => setCode("") });
  };
  const shown = problem ?? problemOf(regenerate.error, "Could not make new codes. Try again.");
  return <form onSubmit={submit} noValidate aria-label="Get new recovery codes" className="mt-4 flex flex-wrap items-end gap-3">
    <div className="min-w-0 basis-48">
      <label htmlFor={ids.code} className="text-sm font-medium text-text-primary">Code from your app</label>
      <input id={ids.code} value={code} onChange={(event) => { setCode(event.target.value); setProblem(null); }} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456"
        className={codeField} aria-describedby={shown ? ids.problem : undefined} aria-invalid={shown ? true : undefined} />
    </div>
    <Button type="submit" variant="secondary" disabled={regenerate.isPending || !code}>{regenerate.isPending ? "Making codes..." : "Get new codes"}</Button>
    {shown ? <p id={ids.problem} role="alert" className={`w-full ${notice} border-danger bg-surface-subtle text-danger`}>{shown}</p> : null}
  </form>;
}

function TurnOff({ onOff }: { onOff: () => void }) {
  const ids = { password: useId(), code: useId(), problem: useId() };
  const disable = trpc.security.disableTwoStep.useMutation();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disable.isPending) return;
    if (code.trim().length < 6) return setProblem("Enter a code from your app or a recovery code.");
    setProblem(null);
    disable.mutate({ password, code: code.trim() }, { onSuccess: onOff, onError: () => setCode("") });
  };
  const shown = problem ?? problemOf(disable.error, "Could not turn off two-step sign-in. Try again.");
  return <form onSubmit={submit} noValidate aria-label="Turn off two-step sign-in" className="mt-4 space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={ids.password} className="text-sm font-medium text-text-primary">Password</label>
        <input id={ids.password} type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setProblem(null); }} className={field} aria-describedby={shown ? ids.problem : undefined} />
      </div>
      <div className="min-w-0">
        <label htmlFor={ids.code} className="text-sm font-medium text-text-primary">Code from your app or a recovery code</label>
        <input id={ids.code} value={code} onChange={(event) => { setCode(event.target.value); setProblem(null); }} autoComplete="one-time-code" autoCapitalize="off" spellCheck={false} maxLength={24} placeholder="123456"
          className={codeField} aria-describedby={shown ? ids.problem : undefined} />
      </div>
    </div>
    {shown ? <p id={ids.problem} role="alert" className={`${notice} border-danger bg-surface-subtle text-danger`}>{shown}</p> : null}
    <div className="flex justify-end"><Button type="submit" variant="danger" disabled={disable.isPending || !password || !code}>{disable.isPending ? "Turning off..." : "Turn off two-step sign-in"}</Button></div>
  </form>;
}

export function TwoStepSettings() {
  const utils = trpc.useUtils();
  const status = trpc.security.twoStep.useQuery();
  const [mode, setMode] = useState<"idle" | "setup" | "codes" | "new-codes" | "turn-off">("idle");
  const [codes, setCodes] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const refresh = () => Promise.all([utils.security.twoStep.invalidate(), utils.security.log.invalidate()]);
  const showCodes = (next: string[], message: string) => { setCodes(next); setMode("codes"); setDone(message); void refresh(); };

  const header = <SettingsHeader title="Two-step sign-in" intro="After your password, Commons asks for a code from an app on your phone. Someone who learns your password still can’t get in." back={{ href: "/settings/security", label: "Security" }} />;
  if (!status.data) {
    return <div className="min-w-0 max-w-[48rem]">{header}<div className="mt-7">{status.error
      ? <ErrorState title="Could not load two-step sign-in" description="Please try again in a moment." onRetry={() => void status.refetch()} retrying={status.isFetching} />
      : <LoadingState label="Loading…" />}</div></div>;
  }
  const data = status.data;

  return <div className="min-w-0 max-w-[48rem]">
    {header}
    {mode === "codes" ? <>
      {done ? <p role="status" className={`mt-7 ${notice} border-success bg-callout text-text-primary`}>{done}</p> : null}
      <RecoveryCodes codes={codes} onDone={() => { setCodes([]); setMode("idle"); setDone(null); }} />
    </> : mode === "setup" ? <SetUp onCancel={() => setMode("idle")} onEnabled={(next) => showCodes(next, "Two-step sign-in is on.")} />
      : data.enabled ? <>
        <section aria-label="Status" className={`mt-7 flex flex-wrap items-center gap-4 ${card}`}>
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-callout text-brand-link"><ShieldCheck size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="m-0 flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-text-primary">Authenticator app <StatusPill tone="decided" className="!py-px text-[11px]">On</StatusPill></p>
            <p className="m-0 mt-0.5 text-[0.8125rem] text-text-muted">Turned on {data.enabledAt ? fullDate(data.enabledAt) : ""}</p>
          </div>
        </section>
        <section aria-labelledby="codes-title" className={`mt-4 ${card}`}>
          <div className="flex flex-wrap items-start gap-4">
            <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-[10px] ${data.recoveryCodesLeft <= 3 ? "bg-attention-soft text-attention" : "bg-callout text-brand-link"}`}><KeyRound size={18} /></span>
            <div className="min-w-0 flex-1">
              <h2 id="codes-title" className="m-0 text-[0.9375rem] font-medium text-text-primary">Recovery codes</h2>
              <p className={`m-0 mt-0.5 text-[0.8125rem] ${data.recoveryCodesLeft <= 3 ? "text-attention" : "text-text-muted"}`}>
                {data.recoveryCodesLeft === 0 ? "None left. Get new codes now." : `${data.recoveryCodesLeft} of 10 left${data.recoveryCodesLeft <= 3 ? ". Get new codes soon." : ""}`}
              </p>
            </div>
            {mode !== "new-codes" ? <Button size="sm" variant="secondary" onClick={() => { setDone(null); setMode("new-codes"); }}>Get new codes</Button> : null}
          </div>
          {mode === "new-codes" ? <NewCodes onCodes={(next) => showCodes(next, "Your old recovery codes no longer work.")} /> : null}
        </section>
        <section aria-labelledby="off-title" className={`mt-4 ${card}`}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="off-title" className="m-0 text-[0.9375rem] font-medium text-text-primary">Turn off two-step sign-in</h2>
              <p className="m-0 mt-0.5 text-[0.8125rem] text-text-muted">Your password alone will sign you in. Your recovery codes stop working.</p>
            </div>
            {mode !== "turn-off" ? <Button size="sm" variant="secondary" onClick={() => { setDone(null); setMode("turn-off"); }}>Turn off</Button> : null}
          </div>
          {mode === "turn-off" ? <TurnOff onOff={() => { setMode("idle"); setDone("Two-step sign-in is off."); void refresh(); }} /> : null}
        </section>
      </> : <section aria-label="Status" className={`mt-7 ${card}`}>
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-subtle text-text-secondary"><Smartphone size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="m-0 flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-text-primary">Authenticator app <StatusPill tone="neutral" className="!py-px text-[11px]">Off</StatusPill></p>
            <p className="m-0 mt-1 max-w-[56ch] text-sm text-text-secondary">You’ll need an authenticator app on your phone. Setting up takes about a minute, and you’ll get ten recovery codes for when your phone isn’t with you.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end border-t border-border-subtle pt-4">
          <Button variant="primary" icon={<ShieldCheck size={15} aria-hidden="true" />} onClick={() => { setDone(null); setMode("setup"); }}>Set up two-step sign-in</Button>
        </div>
      </section>}
    {done && mode !== "codes" ? <p role="status" className={`mt-4 ${notice} border-success bg-callout text-text-primary`}>{done}</p> : null}
  </div>;
}
