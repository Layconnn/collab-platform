"use client";

import { Check, Copy, Link2, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/common/Modal";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { useInvites } from "@/hooks/useInvites";

type Created = { url: string; role: "MEMBER" | "ADMIN"; expiresAt: Date | string };

const dateLabel = (value: Date | string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

const field = "mt-1.5 min-h-11 w-full rounded-sm border border-control-border bg-surface px-3 text-sm text-text-primary focus-visible:border-brand-link focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60";

// Invite links PRD (FR-1 to FR-4): managers create links to share, see who
// used them and when they end, and revoke them. A link is shown once.
export function InviteLinks({ workspaceId }: { workspaceId: string }) {
  const { list, create, revoke } = useInvites(workspaceId);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);
  const [maxUses, setMaxUses] = useState("");
  const [name, setName] = useState("");

  const openDialog = () => {
    create.reset();
    setCreated(null);
    setCopied("idle");
    setRole("MEMBER");
    setExpiresInDays(7);
    setMaxUses("");
    setName("");
    setOpen(true);
  };
  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const limit = maxUses.trim() ? Number(maxUses) : undefined;
    create.mutate({ workspaceId, role, expiresInDays, maxUses: limit, name: name.trim() || undefined }, {
      onSuccess: (result) => setCreated({ url: `${window.location.origin}${result.path}`, role: result.invite.role, expiresAt: result.invite.expiresAt }),
    });
  };
  const copy = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.url); setCopied("copied"); } catch { setCopied("failed"); }
  };
  const limitInvalid = maxUses.trim() !== "" && !(Number.isInteger(Number(maxUses)) && Number(maxUses) >= 1 && Number(maxUses) <= 100);
  const items = list.data?.items ?? [];

  return <div className="space-y-4">
    <div>
      <p className="text-xs font-semibold uppercase text-brand-link">Invite</p>
      <h2 className="mt-1 text-lg font-semibold text-text-primary">Invite with a link</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Anyone with the link can join, with or without a Commons account, until it expires or you revoke it.</p>
    </div>
    <button type="button" onClick={openDialog} className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-focus-ring">
      <Plus size={16} aria-hidden="true" /> Invite people
    </button>

    {list.isLoading ? <LoadingState label="Loading invite links..." /> : null}
    {list.error ? <ErrorState title="Could not load invite links" onRetry={() => void list.refetch()} retrying={list.isFetching} /> : null}
    {items.length ? <ul aria-label="Invite links" className="divide-y divide-border-subtle border-y border-border-subtle">
      {items.map((invite) => <li key={invite.id} className="py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Link2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-text-muted" />
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
              <span className="truncate">{invite.name ?? "Invite link"}</span>
              <span className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${invite.role === "ADMIN" ? "bg-warning/15 text-warning" : "bg-surface-subtle text-text-secondary"}`}>{invite.role === "ADMIN" ? "Admin" : "Member"}</span>
            </p>
            <p className="mt-0.5 text-xs leading-5 text-text-muted">
              {invite.maxUses ? `${invite.uses} of ${invite.maxUses} joined` : `${invite.uses} joined`}
              {" · "}{invite.status === "ACTIVE" ? <>Expires <time dateTime={new Date(invite.expiresAt).toISOString()}>{dateLabel(invite.expiresAt)}</time></> : invite.status === "USED_UP" ? "Used up" : "Expired"}
              {" · "}by {invite.createdBy}
            </p>
          </div>
          {invite.status === "ACTIVE" && confirming !== invite.id ? <button type="button" onClick={() => setConfirming(invite.id)} aria-label={`Revoke ${invite.name ?? "invite link"}`} className="min-h-9 shrink-0 rounded-sm px-2 text-xs font-semibold text-danger hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">Revoke</button> : null}
        </div>
        {confirming === invite.id ? <div role="group" aria-label="Confirm revoking" className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs">
          <span className="text-text-secondary">The link stops working at once.</span>
          <button type="button" autoFocus disabled={revoke.isPending} onClick={() => revoke.mutate({ workspaceId, inviteId: invite.id }, { onSuccess: () => setConfirming(null) })} className="min-h-9 rounded-sm bg-danger px-3 font-semibold text-white disabled:opacity-60">{revoke.isPending ? "Revoking..." : "Revoke link"}</button>
          <button type="button" onClick={() => setConfirming(null)} className="min-h-9 rounded-sm px-2 font-semibold text-text-secondary hover:bg-surface-hover">Keep</button>
        </div> : null}
      </li>)}
    </ul> : null}
    {revoke.error ? <p role="alert" className="text-sm text-danger">Could not revoke that link. Try again.</p> : null}

    {open ? <Modal title={created ? "Your invite link" : "Invite people"} description={created ? undefined : "Create a link to share in chat, email or a meeting."} onClose={() => setOpen(false)} busy={create.isPending} initialFocus={created ? "[data-invite-copy]" : undefined}>
      {created ? <div className="space-y-4">
        <label className="block text-sm font-semibold text-text-primary" htmlFor="invite-url">Link</label>
        <div className="flex min-w-0 gap-2">
          <input id="invite-url" readOnly value={created.url} onFocus={(event) => event.target.select()} className={`${field} mt-0 min-w-0 flex-1 font-mono text-xs`} />
          <button type="button" data-invite-copy onClick={() => void copy()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-focus-ring">
            {copied === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied === "copied" ? "Copied" : "Copy"}
          </button>
        </div>
        <p role="status" className="text-sm text-text-secondary">{copied === "failed" ? "Could not copy. Select the link and copy it yourself." : copied === "copied" ? "Copied. Paste it wherever your team talks." : ""}</p>
        <p className="border-l-2 border-warning px-3 text-sm leading-6 text-text-secondary"><strong className="text-text-primary">Copy it now.</strong> For safety, Commons does not show this link again. People join as {created.role === "ADMIN" ? "admins" : "members"} until {dateLabel(created.expiresAt)}.</p>
        <div className="flex justify-end"><button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-sm border border-border px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover">Done</button></div>
      </div> : <form onSubmit={onCreate} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-text-primary">Join as
            <select value={role} onChange={(event) => setRole(event.target.value as "MEMBER" | "ADMIN")} disabled={create.isPending} className={field}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-text-primary">Expires after
            <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value) as 1 | 7 | 30)} disabled={create.isPending} className={field}>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-text-primary">Use limit
            <input inputMode="numeric" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="No limit" disabled={create.isPending} aria-invalid={limitInvalid} aria-describedby="invite-limit-help" className={field} />
            <span id="invite-limit-help" className={`mt-1 block text-xs font-normal ${limitInvalid ? "text-danger" : "text-text-muted"}`}>{limitInvalid ? "Enter a number from 1 to 100, or leave it empty." : "How many people can join with it."}</span>
          </label>
          <label className="block text-sm font-semibold text-text-primary">Name (optional)
            <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Design team" disabled={create.isPending} className={field} />
          </label>
        </div>
        {role === "ADMIN" ? <p className="border-l-2 border-warning px-3 text-sm text-text-secondary">People who join with this link can manage members, discussions and decisions.</p> : null}
        {create.error ? <p role="alert" className="text-sm text-danger">{create.error.message.includes("up to 20") ? create.error.message : "Could not create the link. Try again."}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setOpen(false)} disabled={create.isPending} className="min-h-11 rounded-sm px-4 text-sm font-semibold text-text-secondary hover:bg-surface-hover">Cancel</button>
          <button type="submit" disabled={create.isPending || limitInvalid} className="min-h-11 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover disabled:opacity-60">{create.isPending ? "Creating..." : "Create link"}</button>
        </div>
      </form>}
    </Modal> : null}
  </div>;
}
