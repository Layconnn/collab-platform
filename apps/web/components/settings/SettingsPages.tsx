"use client";

import { Monitor, Moon, Settings, Sun } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { EmailSettings } from "@/components/settings/EmailSettings";
import { SettingsGroup, SettingsHeader, SettingsRow } from "@/components/settings/SettingsFrame";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useDigestPreferences } from "@/hooks/useDigest";
import { trpc } from "@/lib/trpc/api-client";

// The pages inside Settings (dashboard redesign PRD, FR-8). Each category
// lists its settings as grouped rows; a row with a chevron opens a deeper page.

export function SettingsWelcome() {
  return <section aria-labelledby="settings-welcome" className="canopy-rise grid min-h-[50vh] place-items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
    <div className="max-w-md">
      <span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-xl bg-callout text-brand-link"><Settings size={20} /></span>
      <h2 id="settings-welcome" className="mt-5 font-serif text-[1.875rem] leading-tight text-text-primary">Pick a category</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Your account, the daily digest and how Commons looks. Search finds a setting by name.</p>
    </div>
  </section>;
}

export function AccountSettings() {
  const { user } = useAuth();
  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Your account" intro="Your details as your teammates see them, and the password you sign in with." />
    <SettingsGroup label="Account information">
      <SettingsRow label="Name" description="Shown on your discussions, replies and decisions." value={user?.name?.trim() || "Not set"} />
      <SettingsRow label="Username" description="How teammates add and mention you." value={user ? `@${user.username}` : ""} />
      <SettingsRow label="Email" description="Where the daily digest goes. Only you can see it." value={user?.email ?? ""} />
    </SettingsGroup>
    <SettingsGroup label="Security">
      <SettingsRow label="Change your password" description="Your other devices are signed out when it changes." href="/settings/account/password" />
    </SettingsGroup>
  </div>;
}

const field = "mt-1.5 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary";

export function PasswordSettings() {
  const ids = { current: useId(), next: useId(), confirm: useId(), problem: useId() };
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const change = trpc.auth.changePassword.useMutation();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (change.isPending) return;
    if (next.length < 8 || next.length > 128) return setProblem("Use 8 to 128 characters for the new password.");
    if (next !== confirm) return setProblem("The new passwords don't match.");
    if (next === current) return setProblem("Choose a password you don't use now.");
    setProblem(null);
    change.mutate({ currentPassword: current, newPassword: next }, {
      onSuccess: () => { setCurrent(""); setNext(""); setConfirm(""); },
    });
  };

  const serverProblem = change.error
    ? change.error.data?.code === "FORBIDDEN" ? "Your current password isn't right."
      : change.error.data?.code === "TOO_MANY_REQUESTS" ? "Too many attempts. Wait a minute and try again."
        : change.error.data?.code === "BAD_REQUEST" ? "This account doesn't sign in with a password."
          : "Could not change your password. Try again."
    : null;
  const shown = problem ?? serverProblem;

  return <div className="min-w-0 max-w-[40rem]">
    <SettingsHeader title="Change your password" intro="Your other devices are signed out once it changes. This one stays signed in." back={{ href: "/settings/account", label: "Your account" }} />
    <form onSubmit={submit} noValidate className="mt-7 space-y-4 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6">
      <div>
        <label htmlFor={ids.current} className="text-sm font-medium text-text-primary">Current password</label>
        <input id={ids.current} type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required className={field} aria-describedby={shown ? ids.problem : undefined} />
      </div>
      <div>
        <label htmlFor={ids.next} className="text-sm font-medium text-text-primary">New password</label>
        <input id={ids.next} type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required minLength={8} maxLength={128} className={field} aria-describedby={shown ? ids.problem : undefined} />
        <p className="mt-1 text-xs text-text-muted">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor={ids.confirm} className="text-sm font-medium text-text-primary">Confirm new password</label>
        <input id={ids.confirm} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required className={field} aria-describedby={shown ? ids.problem : undefined} />
      </div>
      {shown ? <p id={ids.problem} role="alert" className="rounded-[10px] border-l-2 border-danger bg-surface-subtle px-3 py-2 text-sm text-danger">{shown}</p> : null}
      {change.isSuccess && !shown ? <p role="status" className="rounded-[10px] border-l-2 border-success bg-callout px-3 py-2 text-sm text-text-primary">Password changed. Your other devices were signed out.</p> : null}
      <div className="flex justify-end border-t border-border-subtle pt-4">
        <Button type="submit" variant="primary" disabled={change.isPending || !current || !next || !confirm}>{change.isPending ? "Changing..." : "Change password"}</Button>
      </div>
    </form>
  </div>;
}

export function NotificationSettings() {
  const preferences = useDigestPreferences();
  const value = preferences.data
    ? preferences.data.enabled
      ? `On · ${preferences.data.workspaces.filter((workspace) => workspace.included).length} of ${preferences.data.workspaces.length} workspaces`
      : "Off"
    : preferences.error ? "Unavailable" : "…";
  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Notifications" intro="How Commons reaches you outside the app. Notifications inside Commons appear in your Inbox." />
    <SettingsGroup label="Email">
      <SettingsRow label="Daily digest" description="Once a day: what needs you and what changed." value={value} href="/settings/notifications/digest" />
    </SettingsGroup>
  </div>;
}

export function DigestSettings() {
  return <div className="min-w-0 max-w-[52rem]">
    <SettingsHeader title="Daily digest" intro="Once a day at 06:00 UTC: what needs you, what was decided in the last day and what changed in your workspaces. Nothing is sent on days with nothing to say." back={{ href: "/settings/notifications", label: "Notifications" }} />
    <EmailSettings embedded />
  </div>;
}

const THEMES = [
  { value: "light", label: "Light", description: "Light work surfaces; the sidebar stays forest green.", Icon: Sun },
  { value: "dark", label: "Dark", description: "Dark work surfaces for low light.", Icon: Moon },
  { value: "system", label: "System", description: "Follows your device's setting.", Icon: Monitor },
] as const;

export function AppearanceSettings() {
  const { mode, setMode } = useTheme();
  const name = useId();
  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Appearance" intro="How Commons looks on this device." />
    <fieldset className="mt-7">
      <legend className="type-canopy-label m-0 mb-2.5">Theme</legend>
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
        {THEMES.map(({ value, label, description, Icon }) => <label key={value} className="canopy-row flex cursor-pointer items-center gap-4 border-t border-border-subtle px-5 py-4 first:border-t-0 hover:bg-surface-subtle focus-within:bg-surface-subtle">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-callout text-brand-link"><Icon size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-medium text-text-primary">{label}</span>
            <span className="mt-0.5 block text-[0.8125rem] text-text-muted">{description}</span>
          </span>
          <input type="radio" name={name} value={value} checked={mode === value} onChange={() => setMode(value)} className="size-4 shrink-0 accent-[var(--color-brand-action)]" />
        </label>)}
      </div>
    </fieldset>
  </div>;
}
