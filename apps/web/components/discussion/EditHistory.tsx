"use client";

import { useState } from "react";

import { Modal } from "@/components/common/Modal";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { useCommentHistory } from "@/hooks/useComment";
import { useDiscussionHistory } from "@/hooks/useDiscussion";
import { fileChanges, wordDiff, type DiffPart } from "@/lib/word-diff";

// "Edited" on a discussion or reply, and the history it opens (edit history
// PRD, FR-7). Each older version shows what the next edit changed: removed
// words struck through, added words highlighted, so the record stays honest.

type Target = { discussionId: string } | { commentId: string };

type Version = {
  version: number;
  current: boolean;
  title?: string;
  body: string;
  fileNames: string[];
  byLabel: string;
  at: Date | string;
};

const fullDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const shortDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(value));

export function EditedButton({ target, at, className = "" }: { target: Target; at?: Date | string; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
      className={`rounded-sm text-text-muted underline decoration-dotted decoration-from-font underline-offset-[3px] hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${className}`}
    >
      Edited{at ? <> <time dateTime={new Date(at).toISOString()}>{shortDate(at)}</time></> : null}
      <span className="sr-only">, show edit history</span>
    </button>
    {open ? "discussionId" in target
      ? <DiscussionHistory discussionId={target.discussionId} onClose={() => setOpen(false)} />
      : <CommentHistory commentId={target.commentId} onClose={() => setOpen(false)} />
    : null}
  </>;
}

function DiscussionHistory({ discussionId, onClose }: { discussionId: string; onClose: () => void }) {
  const history = useDiscussionHistory(discussionId, true);
  return <HistoryDialog title="Discussion history" query={history} onClose={onClose} />;
}

function CommentHistory({ commentId, onClose }: { commentId: string; onClose: () => void }) {
  const history = useCommentHistory(commentId, true);
  return <HistoryDialog title="Reply history" query={history} onClose={onClose} />;
}

function HistoryDialog({ title, query, onClose }: {
  title: string;
  query: { data?: { versions: Version[]; total: number }; isLoading: boolean; error: unknown; isFetching: boolean; refetch: () => unknown };
  onClose: () => void;
}) {
  const data = query.data;
  const edits = data ? data.total - 1 : 0;
  return <Modal
    title={title}
    description={data ? `${edits} ${edits === 1 ? "edit" : "edits"}, newest first. Each older version shows what the next edit changed.` : undefined}
    onClose={onClose}
  >
    <div className="mt-5 space-y-4">
      {query.isLoading && !data ? <LoadingState label="Loading the history..." /> : null}
      {query.error && !data ? <ErrorState title="Could not load the history" description="Please try again in a moment." onRetry={() => void query.refetch()} retrying={query.isFetching} /> : null}
      {data ? <>
        <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted" aria-hidden="true">
          <span><del className="history-removed">Struck through</del> removed by the next edit</span>
          <span><ins className="history-added">Highlighted</ins> added by it</span>
        </p>
        <ol className="m-0 list-none space-y-3 p-0" aria-label="Versions">
          {data.versions.map((version, index) => <VersionCard key={version.version} version={version} next={index > 0 ? data.versions[index - 1] : undefined} />)}
        </ol>
        {data.total > data.versions.length ? <p className="m-0 text-xs text-text-muted">Showing the newest {data.versions.length} of {data.total} versions.</p> : null}
      </> : null}
    </div>
  </Modal>;
}

function VersionCard({ version, next }: { version: Version; next?: Version }) {
  const name = version.current ? "Current version" : version.version === 1 ? "Original" : `Version ${version.version}`;
  const verb = version.version === 1 ? "Written" : "Edited";
  const files = next ? fileChanges(version.fileNames, next.fileNames) : null;
  return <li className={`rounded-xl border px-4 py-3.5 ${version.current ? "border-border bg-surface" : "border-border-subtle bg-surface-subtle"}`}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="m-0 text-sm font-semibold text-text-primary">{name}</h3>
      <p className="m-0 text-xs text-text-muted">{verb} by {version.byLabel} · <time dateTime={new Date(version.at).toISOString()}>{fullDate(version.at)}</time></p>
    </div>
    {version.title !== undefined ? <p className="mb-0 mt-2 text-[0.9375rem] font-semibold leading-6 text-text-primary wrap-anywhere">
      {next?.title !== undefined ? <Diff parts={wordDiff(version.title, next.title)} /> : version.title}
    </p> : null}
    <p className="mb-0 mt-1.5 whitespace-pre-wrap text-sm leading-6 text-text-secondary wrap-anywhere">
      {next ? <Diff parts={wordDiff(version.body, next.body)} /> : version.body || <span className="italic text-text-muted">No text</span>}
    </p>
    {version.fileNames.length || files?.added.length ? <ul className="mb-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0 text-xs" aria-label="Files">
      {version.fileNames.map((fileName, index) => {
        const removed = files?.removed.includes(fileName);
        return <li key={`${fileName}-${index}`} className="rounded-md border border-border-subtle px-2 py-0.5 text-text-secondary">
          {removed ? <del className="history-removed">{fileName}</del> : fileName}
        </li>;
      })}
      {files?.added.map((fileName, index) => <li key={`added-${fileName}-${index}`} className="rounded-md border border-border-subtle px-2 py-0.5"><ins className="history-added">{fileName}</ins></li>)}
    </ul> : null}
  </li>;
}

function Diff({ parts }: { parts: DiffPart[] }) {
  return <>{parts.map((part, index) =>
    part.kind === "same" ? <span key={index}>{part.text}</span>
      : part.kind === "removed" ? <del key={index} className="history-removed"><span className="sr-only">removed: </span>{part.text}</del>
      : <ins key={index} className="history-added"><span className="sr-only">added: </span>{part.text}</ins>,
  )}</>;
}
