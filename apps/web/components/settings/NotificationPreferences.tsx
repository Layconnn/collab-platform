"use client";

import { useId, useMemo } from "react";

import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { SettingsHeader } from "@/components/settings/SettingsFrame";
import { trpc } from "@/lib/trpc/api-client";

// Notification preferences (settings PRD, FR-4 to FR-6): which kinds of
// notification reach you, how much each workspace may notify you, and when
// the daily digest arrives.

type Kind = "DISCUSSION_CREATED" | "COMMENT_CREATED" | "MENTION" | "REVIEW_REQUESTED" | "REVIEW_RESPONDED" | "INVITE_ACCEPTED";
type Level = "ALL" | "INVOLVED" | "NONE";

export const KINDS: { kind: Kind; label: string; description: string; important?: boolean }[] = [
  { kind: "MENTION", label: "Mentions", description: "When someone @mentions you.", important: true },
  { kind: "REVIEW_REQUESTED", label: "Review requests", description: "When you're asked to review a decision.", important: true },
  { kind: "REVIEW_RESPONDED", label: "Review answers", description: "When a reviewer approves or objects to your proposal." },
  { kind: "COMMENT_CREATED", label: "Replies", description: "Replies in discussions you follow." },
  { kind: "DISCUSSION_CREATED", label: "New discussions", description: "When someone starts a discussion in one of your workspaces." },
  { kind: "INVITE_ACCEPTED", label: "People joining", description: "When someone joins with an invite link you created." },
];

export const LEVELS: { level: Level; label: string }[] = [
  { level: "ALL", label: "Everything" },
  { level: "INVOLVED", label: "Only what involves me" },
  { level: "NONE", label: "Nothing" },
];

const notice = "mt-4 rounded-[10px] border-l-2 px-3 py-2 text-sm";

function usePreferences() {
  const utils = trpc.useUtils();
  const query = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  const save = trpc.preferences.update.useMutation({ onSuccess: (data) => utils.preferences.get.setData(undefined, data) });
  // Show a change at once while it saves.
  const data = query.data ? { ...query.data, ...(save.isPending ? save.variables : undefined) } : undefined;
  return { query, save, data };
}

function Loading({ query }: { query: { error: unknown; isFetching: boolean; refetch: () => unknown } }) {
  return <div className="mt-7">{query.error
    ? <ErrorState title="Could not load your settings" description="Please try again in a moment." onRetry={() => void query.refetch()} retrying={query.isFetching} />
    : <LoadingState label="Loading your settings…" />}</div>;
}

export function NotificationKindsSettings() {
  const { query, save, data } = usePreferences();
  const muted = new Set<string>(data?.mutedKinds ?? []);
  const toggle = (kind: Kind, on: boolean) => {
    const next = on ? [...muted].filter((item) => item !== kind) : [...muted, kind];
    save.mutate({ mutedKinds: next as Kind[] });
  };
  const offImportant = KINDS.filter((item) => item.important && muted.has(item.kind));

  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="What notifies you" intro="Turn each kind of notification on or off, in every workspace. What needs you still shows on Home." back={{ href: "/settings/notifications", label: "Notifications" }} />
    {data ? <>
      <fieldset className="mt-7">
        <legend className="type-canopy-label m-0 mb-2.5">In your Inbox</legend>
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
          {KINDS.map((item) => <ToggleRow key={item.kind} label={item.label} description={item.description} checked={!muted.has(item.kind)} onChange={(on) => toggle(item.kind, on)} />)}
        </div>
      </fieldset>
      {offImportant.length ? <p role="status" className={`${notice} border-attention bg-surface-subtle text-text-primary`}>
        {offImportant.map((item) => item.label).join(" and ")} are off. Teammates use them to get your attention; you’ll only see them on Home.
      </p> : null}
      {save.error ? <p role="alert" className={`${notice} border-danger bg-surface-subtle text-danger`}>Could not save. Try again.</p> : null}
    </> : <Loading query={query} />}
  </div>;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return <label htmlFor={id} className="canopy-row flex cursor-pointer items-center gap-4 border-t border-border-subtle px-5 py-4 first:border-t-0 hover:bg-surface-subtle focus-within:bg-surface-subtle">
    <span className="min-w-0 flex-1">
      <span id={`${id}-label`} className="block text-[0.9375rem] font-medium text-text-primary">{label}</span>
      <span id={`${id}-description`} className="mt-0.5 block text-[0.8125rem] text-text-muted">{description}</span>
    </span>
    <input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`} className="peer sr-only" />
    <span aria-hidden="true" className="relative h-6 w-10 shrink-0 rounded-full bg-control-border transition-colors peer-checked:bg-brand-action peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring motion-reduce:transition-none after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
  </label>;
}

export function WorkspaceLevelsSettings() {
  const utils = trpc.useUtils();
  const levels = trpc.preferences.notificationLevels.useQuery();
  const set = trpc.preferences.setNotificationLevel.useMutation({ onSuccess: () => utils.preferences.notificationLevels.invalidate() });
  const rows = levels.data?.map((row) => set.isPending && set.variables?.workspaceId === row.workspaceId ? { ...row, level: set.variables.level } : row);

  return <div className="min-w-0 max-w-[48rem]">
    <SettingsHeader title="Workspaces" intro="How much each workspace may notify you. “Only what involves me” keeps mentions, reviews, people joining by your link, and replies to you or in discussions you started." back={{ href: "/settings/notifications", label: "Notifications" }} />
    {rows ? rows.length ? <section aria-label="Notification level per workspace" className="mt-7 overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
      {rows.map((row) => <LevelRow key={row.workspaceId} name={row.name} level={row.level as Level} onChange={(level) => set.mutate({ workspaceId: row.workspaceId, level })} />)}
    </section> : <p className="mt-7 text-sm text-text-muted">You’re not in any workspaces yet.</p>
      : <Loading query={levels} />}
    {set.error ? <p role="alert" className={`${notice} border-danger bg-surface-subtle text-danger`}>{set.error.data?.code === "NOT_FOUND" ? "You're no longer a member of that workspace." : "Could not save. Try again."}</p> : null}
    <p className="mt-4 text-xs text-text-muted">A workspace set to Nothing is also left out of your daily digest.</p>
  </div>;
}

function LevelRow({ name, level, onChange }: { name: string; level: Level; onChange: (level: Level) => void }) {
  const id = useId();
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle px-5 py-4 first:border-t-0">
    <label htmlFor={id} className="min-w-0 flex-1 text-[0.9375rem] font-medium text-text-primary">{name}</label>
    <select id={id} value={level} onChange={(event) => onChange(event.target.value as Level)} className="min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary sm:w-60">
      {LEVELS.map((option) => <option key={option.level} value={option.level}>{option.label}</option>)}
    </select>
  </div>;
}

export const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try { zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { zones = []; }
  return [...new Set(["UTC", current, deviceTimeZone(), ...zones])].sort((a, b) => a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b));
}

// When the digest arrives (FR-6), shown on the Daily digest page.
export function DigestTimeSettings() {
  const ids = { hour: useId(), zone: useId() };
  const { query, save, data } = usePreferences();
  const zone = data?.timeZone ?? "UTC";
  const zones = useMemo(() => timeZones(zone), [zone]);
  const device = deviceTimeZone();
  if (!data) return <Loading query={query} />;
  return <section aria-labelledby={`${ids.hour}-title`} className="mt-7">
    <h2 id={`${ids.hour}-title`} className="type-canopy-label m-0 mb-2.5">Delivery time</h2>
    <div className="grid gap-4 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div>
        <label htmlFor={ids.hour} className="text-sm font-medium text-text-primary">Time</label>
        <select id={ids.hour} value={data.digestHour} onChange={(event) => save.mutate({ digestHour: Number(event.target.value) })} className="mt-1.5 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary">
          {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={ids.zone} className="text-sm font-medium text-text-primary">Time zone</label>
        <select id={ids.zone} value={zone} onChange={(event) => save.mutate({ timeZone: event.target.value })} className="mt-1.5 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary">
          {zones.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </select>
        {device !== zone ? <button type="button" onClick={() => save.mutate({ timeZone: device })} className="mt-2 text-xs font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">Use this device’s time zone ({device.replaceAll("_", " ")})</button> : null}
      </div>
    </div>
    <p className="mt-2 text-xs text-text-muted" aria-live="polite">
      {save.error ? "Could not save. Try again." : `Arrives around ${hourLabel(data.digestHour)} ${zone.replaceAll("_", " ")}, on days with something to say.`}
    </p>
  </section>;
}
