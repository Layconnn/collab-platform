"use client";

import Link from "next/link";
import { FileText, Pin } from "lucide-react";

import { UserAvatar } from "@/components/common/UserAvatar";
import { Button } from "@/components/ui/Button";
import { ContextPanel, SectionLabel, StatusPill, type StatusTone } from "@/components/ui/Canopy";
import { formatBytes } from "@/hooks/useAttachments";
import { useDiscussionContext } from "@/hooks/useDiscussion";
import { usePinnedReplies } from "@/hooks/usePins";
import { resolveUserIdentity } from "@/lib/user-identity";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const DECISION: Record<string, { tone: StatusTone; label: string }> = {
  PROPOSED: { tone: "proposal", label: "Proposal" },
  DECIDED: { tone: "decided", label: "Decided" },
  SUPERSEDED: { tone: "replaced", label: "Replaced" },
};

type PanelFile = { id: string; fileName: string; size: number };

// The discussion page's side panel (dashboard redesign, #171): the decisions
// the discussion led to, who took part, its files and pinned replies. Stacks
// under the thread below 1100 px.
export function DiscussionContext({ workspaceId, discussionId, files, canPropose, onPropose }: {
  workspaceId: string;
  discussionId: string;
  files: PanelFile[];
  canPropose: boolean;
  onPropose: () => void;
}) {
  const context = useDiscussionContext(workspaceId, discussionId);
  const pins = usePinnedReplies(workspaceId, discussionId);
  const decisions = context.data?.decisions ?? [];
  const people = context.data?.people ?? [];
  const pinned = pins.data?.items ?? [];

  return <ContextPanel label="About this discussion" className="canopy-rise">
    <section aria-labelledby="panel-decision-heading">
      <SectionLabel id="panel-decision-heading" className="mb-2.5">{decisions.length > 1 ? `Decisions · ${decisions.length}` : "Decision"}</SectionLabel>
      {decisions.length ? <ul className="flex flex-col gap-2">
        {decisions.map((decision) => {
          const pill = DECISION[decision.status] ?? { tone: "neutral" as const, label: decision.status };
          return <li key={decision.id}>
            <Link href={`/workspace/${workspaceId}/decisions/${decision.id}`} className="canopy-lift block rounded-xl border border-border-subtle bg-surface px-3.5 py-3 focus-visible:outline-2 focus-visible:outline-focus-ring">
              <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
              <span className="mt-2 block wrap-anywhere font-medium leading-snug text-text-primary">{decision.question}</span>
            </Link>
          </li>;
        })}
      </ul> : context.data ? <div className="rounded-xl border border-dashed border-callout-line bg-callout px-3.5 py-3.5 leading-relaxed text-text-secondary">
        <p>No decision yet. When the thread agrees, propose one and keep the reasoning attached.</p>
        {canPropose ? <Button variant="secondary" size="sm" className="mt-3" onClick={onPropose}>Propose a decision</Button> : null}
      </div> : <span aria-hidden="true" className="block h-20 animate-pulse rounded-xl bg-surface-active" />}
    </section>

    <section aria-labelledby="panel-people-heading">
      <SectionLabel id="panel-people-heading" className="mb-2.5">People{context.data ? ` · ${people.length + context.data.morePeople}` : ""}</SectionLabel>
      {context.error ? <p className="text-text-muted">People are unavailable right now.</p> : null}
      <ul className="flex flex-col gap-2.5">
        {people.map((person) => {
          const identity = resolveUserIdentity(person);
          return <li key={person.id} className="flex min-w-0 items-center gap-2.5">
            <UserAvatar name={identity.avatarName} photo={identity.photo} className="size-6 text-[10px]" />
            <span className="min-w-0 flex-1 truncate text-text-primary">{identity.label}</span>
            <span className="shrink-0 text-text-muted">{person.author ? "Author" : plural(person.replies, "reply", "replies")}</span>
          </li>;
        })}
      </ul>
      {context.data?.morePeople ? <p className="mt-2 text-text-muted">and {plural(context.data.morePeople, "other")}</p> : null}
    </section>

    {files.length ? <section aria-labelledby="panel-files-heading">
      <SectionLabel id="panel-files-heading" className="mb-2.5">Files · {files.length}</SectionLabel>
      <ul className="flex flex-col gap-2 text-text-secondary">
        {files.map((file) => <li key={file.id} className="flex min-w-0 items-center gap-2">
          <FileText size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
          <a href={`/api/files/${file.id}`} className="min-w-0 truncate hover:text-text-primary hover:underline">{file.fileName}</a>
          <span className="shrink-0 text-text-muted">· {formatBytes(file.size)}</span>
        </li>)}
      </ul>
    </section> : null}

    {pinned.length ? <section aria-labelledby="pinned-heading">
      <SectionLabel id="pinned-heading" className="mb-2.5"><span className="inline-flex items-center gap-1.5"><Pin size={11} aria-hidden="true" /> Pinned</span></SectionLabel>
      <ul className="flex flex-col gap-3">
        {pinned.map((item) => <li key={item.commentId}>
          <a href={`#comment-${item.commentId}`} className="block leading-relaxed text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">
            &ldquo;<span className="wrap-anywhere">{item.excerpt || "(no text)"}</span>&rdquo; <span className="text-text-muted">{item.author}</span>
          </a>
          {item.pinnedBy ? <p className="mt-0.5 text-xs text-text-muted">Pinned by {item.pinnedBy}</p> : null}
        </li>)}
      </ul>
    </section> : null}
  </ContextPanel>;
}
