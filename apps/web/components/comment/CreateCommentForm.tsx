"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";

import { createCommentInputSchema, type CreateCommentInput } from "@repo/validators/comment";
import { commentActionError } from "@/components/comment/commentErrors";
import { useCommentActions } from "@/hooks/useComment";
import { MentionTextarea } from "@/components/common/MentionTextarea";
import { MarkdownField } from "@/components/common/MarkdownField";
import { AttachmentComposer } from "@/components/files/AttachmentComposer";
import { uploadBlocker, useUploader } from "@/hooks/useAttachments";
import { Button } from "@/components/ui/Button";

export function CreateCommentForm({ discussionId, workspaceId, parentCommentId, active = true, onCancel, onCreated, floating = false }: {
  discussionId: string;
  workspaceId: string;
  parentCommentId?: string;
  active?: boolean;
  onCancel?: () => void;
  onCreated?: () => void;
  // The discussion page's glass composer at the bottom of the thread (#171):
  // a compact field without its own frame, the label for screen readers.
  floating?: boolean;
}) {
  const form = useForm<CreateCommentInput>({
    resolver: zodResolver(createCommentInputSchema),
    defaultValues: { discussionId, parentCommentId, body: "", attachmentIds: [] },
    shouldFocusError: true,
  });
  const { create } = useCommentActions(discussionId, workspaceId);
  const submittingRef = useRef(false);
  // One key per draft: a retry of the same content replays instead of duplicating.
  const submissionRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [posted, setPosted] = useState(false);
  const uploader = useUploader(workspaceId);
  const [blocked, setBlocked] = useState<string | null>(null);
  const busy = form.formState.isSubmitting || create.isPending;
  // The schema accepts a reply that is only files, so it sees them too.
  const attachmentKey = uploader.attachmentIds.join(",");
  useEffect(() => {
    form.setValue("attachmentIds", attachmentKey ? attachmentKey.split(",") : [], { shouldValidate: form.formState.isSubmitted });
  }, [attachmentKey, form]);
  const fieldId = `comment-body-${parentCommentId ?? "root"}`;
  const fieldErrorId = `${fieldId}-error`;
  const { setFocus } = form;

  useEffect(() => {
    if (active && parentCommentId) setFocus("body");
  }, [active, parentCommentId, setFocus]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }
    const blocker = uploadBlocker(uploader);
    setBlocked(blocker);
    if (blocker) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    void form.handleSubmit(async (values) => {
      setPosted(false);
      try {
        const fingerprint = JSON.stringify([values.body, values.attachmentIds]);
        if (submissionRef.current?.fingerprint !== fingerprint) {
          submissionRef.current = { fingerprint, key: crypto.randomUUID() };
        }
        await create.mutateAsync({ ...values, idempotencyKey: submissionRef.current.key });
        submissionRef.current = null;
        form.reset({ discussionId, parentCommentId, body: "", attachmentIds: [] });
        uploader.reset();
        setPosted(true);
        onCreated?.();
      } catch {
        // Keep the draft for another attempt.
      } finally {
        submittingRef.current = false;
      }
    }, () => { submittingRef.current = false; })(event);
  };

  const serverError = commentActionError(create.error, "Your comment could not be posted. Please try again.");
  return (
    <form onSubmit={onSubmit} className={`min-w-0 space-y-3 ${floating ? "" : "max-w-[44rem]"}`} noValidate>
      <div>
        <label htmlFor={fieldId} className={floating ? "sr-only" : "mb-2 block text-sm font-semibold text-text-primary"}>
          {parentCommentId ? "Your reply" : "Your perspective"}
        </label>
        <AttachmentComposer uploader={uploader} disabled={busy}>
        <MarkdownField>
        <MentionTextarea
          workspaceId={workspaceId}
          registration={form.register("body")}
          value={form.watch("body")}
          onInsert={(value) => form.setValue("body", value, { shouldDirty: true, shouldValidate: true })}
          id={fieldId}
          placeholder={parentCommentId ? "Add to this part of the conversation..." : floating ? "Reply to the discussion, @ to mention, attach files" : "Share a thoughtful response..."}
          rows={parentCommentId ? 4 : floating ? 2 : 5}
          maxLength={5000}
          disabled={busy}
          aria-invalid={Boolean(form.formState.errors.body)}
          aria-describedby={form.formState.errors.body ? fieldErrorId : undefined}
          className={floating
            ? "max-h-[40vh] min-h-14 w-full resize-y rounded-[10px] border border-transparent bg-transparent px-2.5 py-2 text-[0.9375rem] leading-6 text-text-primary placeholder:text-text-muted hover:border-border-subtle focus-visible:border-brand-link focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
            : "min-h-28 w-full resize-y rounded-[10px] border border-control-border bg-surface px-3.5 py-3 text-sm leading-6 text-text-primary placeholder:text-text-muted hover:border-text-muted focus-visible:border-brand-link focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"}
        />
        </MarkdownField>
        </AttachmentComposer>
        {form.formState.errors.body ? (
          <p id={fieldErrorId} role="alert" className="mt-1 text-sm text-danger">Write a {parentCommentId ? "reply" : "comment"} of up to 5,000 characters, or attach a file.</p>
        ) : null}
        {blocked && uploadBlocker(uploader) ? <p role="alert" className="mt-1 text-sm text-danger">{uploadBlocker(uploader)}</p> : null}
      </div>
      {serverError ? <p role="alert" className="rounded-[10px] border-l-2 border-danger bg-surface-subtle px-3 py-2 text-sm text-danger">{serverError}</p> : null}
      {posted && !parentCommentId ? <p role="status" className="text-sm font-medium text-success">Comment posted.</p> : null}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${floating ? "border-t border-glass-line pt-2.5" : ""}`}>
        {busy ? <span role="status" className="sr-only">{parentCommentId ? "Posting reply..." : "Posting comment..."}</span> : null}
        <span className="text-xs text-text-muted">{floating ? "Markdown and @mentions work · " : ""}{form.watch("body").length}/5000</span>
        <div className="ml-auto flex min-w-0 w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel} disabled={busy} className="max-[380px]:w-full">Cancel</Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={busy} className="max-[380px]:w-full" icon={busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}>
            {busy ? "Posting..." : parentCommentId ? "Post reply" : "Post comment"}
          </Button>
        </div>
      </div>
    </form>
  );
}
