"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import {
  createDiscussionInputSchema,
  type CreateDiscussionInput,
} from "@repo/validators/discussion";

import { useDiscussionActions } from "@/hooks/useDiscussion";
import { MentionTextarea } from "@/components/common/MentionTextarea";
import { discussionActionError } from "@/components/discussion/discussionErrors";

export function CreateDiscussionForm({ workspaceId, onCancel, open = true }: { workspaceId: string; onCancel: () => void; open?: boolean }) {
  const form = useForm<CreateDiscussionInput>({
    resolver: zodResolver(createDiscussionInputSchema),
    defaultValues: { workspaceId, title: "", body: "" },
    shouldFocusError: true,
  });
  const title = useWatch({ control: form.control, name: "title" });

  const { create: createDiscussion } = useDiscussionActions(workspaceId);
  const submittingRef = useRef(false);
  const [posted, setPosted] = useState<{ id: string; title: string } | null>(null);
  const busy = form.formState.isSubmitting || createDiscussion.isPending;

  const { setFocus } = form;
  useEffect(() => { if (open) setFocus("title"); }, [open, setFocus]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    void form.handleSubmit(async (values) => {
      setPosted(null);
      try {
        const discussion = await createDiscussion.mutateAsync(values);
        form.reset({ workspaceId, title: "", body: "" });
        setPosted({ id: discussion.id, title: discussion.title });
      } catch {
        // The mutation error is shown below without discarding the draft.
      } finally {
        submittingRef.current = false;
      }
    }, () => { submittingRef.current = false; })(event);
  };

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4" noValidate>
      <div>
        <label htmlFor="discussion-title" className="block text-sm font-semibold text-text-primary">Title</label>
        <MentionTextarea
          as="input"
          workspaceId={workspaceId}
          registration={form.register("title")}
          value={title}
          onInsert={(value) => form.setValue("title", value, { shouldDirty: true, shouldValidate: true })}
          id="discussion-title"
          className="mt-2 min-h-11 w-full rounded-sm border border-control-border bg-surface px-3.5 text-base text-text-primary placeholder:text-text-muted hover:border-text-muted focus-visible:border-brand-link focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring disabled:opacity-60"
          placeholder="What needs a conversation?"
          aria-invalid={Boolean(form.formState.errors.title)}
          aria-describedby={form.formState.errors.title ? "discussion-title-error" : undefined}
          disabled={busy}
          maxLength={120}
        />
        {form.formState.errors.title ? <p id="discussion-title-error" role="alert" className="mt-1.5 text-sm text-danger">Please add a clear title within the allowed length.</p> : null}
      </div>
      <div>
        <label htmlFor="discussion-body" className="block text-sm font-semibold text-text-primary">Context</label>
        <MentionTextarea
          workspaceId={workspaceId}
          registration={form.register("body")}
          value={form.watch("body")}
          onInsert={(value) => form.setValue("body", value, { shouldDirty: true, shouldValidate: true })}
          id="discussion-body"
          className="mt-2 min-h-32 w-full resize-y rounded-sm border border-control-border bg-surface px-3.5 py-3 text-sm leading-6 text-text-primary placeholder:text-text-muted hover:border-text-muted focus-visible:border-brand-link focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring disabled:opacity-60"
          placeholder="Share the background, question, or update so others can contribute."
          rows={5}
          aria-invalid={Boolean(form.formState.errors.body)}
          aria-describedby={form.formState.errors.body ? "discussion-body-error" : "discussion-body-help"}
          disabled={busy}
          maxLength={5000}
        />
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2 text-xs text-text-muted">
          <p id="discussion-body-help">Plain text. Keep the important details together.</p>
          <span>{form.watch("body").length}/5000</span>
        </div>
        {form.formState.errors.body ? <p id="discussion-body-error" role="alert" className="mt-1.5 text-sm text-danger">Please add some context within the allowed length.</p> : null}
      </div>
      {createDiscussion.error ? <p role="alert" className="border-l-2 border-danger bg-surface px-3 py-2.5 text-sm text-danger">{discussionActionError(createDiscussion.error, "Your discussion could not be published. Your draft is still here; please try again.")}</p> : null}
      {posted ? (
        <p role="status" className="border-l-2 border-success bg-surface px-3 py-2.5 text-sm text-text-secondary">
          Discussion published. <Link href={`/workspace/${workspaceId}/discussions/${posted.id}`} className="font-semibold text-brand-link hover:text-brand-link-hover">Open {posted.title}</Link>
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {busy ? <span role="status" className="sr-only">Publishing discussion...</span> : null}
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-sm px-4 text-sm font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-60">Cancel</button>
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-brand-action px-5 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none">
          {busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
          {busy ? "Publishing..." : "Publish discussion"}
        </button>
      </div>
    </form>
  );
}
