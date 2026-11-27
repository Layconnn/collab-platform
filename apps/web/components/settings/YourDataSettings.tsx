"use client";

import { Download, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import { SettingsHeader } from "@/components/settings/SettingsFrame";
import { Button } from "@/components/ui/Button";
import { useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc/api-client";

// Your data (settings PRD, FR-17 and FR-18): download everything as JSON, and
// close the account with a 30-day grace period.

const field = "mt-1.5 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary !outline-none";
const card = "rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6";
const notice = "rounded-[10px] border-l-2 px-3 py-2 text-sm";

function DownloadData() {
  const exportData = trpc.security.exportData.useMutation();
  const [done, setDone] = useState(false);
  const download = () => {
    setDone(false);
    exportData.mutate(undefined, {
      onSuccess: (data) => {
        const date = data.exportedAt.slice(0, 10);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const link = Object.assign(document.createElement("a"), { href: url, download: `commons-${data.profile.username}-${date}.json` });
        link.click();
        URL.revokeObjectURL(url);
        setDone(true);
      },
    });
  };
  const problem = exportData.error
    ? exportData.error.data?.code === "TOO_MANY_REQUESTS" ? "You can download your data once an hour. Try again later." : "Could not prepare your data. Try again."
    : null;
  return <section aria-labelledby="download-title" className={`mt-7 ${card}`}>
    <h2 id="download-title" className="m-0 text-base font-semibold text-text-primary">Download your data</h2>
    <p className="m-0 mt-1.5 max-w-[60ch] text-sm text-text-secondary">One JSON file with your profile, the workspaces you’re in, your discussions, replies and decisions, reactions, saved items and settings. Once an hour.</p>
    <div className="mt-4"><Button variant="secondary" icon={<Download size={15} aria-hidden="true" />} disabled={exportData.isPending} onClick={download}>{exportData.isPending ? "Preparing..." : "Download your data"}</Button></div>
    {problem ? <p role="alert" className={`mt-4 ${notice} border-danger bg-surface-subtle text-danger`}>{problem}</p> : null}
    {done ? <p role="status" className={`mt-4 ${notice} border-success bg-callout text-text-primary`}>Your data was downloaded.</p> : null}
  </section>;
}

function CloseAccount() {
  const ids = { password: useId(), code: useId(), problem: useId() };
  const twoStep = trpc.security.twoStep.useQuery();
  const workspaces = useWorkspaceSwitcherList();
  const close = trpc.security.closeAccount.useMutation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const owned = (workspaces.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => item.role === "OWNER");
  const needsCode = Boolean(twoStep.data?.enabled);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (close.isPending) return;
    if (!password) return setProblem("Enter your password.");
    if (needsCode && code.trim().length < 6) return setProblem("Enter a code from your authenticator app or a recovery code.");
    setProblem(null);
    close.mutate({ password, ...(needsCode ? { code: code.trim() } : {}) }, {
      onSuccess: () => { sessionStorage.removeItem("csrf_token"); window.location.assign("/login?closed=1"); },
      onError: () => setCode(""),
    });
  };
  const shown = problem ?? (close.error
    ? close.error.data?.code === "TOO_MANY_REQUESTS" ? "Too many attempts. Wait a few minutes and try again."
      : close.error.data?.code === "FORBIDDEN" || close.error.data?.code === "CONFLICT" || close.error.data?.code === "BAD_REQUEST" ? close.error.message
        : "Could not close your account. Try again."
    : null);

  return <section aria-labelledby="close-title" className={`mt-4 ${card}`}>
    <h2 id="close-title" className="m-0 text-base font-semibold text-text-primary">Close your account</h2>
    <p className="m-0 mt-1.5 max-w-[60ch] text-sm text-text-secondary">You’re signed out everywhere. For 30 days, signing in again reopens your account. After that it’s erased: your profile, photo, settings and security log are deleted, and your discussions, replies and decisions stay in their workspaces as “Former member”.</p>
    {owned.length ? <div className={`mt-4 flex gap-2.5 ${notice} border-attention bg-surface-subtle text-text-primary`}>
      <TriangleAlert size={16} className="mt-0.5 shrink-0 text-attention" aria-hidden="true" />
      <p className="m-0">You own {owned.map((item, index) => <span key={item.workspaceId}>{index ? ", " : ""}<Link href={`/workspace/${item.workspaceId}/members`} className="font-medium text-brand-link underline underline-offset-2">{item.name}</Link></span>)}. Transfer ownership {owned.length === 1 ? "of it" : "of each"} before closing your account.</p>
    </div> : null}
    {!open ? <div className="mt-4"><Button variant="secondary" disabled={owned.length > 0} onClick={() => setOpen(true)}>Close your account…</Button></div>
      : <form onSubmit={submit} noValidate aria-label="Close your account" className="mt-4 space-y-4 border-t border-border-subtle pt-4">
        <div className={`grid gap-4 ${needsCode ? "sm:grid-cols-2" : ""}`}>
          <div className="min-w-0">
            <label htmlFor={ids.password} className="text-sm font-medium text-text-primary">Password</label>
            <input id={ids.password} type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setProblem(null); }} className={field} aria-describedby={shown ? ids.problem : undefined} />
          </div>
          {needsCode ? <div className="min-w-0">
            <label htmlFor={ids.code} className="text-sm font-medium text-text-primary">Code from your app or a recovery code</label>
            <input id={ids.code} value={code} onChange={(event) => { setCode(event.target.value); setProblem(null); }} autoComplete="one-time-code" autoCapitalize="off" spellCheck={false} maxLength={24} placeholder="123456"
              className={`${field} font-mono tracking-[0.18em]`} aria-describedby={shown ? ids.problem : undefined} />
          </div> : null}
        </div>
        {shown ? <p id={ids.problem} role="alert" className={`${notice} border-danger bg-surface-subtle text-danger`}>{shown}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => { setOpen(false); setProblem(null); close.reset(); }}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={close.isPending || !password}>{close.isPending ? "Closing..." : "Close my account"}</Button>
        </div>
      </form>}
  </section>;
}

export function YourDataSettings() {
  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Your data" intro="Take a copy of everything you’ve put into Commons, or close your account." back={{ href: "/settings/account", label: "Your account" }} />
    <DownloadData />
    <CloseAccount />
  </div>;
}
