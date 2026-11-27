"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";

import { SettingsHeader } from "@/components/settings/SettingsFrame";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc/api-client";

// Profile (settings PRD, FR-1 and FR-2): the name teammates see and the
// username they mention you by. Availability is checked as you type.

const COOLDOWN_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const field = "mt-2 min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary";
const card = "mt-7 space-y-4 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6";
const longDate = (value: Date) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(value);

function Notice({ tone, id, children }: { tone: "problem" | "done"; id?: string; children: string }) {
  return tone === "problem"
    ? <p id={id} role="alert" className="rounded-[10px] border-l-2 border-danger bg-surface-subtle px-3 py-2 text-sm text-danger">{children}</p>
    : <p id={id} role="status" className="rounded-[10px] border-l-2 border-success bg-callout px-3 py-2 text-sm text-text-primary">{children}</p>;
}

function errorText(error: { data?: { code?: string } | null; message: string } | null, fallback: string) {
  if (!error) return null;
  const code = error.data?.code;
  if (code === "TOO_MANY_REQUESTS") return "Too many changes. Wait a few minutes and try again.";
  if (code === "CONFLICT" || code === "FORBIDDEN" || code === "BAD_REQUEST") return error.message;
  return fallback;
}

export function ProfileSettings() {
  const { user } = useAuth();
  return <div className="min-w-0 max-w-[40rem]">
    <SettingsHeader title="Profile" intro="How you appear to teammates in every workspace." back={{ href: "/settings/account", label: "Your account" }} />
    {user ? <>
      <NameForm current={user.name ?? ""} username={user.username} />
      <UsernameForm current={user.username} changedAt={user.usernameChangedAt ? new Date(user.usernameChangedAt) : null} />
    </> : null}
  </div>;
}

function NameForm({ current, username }: { current: string; username: string }) {
  const id = useId();
  const [name, setName] = useState(current);
  const utils = trpc.useUtils();
  const update = trpc.profile.update.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  const trimmed = name.trim();
  const tooLong = trimmed.length > 60;
  const problem = tooLong ? "Use 60 characters or fewer." : errorText(update.error, "Could not save your name. Try again.");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tooLong || update.isPending) return;
    update.mutate({ name: trimmed });
  };

  return <form onSubmit={submit} noValidate className={card}>
    <div>
      <label htmlFor={id} className="text-base font-semibold text-text-primary">Display name</label>
      <input id={id} value={name} onChange={(event) => { setName(event.target.value); update.reset(); }} autoComplete="name" maxLength={80} className={field} aria-describedby={`${id}-help${problem ? ` ${id}-problem` : ""}`} />
      <p id={`${id}-help`} className="mt-1 text-xs text-text-muted">Shown on your discussions, replies and decisions. Leave it empty to show @{username}.</p>
    </div>
    {problem ? <Notice tone="problem" id={`${id}-problem`}>{problem}</Notice> : null}
    {update.isSuccess && !problem ? <Notice tone="done">{trimmed ? "Name saved." : `Name removed. Teammates see @${username}.`}</Notice> : null}
    <div className="flex justify-end border-t border-border-subtle pt-4">
      <Button type="submit" variant="primary" disabled={update.isPending || tooLong || trimmed === current.trim()}>{update.isPending ? "Saving..." : "Save name"}</Button>
    </div>
  </form>;
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function UsernameForm({ current, changedAt }: { current: string; changedAt: Date | null }) {
  const id = useId();
  const [username, setUsername] = useState(current);
  const utils = trpc.useUtils();
  const change = trpc.profile.changeUsername.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  // Read once when the form opens; the cool-down is measured in days.
  const [now] = useState(() => Date.now());
  const nextChange = changedAt && changedAt.getTime() + COOLDOWN_DAYS * DAY > now ? new Date(changedAt.getTime() + COOLDOWN_DAYS * DAY) : null;
  const typed = username.trim().toLowerCase();
  const debounced = useDebounced(typed, 350);
  const edited = typed !== current;
  const check = trpc.profile.usernameAvailable.useQuery({ username: debounced }, { enabled: edited && Boolean(debounced) && !nextChange, staleTime: 10_000 });
  const settled = debounced === typed && !check.isFetching;
  const result = settled ? check.data : undefined;

  const status = !edited || !typed ? null
    : !result ? { tone: "checking" as const, text: "Checking…" }
      : result.available ? { tone: "ok" as const, text: `@${result.username} is available.` }
        : result.reason === "invalid" ? { tone: "bad" as const, text: result.message }
          : result.reason === "yours" ? { tone: "bad" as const, text: "That's already your username." }
            : { tone: "bad" as const, text: "That username is taken." };
  const problem = errorText(change.error, "Could not change your username. Try again.");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!result?.available || change.isPending) return;
    change.mutate({ username: result.username });
  };

  return <form onSubmit={submit} noValidate className={card}>
    <div>
      <label htmlFor={id} className="text-base font-semibold text-text-primary">Username</label>
      <div className="canopy-field-frame mt-2 flex min-h-10 items-center rounded-[10px] border border-control-border bg-surface pl-3 text-sm">
        <span aria-hidden="true" className="text-text-muted">@</span>
        <input id={id} value={username} onChange={(event) => { setUsername(event.target.value); change.reset(); }} disabled={Boolean(nextChange)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={60}
          className="canopy-inset min-h-10 min-w-0 flex-1 rounded-r-[10px] bg-transparent pl-0.5 pr-3 text-text-primary disabled:cursor-not-allowed disabled:text-text-muted"
          aria-describedby={`${id}-help${status ? ` ${id}-status` : ""}`} />
      </div>
      {status ? <p id={`${id}-status`} aria-live="polite" className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${status.tone === "ok" ? "text-success" : status.tone === "bad" ? "text-danger" : "text-text-muted"}`}>
        {status.tone === "ok" ? <Check size={13} aria-hidden="true" /> : status.tone === "bad" ? <X size={13} aria-hidden="true" /> : <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {status.text}
      </p> : null}
      <p id={`${id}-help`} className="mt-1.5 text-xs leading-5 text-text-muted">
        {nextChange
          ? `You changed your username recently. You can change it again on ${longDate(nextChange)}.`
          : `Letters, numbers and underscores. Mentions of @${current} stay as they were written, and you can change your username once every ${COOLDOWN_DAYS} days.`}
      </p>
    </div>
    {problem ? <Notice tone="problem">{problem}</Notice> : null}
    {change.isSuccess && !problem ? <Notice tone="done">{`Username changed to @${change.data?.username ?? current}.`}</Notice> : null}
    <div className="flex justify-end border-t border-border-subtle pt-4">
      <Button type="submit" variant="primary" disabled={!result?.available || change.isPending || Boolean(nextChange)}>{change.isPending ? "Changing..." : "Change username"}</Button>
    </div>
  </form>;
}
