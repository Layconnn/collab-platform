"use client";

import { History, House, Monitor, Moon, Pause, Rows3, Rows4, Settings, Sparkles, Star, Sun } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { EmailSettings } from "@/components/settings/EmailSettings";
import { DigestTimeSettings, hourLabel, KINDS } from "@/components/settings/NotificationPreferences";
import { cacheAppearance } from "@/components/settings/PreferencesSync";
import { YourWorkspaces } from "@/components/settings/YourWorkspaces";
import { SettingsGroup, SettingsHeader, SettingsRow } from "@/components/settings/SettingsFrame";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useDigestPreferences } from "@/hooks/useDigest";
import { useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { DENSITY_STORAGE_KEY, MOTION_STORAGE_KEY } from "@/lib/theme";
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
    <SettingsHeader title="Your account" intro="Your details as your teammates see them, the password you sign in with, and your data." />
    <SettingsGroup label="Account information">
      <SettingsRow label="Name" description="Shown on your discussions, replies and decisions." value={user?.name?.trim() || "Not set"} href="/settings/account/profile" />
      <SettingsRow label="Username" description="How teammates add and mention you." value={user ? `@${user.username}` : ""} href="/settings/account/profile" />
      <SettingsRow label="Email" description="Where the daily digest goes. Only you can see it." value={user?.email ?? ""} />
    </SettingsGroup>
    <SettingsGroup label="Security">
      <SettingsRow label="Change your password" description="Your other devices are signed out when it changes." href="/settings/account/password" />
      <SettingsRow label="Sessions and security log" description="Where you're signed in, and what happened to your account." href="/settings/security" />
    </SettingsGroup>
    <SettingsGroup label="Your data">
      <SettingsRow label="Download your data" description="Everything you've put into Commons, as one file." href="/settings/account/data" />
      <SettingsRow label="Close your account" description="Signs you out everywhere; you have 30 days to change your mind." href="/settings/account/data" />
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
  const digest = useDigestPreferences();
  const preferences = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  const levels = trpc.preferences.notificationLevels.useQuery();
  const prefs = preferences.data;
  const time = prefs ? ` · ${hourLabel(prefs.digestHour)} ${prefs.timeZone.replaceAll("_", " ")}` : "";
  const digestValue = digest.data
    ? digest.data.enabled
      ? `On · ${digest.data.workspaces.filter((workspace) => workspace.included).length} of ${digest.data.workspaces.length} workspaces${time}`
      : "Off"
    : digest.error ? "Unavailable" : "…";
  const on = prefs ? KINDS.length - prefs.mutedKinds.length : null;
  const quieter = levels.data?.filter((row) => row.level !== "ALL").length;
  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Notifications" intro="What reaches you in your Inbox, and the email that sums up your day." />
    <SettingsGroup label="In Commons">
      <SettingsRow label="What notifies you" description="Mentions, reviews, replies, new discussions and more." value={on === null ? "…" : on === KINDS.length ? "All on" : `${on} of ${KINDS.length} on`} href="/settings/notifications/kinds" />
      <SettingsRow label="Workspaces" description="Everything, only what involves you, or nothing, per workspace." value={quieter === undefined ? "…" : quieter ? `${quieter} quieter` : "Everything"} href="/settings/notifications/workspaces" />
    </SettingsGroup>
    <SettingsGroup label="Email">
      <SettingsRow label="Daily digest" description="Once a day: what needs you and what changed." value={digestValue} href="/settings/notifications/digest" />
    </SettingsGroup>
  </div>;
}

export function DigestSettings() {
  return <div className="min-w-0 max-w-[52rem]">
    <SettingsHeader title="Daily digest" intro="Once a day at the time you choose: what needs you, what was decided in the last day and what changed in your workspaces. Nothing is sent on days with nothing to say." back={{ href: "/settings/notifications", label: "Notifications" }} />
    <DigestTimeSettings />
    <EmailSettings embedded />
  </div>;
}

const THEMES = [
  { value: "light", label: "Light", description: "Light work surfaces; the sidebar stays forest green.", Icon: Sun },
  { value: "dark", label: "Dark", description: "Dark work surfaces for low light.", Icon: Moon },
  { value: "system", label: "System", description: "Follows your device's setting.", Icon: Monitor },
] as const;

const MOTIONS = [
  { value: "system", label: "Follow your device", description: "Animations play unless your device asks for less motion.", Icon: Sparkles },
  { value: "reduce", label: "Reduce motion", description: "No fades, slides or animated transitions on any device.", Icon: Pause },
] as const;

const DENSITIES = [
  { value: "comfortable", label: "Comfortable", description: "The standard size, with room between rows.", Icon: Rows3 },
  { value: "compact", label: "Compact", description: "Slightly smaller text and tighter spacing, to see more at once.", Icon: Rows4 },
] as const;

type Choice<T extends string> = { value: T; label: string; description: string; Icon: typeof Sun };

// A list of radio rows, as in X's settings (FR-16).
export function ChoiceGroup<T extends string>({ legend, choices, value, onChange }: { legend: string; choices: readonly Choice<T>[]; value: T; onChange: (value: T) => void }) {
  const name = useId();
  return <fieldset className="mt-7">
    <legend className="type-canopy-label m-0 mb-2.5">{legend}</legend>
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
      {choices.map(({ value: option, label, description, Icon }) => <label key={option} className="canopy-row flex cursor-pointer items-center gap-4 border-t border-border-subtle px-5 py-4 first:border-t-0 hover:bg-surface-subtle focus-within:bg-surface-subtle">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-callout text-brand-link"><Icon size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium text-text-primary">{label}</span>
          <span className="mt-0.5 block text-[0.8125rem] text-text-muted">{description}</span>
        </span>
        <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} className="size-4 shrink-0 accent-[var(--color-brand-action)]" />
      </label>)}
    </div>
  </fieldset>;
}

function readCached<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

export function AppearanceSettings() {
  const { mode, setMode } = useTheme();
  const preferences = trpc.preferences.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const utils = trpc.useUtils();
  const save = trpc.preferences.update.useMutation({ onSuccess: (data) => utils.preferences.get.setData(undefined, data) });
  const [motion, setMotion] = useState<"system" | "reduce">(() => readCached(MOTION_STORAGE_KEY, ["system", "reduce"], "system"));
  const [density, setDensity] = useState<"comfortable" | "compact">(() => readCached(DENSITY_STORAGE_KEY, ["comfortable", "compact"], "comfortable"));
  const saved = preferences.data?.saved ? preferences.data : null;
  const shownMotion = (saved?.motion as typeof motion | undefined) ?? motion;
  const shownDensity = (saved?.density as typeof density | undefined) ?? density;

  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Appearance" intro="How Commons looks. Saved to your account, so it follows you to every device you sign in on." />
    <ChoiceGroup legend="Theme" choices={THEMES} value={mode} onChange={(next) => { setMode(next); save.mutate({ theme: next }); }} />
    <ChoiceGroup legend="Motion" choices={MOTIONS} value={shownMotion} onChange={(next) => { setMotion(next); cacheAppearance({ motion: next }); save.mutate({ motion: next }); }} />
    <ChoiceGroup legend="Density" choices={DENSITIES} value={shownDensity} onChange={(next) => { setDensity(next); cacheAppearance({ density: next }); save.mutate({ density: next }); }} />
    {save.error ? <p role="alert" className="mt-4 rounded-[10px] border-l-2 border-danger bg-surface-subtle px-3 py-2 text-sm text-danger">Applied here, but not saved to your account. It will apply on other devices once saved; try again.</p> : null}
  </div>;
}

const START_PAGES = [
  { value: "home", label: "Home", description: "What needs you across every workspace.", Icon: House },
  { value: "default", label: "Your default workspace", description: "The workspace you choose below.", Icon: Star },
  { value: "last", label: "The last workspace you opened", description: "Pick up where you left off.", Icon: History },
] as const;

// Where Commons opens and which workspace is yours by default (FR-15).
export function WorkspacesSettings() {
  const id = useId();
  const preferences = trpc.preferences.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const workspaces = useWorkspaceSwitcherList();
  const utils = trpc.useUtils();
  const save = trpc.preferences.update.useMutation({ onSuccess: (data) => utils.preferences.get.setData(undefined, data) });
  const list = workspaces.data?.pages.flatMap((page) => page.items) ?? [];
  // Show a choice at once while it saves.
  const pending = save.isPending ? save.variables : undefined;
  const data = preferences.data ? { ...preferences.data, ...pending } : undefined;
  const startPage = (data?.startPage ?? "home") as (typeof START_PAGES)[number]["value"];
  const defaultId = data?.defaultWorkspaceId && list.some((item) => item.workspaceId === data.defaultWorkspaceId) ? data.defaultWorkspaceId : "";
  const problem = save.error
    ? save.error.data?.code === "NOT_FOUND" ? "You're no longer a member of that workspace." : "Could not save. Try again."
    : startPage === "default" && !defaultId && data ? "Choose a default workspace, or Commons opens on Home." : null;

  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Workspaces" intro="Where Commons opens when you sign in, your default workspace, and the workspaces you're in." />
    {data ? <>
      <ChoiceGroup legend="Open Commons on" choices={START_PAGES} value={startPage} onChange={(next) => save.mutate({ startPage: next })} />
      <section aria-labelledby={`${id}-title`} className="mt-7">
        <h2 id={`${id}-title`} className="type-canopy-label m-0 mb-2.5">Default workspace</h2>
        <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-card">
          <label htmlFor={id} className="text-sm font-medium text-text-primary">Workspace</label>
          <select id={id} value={defaultId} disabled={workspaces.isLoading} onChange={(event) => save.mutate({ defaultWorkspaceId: event.target.value || null })}
            className="mt-1.5 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary">
            <option value="">No default</option>
            {list.map((item) => <option key={item.workspaceId} value={item.workspaceId}>{item.name}</option>)}
          </select>
          <p className="mt-1.5 text-xs text-text-muted">Opens when you choose “Your default workspace” above.</p>
        </div>
      </section>
      <YourWorkspaces titleId={`${id}-yours`} />
    </> : preferences.error
      ? <div className="mt-7"><ErrorState title="Could not load your settings" description="Please try again in a moment." onRetry={() => void preferences.refetch()} retrying={preferences.isFetching} /></div>
      : <div className="mt-7"><LoadingState label="Loading your settings…" /></div>}
    {problem ? <p role={save.error ? "alert" : "status"} className="mt-4 rounded-[10px] border-l-2 border-attention bg-surface-subtle px-3 py-2 text-sm text-text-primary">{problem}</p> : null}
    {save.isSuccess && !problem ? <p role="status" className="mt-4 text-sm text-text-muted">Saved.</p> : null}
  </div>;
}
