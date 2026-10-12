"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";

import { createCommentInputSchema, type CreateCommentInput } from "@repo/validators/comment";
import { commentActionError } from "@/components/comment/commentErrors";
import { useCommentActions } from "@/hooks/useComment";
import { MentionTextarea } from "@/components/common/MentionTextarea";

export function CreateCommentForm({ discussionId, workspaceId, parentCommentId, active = true, onCancel, onCreated }: {
  discussionId: string;
  workspaceId: string;
  parentCommentId?: string;
  active?: boolean;
  onCancel?: () => void;
  onCreated?: () => void;
}) {
  const form = useForm<CreateCommentInput>({
    resolver: zodResolver(createCommentInputSchema),
    defaultValues: { discussionId, parentCommentId, body: "" },
    shouldFocusError: true,
  });
  const { create } = useCommentActions(discussionId, workspaceId);
  const submittingRef = useRef(false);
  const [posted, setPosted] = useState(false);
  const busy = form.formState.isSubmitting || create.isPending;
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
    submittingRef.current = true;
    void form.handleSubmit(async (values) => {
      setPosted(false);
      try {
        await create.mutateAsync(values);
        form.reset({ discussionId, parentCommentId, body: "" });
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
    <form onSubmit={onSubmit} className="max-w-[44rem] space-y-3" noValidate>
      <div>
        <label htmlFor={fieldId} className="mb-2 block text-sm font-semibold text-text-primary">
          {parentCommentId ? "Your reply" : "Your perspective"}
        </label>
        <MentionTextarea
          workspaceId={workspaceId}
          registration={form.register("body")}
          value={form.watch("body")}
          onInsert={(value) => form.setValue("body", value, { shouldDirty: true, shouldValidate: true })}
          id={fieldId}
          placeholder={parentCommentId ? "Add to this part of the conversation..." : "Share a thoughtful response..."}
          rows={parentCommentId ? 4 : 5}
          maxLength={5000}
          disabled={busy}
          aria-invalid={Boolean(form.formState.errors.body)}
          aria-describedby={form.formState.errors.body ? fieldErrorId : undefined}
          className="min-h-28 w-full resize-y rounded-sm border border-border bg-surface px-3.5 py-3 text-sm leading-6 text-text-primary placeholder:text-text-muted hover:border-text-muted focus-visible:border-brand-link focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
        />
        {form.formState.errors.body ? (
          <p id={fieldErrorId} role="alert" className="mt-1 text-sm text-danger">Write a {parentCommentId ? "reply" : "comment"} of up to 5,000 characters.</p>
        ) : null}
      </div>
      {serverError ? <p role="alert" className="border-l-2 border-danger bg-surface px-3 py-2 text-sm text-danger">{serverError}</p> : null}
      {posted && !parentCommentId ? <p role="status" className="text-sm font-medium text-success">Comment posted.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {busy ? <span role="status" className="sr-only">{parentCommentId ? "Posting reply..." : "Posting comment..."}</span> : null}
        <span className="text-xs text-text-muted">{form.watch("body").length}/5000</span>
        <div className="ml-auto flex items-center gap-2">
          {onCancel ? (
            <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-sm px-3 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">Cancel</button>
          ) : null}
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60 motion-reduce:transition-none">
            {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
            {busy ? "Posting..." : parentCommentId ? "Post reply" : "Post comment"}
          </button>
        </div>
      </div>
    </form>
  );
}
