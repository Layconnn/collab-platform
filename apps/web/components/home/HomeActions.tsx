"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { useReviewActions } from "@/hooks/useDecisionReviews";
import { trpc } from "@/lib/trpc/api-client";

// Acting from Home (#181): answer a review request or reply to a mention
// without opening the item. Both use the endpoints the item's own page uses,
// so the same rules apply (the review answers one proposal version; replies
// follow the thread's nesting limit).

type ErrorLike = { data?: { code?: string } | null } | null;
const code = (error: ErrorLike) => error?.data?.code;

export function ReviewActions({ workspaceId, decisionId, version, href, title }: {
  workspaceId: string;
  decisionId: string;
  version: number;
  href: string;
  title: string;
}) {
  const { respond } = useReviewActions(workspaceId, decisionId);
  const [objecting, setObjecting] = useState(false);
  const [note, setNote] = useState("");
  const noteId = useId();
  const sent = respond.isSuccess ? respond.variables?.response : null;

  const send = (response: "APPROVED" | "OBJECTED") => {
    respond.mutate({ workspaceId, decisionId, expectedVersion: version, response, ...(response === "OBJECTED" ? { note: note.trim() } : {}) });
  };
  const onObject = (event: FormEvent) => {
    event.preventDefault();
    if (note.trim()) send("OBJECTED");
  };

  if (sent) {
    return <p role="status" className="ml-auto text-[0.8125rem] font-medium text-text-secondary">{sent === "APPROVED" ? "Approved" : "Objection sent"}</p>;
  }

  const problem = respond.error
    ? code(respond.error) === "CONFLICT"
      ? <>This proposal changed since you loaded it. <Link href={href} className="font-medium underline">Open it</Link> to see what changed.</>
      : code(respond.error) === "NOT_FOUND"
        ? "Your review is no longer needed on this proposal."
        : "Could not send your review. Please try again."
    : null;

  return <div className={`flex min-w-0 flex-1 flex-col gap-3 ${objecting ? "basis-full" : "basis-full sm:basis-auto"}`}>
    {objecting
      ? <form onSubmit={onObject} className="flex flex-col gap-2">
        <label htmlFor={noteId} className="text-[0.8125rem] font-medium text-text-primary">Why do you object?</label>
        <textarea
          id={noteId}
          autoFocus
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-h-16 w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[0.875rem] text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus-ring"
          placeholder="Say what would need to change"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={respond.isPending} onClick={() => { setObjecting(false); respond.reset(); }}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={respond.isPending || !note.trim()}>{respond.isPending ? "Sending..." : "Send objection"}</Button>
        </div>
      </form>
      : <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={respond.isPending} aria-label={`Object to ${title}`} onClick={() => { respond.reset(); setObjecting(true); }}>Object</Button>
        <Button variant="primary" disabled={respond.isPending} aria-label={`Approve ${title}`} onClick={() => send("APPROVED")}>{respond.isPending ? "Approving..." : "Approve"}</Button>
      </div>}
    {problem ? <p role="alert" className="text-right text-[0.8125rem] text-danger">{problem}</p> : null}
  </div>;
}

export function QuickReply({ discussionId, parentCommentId, actor, onReplied }: {
  discussionId: string;
  parentCommentId: string | null;
  actor: string | null;
  onReplied: () => void;
}) {
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const inputId = useId();
  // One key per reply text, so a retry after a network error never posts twice.
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const create = trpc.comment.create.useMutation({
    onSuccess: () => {
      setBody("");
      attempt.current = null;
      onReplied();
      void utils.comment.invalidate();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || create.isPending) return;
    if (attempt.current?.body !== text) attempt.current = { body: text, key: crypto.randomUUID() };
    create.mutate({ discussionId, body: text, idempotencyKey: attempt.current.key, ...(parentCommentId ? { parentCommentId } : {}) });
  };

  const problem = create.error
    ? code(create.error) === "NOT_FOUND" || code(create.error) === "FORBIDDEN"
      ? "This discussion is no longer available to you."
      : "Could not send your reply. Your text is still here."
    : null;

  return <form onSubmit={submit} className="mt-3.5">
    <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-subtle py-1.5 pl-3 pr-1.5 focus-within:outline-2 focus-within:outline-focus-ring">
      <label htmlFor={inputId} className="sr-only">Reply to {actor ?? "this"}</label>
      <input
        id={inputId}
        value={body}
        maxLength={5000}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Reply without leaving Home"
        autoComplete="off"
        className="canopy-inset min-w-0 flex-1 bg-transparent text-[0.875rem] text-text-primary outline-none placeholder:text-text-muted"
      />
      <Button type="submit" size="sm" variant="primary" disabled={!body.trim() || create.isPending}>{create.isPending ? "Sending..." : "Reply"}</Button>
    </div>
    <p role={problem ? "alert" : "status"} className={`mt-1.5 text-[0.8125rem] empty:mt-0 ${problem ? "text-danger" : "text-text-muted"}`}>{problem ?? (create.isSuccess ? "Reply sent." : "")}</p>
  </form>;
}
