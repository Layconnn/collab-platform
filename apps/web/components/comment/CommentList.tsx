"use client";

import { Menu, Portal } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, CornerDownRight, Ellipsis, LoaderCircle, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import type { inferRouterOutputs } from "@trpc/server";

import { updateCommentInputSchema, type UpdateCommentInput } from "@repo/validators/comment";
import { commentActionError } from "@/components/comment/commentErrors";
import { CreateCommentForm } from "@/components/comment/CreateCommentForm";
import { MentionText } from "@/components/common/MentionText";
import { UserAvatar } from "@/components/common/UserAvatar";
import { ErrorState } from "@/components/common/StateNotice";
import { useCommentActions, useCommentList } from "@/hooks/useComment";
import type { AppRouter } from "@/server/api/root";
import { resolveUserIdentity } from "@/lib/user-identity";

type CommentItem = inferRouterOutputs<AppRouter>["comment"]["listByDiscussion"]["items"][number];
type Viewer = { id: string | undefined; canAct: boolean; canManageOthers: boolean };

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function CommentSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5 py-5">
      <span className="sr-only">{label}</span>
      {[1, 2, 3].map((item) => (
        <div key={item} aria-hidden="true" className="flex gap-3">
          <span className="size-9 shrink-0 animate-pulse rounded-full bg-surface-active" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-40 animate-pulse rounded-sm bg-surface-active" />
            <span className="block h-4 w-[min(30rem,90%)] animate-pulse rounded-sm bg-surface-subtle" />
            <span className="block h-4 w-[min(23rem,70%)] animate-pulse rounded-sm bg-surface-subtle" />
          </span>
        </div>
      ))}
    </div>
  );
}

function CommentThread({ comment, discussionId, workspaceId, viewer, onAccessDenied }: { comment: CommentItem; discussionId: string; workspaceId: string; viewer: Viewer; onAccessDenied?: () => void }) {
  const { update, remove } = useCommentActions(discussionId, workspaceId);
  const [showReplies, setShowReplies] = useState(false);
  const [openedReplies, setOpenedReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const [openedReplyForm, setOpenedReplyForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [postedReply, setPostedReply] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const requestedRepliesRef = useRef(false);
  const form = useForm<UpdateCommentInput>({
    resolver: zodResolver(updateCommentInputSchema),
    defaultValues: { commentId: comment.id, body: comment.body },
    shouldFocusError: true,
  });
  const { setFocus } = form;
  const author = resolveUserIdentity(comment.author);
  const authorName = author.label;
  const canManage = Boolean(viewer.canAct && viewer.id && (comment.author?.id === viewer.id || viewer.canManageOthers));
  const canReply = viewer.canAct && comment.depth < 8;
  const replies = useCommentList(discussionId, comment.id, showReplies && comment.depth < 8);
  const replyDenied = replies.error?.data?.code === "FORBIDDEN" || replies.error?.data?.code === "UNAUTHORIZED";
  useEffect(() => {
    if (replyDenied) onAccessDenied?.();
  }, [replyDenied, onAccessDenied]);
  const replyItems = replyDenied ? [] : replies.data?.pages.flatMap((page) => page.items) ?? [];
  const knownEmptyBranch = Boolean(replies.data && !replyItems.length && !replies.hasNextPage && !replies.error);
  const replyControlLabel = showReplies
    ? replyItems.length ? "Hide replies" : "Close thread"
    : replyItems.length ? "Show replies" : "Check for replies";
  const showReplyBranch = openedReplies && comment.depth < 8 && Boolean(replyItems.length || replies.hasNextPage || replies.isLoading || replies.error);
  useEffect(() => {
    if (!knownEmptyBranch || !requestedRepliesRef.current) return;
    requestedRepliesRef.current = false;
    requestAnimationFrame(() => (replyButtonRef.current ?? articleRef.current)?.focus());
  }, [knownEmptyBranch]);
  const createdAt = new Date(comment.createdAt);
  const updatedAt = new Date(comment.updatedAt);
  const edited = updatedAt.getTime() > createdAt.getTime() + 1000;
  const editError = commentActionError(update.error, "Your changes could not be saved. Please try again.");
  const deleteError = commentActionError(remove.error, "This comment could not be deleted. Please try again.");

  const toggleReplies = () => {
    requestedRepliesRef.current = !showReplies && !replies.data;
    setOpenedReplies(true);
    setShowReplies((value) => !value);
  };
  const openReply = () => {
    setPostedReply(false);
    setOpenedReplies(true);
    setShowReplies(true);
    setOpenedReplyForm(true);
    setReplying(true);
  };
  const closeReply = () => {
    setReplying(false);
    requestAnimationFrame(() => replyButtonRef.current?.focus());
  };
  const cancelEdit = () => {
    form.reset({ commentId: comment.id, body: comment.body });
    update.reset();
    setEditing(false);
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    void form.handleSubmit(async (values) => {
      try {
        await update.mutateAsync(values);
        setEditing(false);
        requestAnimationFrame(() => menuTriggerRef.current?.focus());
      } catch (error) {
        const code = typeof error === "object" && error !== null && "data" in error
          ? (error as { data?: { code?: string } }).data?.code
          : undefined;
        if (code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND") setEditing(false);
      }
    })(event);
  };

  return (
    <li className="min-w-0">
      <article ref={articleRef} tabIndex={-1} aria-label={`Comment by ${authorName}`} className={`min-w-0 focus-visible:outline-2 focus-visible:outline-focus-ring ${comment.depth ? "py-3.5" : "border-b border-border-subtle py-4"}`}>
        <div className="flex min-w-0 items-start gap-3">
          <UserAvatar name={author.avatarName} className="size-8 sm:size-9" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-5">
              <span className="max-w-full truncate text-sm font-semibold text-text-primary">{authorName}</span>
              {comment.depth > 0 ? <span className="text-text-muted">replied</span> : null}
              <span aria-hidden="true" className="text-text-muted">/</span>
              <time dateTime={createdAt.toISOString()} className="text-text-muted">{dateLabel(createdAt)}</time>
              {edited ? <span className="text-text-muted">Edited</span> : null}
            </div>
            {editing && canManage ? (
              <form onSubmit={onSubmit} className="mt-3 space-y-2.5" noValidate>
                <label htmlFor={`edit-comment-${comment.id}`} className="block text-sm font-semibold text-text-primary">Edit comment</label>
                <textarea
                  id={`edit-comment-${comment.id}`}
                  rows={4}
                  maxLength={5000}
                  disabled={update.isPending}
                  aria-invalid={Boolean(form.formState.errors.body)}
                  aria-describedby={form.formState.errors.body ? `edit-comment-error-${comment.id}` : undefined}
                  className="min-h-28 w-full resize-y rounded-sm border border-border bg-surface px-3 py-2.5 text-sm leading-6 text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
                  {...form.register("body")}
                />
                {form.formState.errors.body ? <p id={`edit-comment-error-${comment.id}`} role="alert" className="text-sm text-danger">Write a comment of up to 5,000 characters.</p> : null}
                {editError ? <p role="alert" className="text-sm text-danger">{editError}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={update.isPending || form.formState.isSubmitting} className="inline-flex min-h-10 items-center rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{update.isPending ? "Saving..." : "Save comment"}</button>
                  <button type="button" onClick={cancelEdit} disabled={update.isPending} className="min-h-10 rounded-sm px-3 text-sm font-medium text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <p className="mt-1.5 whitespace-pre-wrap wrap-anywhere text-[0.94rem] leading-6 text-text-primary"><MentionText text={comment.body} /></p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {canReply ? (
                    <button ref={replyButtonRef} type="button" onClick={replying ? closeReply : openReply} aria-expanded={replying} aria-controls={`reply-form-${comment.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold text-brand-link hover:bg-surface-hover hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring">
                      <CornerDownRight size={14} aria-hidden="true" /> {replying ? "Cancel reply" : "Reply"}
                    </button>
                  ) : null}
                  {comment.depth < 8 && !knownEmptyBranch ? (
                    <button type="button" onClick={toggleReplies} disabled={replies.isLoading && !replies.data} aria-expanded={showReplies} aria-controls={openedReplies ? `replies-${comment.id}` : undefined} className="inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
                      <ChevronDown size={14} className={`transition-transform motion-reduce:transition-none ${showReplies ? "rotate-180" : ""}`} aria-hidden="true" />
                      {replies.isLoading && !replies.data ? "Checking replies..." : replyControlLabel}
                    </button>
                  ) : null}
                </div>
                {knownEmptyBranch && showReplies ? <span role="status" className="sr-only">No replies yet.</span> : null}
              </>
            )}
            {!editing && editError ? <p role="alert" className="mt-2 text-sm text-danger">{editError}</p> : null}
            {deleteError ? <p role="alert" className="mt-2 text-sm text-danger">{deleteError}</p> : null}
            {postedReply ? <p role="status" className="mt-2 text-xs font-medium text-success">Reply posted in this thread.</p> : null}
          </div>
          {canManage && !editing ? (
            <Menu.Root positioning={{ placement: "bottom-end", strategy: "fixed" }}>
              <Menu.Trigger asChild>
                <button ref={menuTriggerRef} type="button" aria-label={`Actions for comment by ${authorName}`} title="Comment actions" disabled={remove.isPending} className="grid size-10 shrink-0 place-items-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
                  {remove.isPending ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Ellipsis size={18} aria-hidden="true" />}
                </button>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content minW="11rem" p="1" bg="surface" borderWidth="1px" borderColor="border" borderRadius="sm" shadow="md" zIndex="popover">
                    <Menu.Item value="edit" onSelect={() => { update.reset(); form.reset({ commentId: comment.id, body: comment.body }); setEditing(true); requestAnimationFrame(() => setFocus("body")); }} color="textPrimary" _highlighted={{ bg: "surfaceHover" }} cursor="pointer" minH="10">
                      <Pencil size={15} aria-hidden="true" /> Edit comment
                    </Menu.Item>
                    <Menu.Item value="delete" onSelect={() => { if (window.confirm("Delete this comment and its replies?")) remove.mutate({ commentId: comment.id }); }} color="danger" _highlighted={{ bg: "surfaceHover" }} cursor="pointer" minH="10">
                      <Trash2 size={15} aria-hidden="true" /> Delete comment
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          ) : null}
        </div>
      </article>

      {openedReplyForm && viewer.canAct ? (
        <div id={`reply-form-${comment.id}`} hidden={!replying} className="thread-reveal ml-4 border-l-2 border-brand-accent bg-surface-subtle px-3 py-4 sm:ml-5 sm:px-5">
          <p className="mb-3 text-xs font-semibold text-brand-link">Replying to {authorName}</p>
          <CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} parentCommentId={comment.id} active={replying} onCancel={closeReply} onCreated={() => { setReplying(false); setPostedReply(true); setShowReplies(true); requestAnimationFrame(() => replyButtonRef.current?.focus()); }} />
        </div>
      ) : null}

      {showReplyBranch ? (
        <div id={`replies-${comment.id}`} hidden={!showReplies} className={`thread-reveal ${comment.depth < 2 ? "ml-3 border-l border-border pl-3 sm:ml-4 sm:pl-5" : "ml-0 border-l border-border-subtle pl-1.5 sm:pl-2"}`}>
          {replies.isLoading && !replies.data ? <p role="status" className="flex items-center gap-2 py-3 text-xs text-text-muted"><LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Checking this thread...</p> : null}
          {replyDenied ? <ErrorState title="Replies unavailable" description="You may no longer have access to this conversation." /> : null}
          {replies.error && !replyDenied && !replies.data ? (
            <div className="space-y-2 py-3">
              <ErrorState title="Could not load replies" description="The thread is temporarily unavailable." />
              <button type="button" onClick={() => void replies.refetch()} className="min-h-10 text-sm font-semibold text-brand-link hover:text-brand-link-hover">Try again</button>
            </div>
          ) : null}
          {replies.error && replies.data && !replyDenied ? <p role="alert" className="py-2 text-sm text-danger">Replies could not be refreshed.</p> : null}
          {replyItems.length ? <ul>{replyItems.map((reply) => <CommentThread key={reply.id} comment={reply} discussionId={discussionId} workspaceId={workspaceId} viewer={viewer} onAccessDenied={onAccessDenied} />)}</ul> : null}
          {replies.hasNextPage && !replyDenied ? (
            <button type="button" onClick={() => void replies.fetchNextPage()} disabled={replies.isFetchingNextPage} className="my-2 min-h-10 rounded-sm px-2 text-xs font-semibold text-brand-link hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
              {replies.isFetchingNextPage ? "Loading replies..." : replies.isFetchNextPageError ? "Retry loading replies" : "Load more replies"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function CommentList({ discussionId, workspaceId, viewer, query, onAccessDenied }: { discussionId: string; workspaceId: string; viewer: Viewer; query: ReturnType<typeof useCommentList>; onAccessDenied?: () => void }) {
  const denied = query.error?.data?.code === "FORBIDDEN" || query.error?.data?.code === "UNAUTHORIZED";
  if (denied) return <ErrorState title="Conversation access restricted" description="You may no longer have access to these comments." />;
  if (query.isLoading && !query.data) return <CommentSkeleton label="Loading comments" />;
  if (query.error && !query.data) {
    return <div className="space-y-2"><ErrorState title="Could not load comments" description="The conversation is temporarily unavailable." /><button type="button" onClick={() => void query.refetch()} className="min-h-10 text-sm font-semibold text-brand-link hover:text-brand-link-hover">Try again</button></div>;
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div>
      {query.error && query.data ? <p role="alert" className="mb-3 text-sm text-danger">Comments could not be refreshed.</p> : null}
      {!items.length && !query.error ? (
        <div className="border-y border-border-subtle py-7">
          <MessageCircle size={22} className="text-brand-link" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-text-primary">The conversation starts here.</p>
          <p className="mt-1 text-sm text-text-secondary">Add the first response below.</p>
        </div>
      ) : null}
      {items.length ? <ul className="border-t border-border-subtle">{items.map((comment) => <CommentThread key={comment.id} comment={comment} discussionId={discussionId} workspaceId={workspaceId} viewer={viewer} onAccessDenied={onAccessDenied} />)}</ul> : null}
      {query.hasNextPage ? (
        <div className="border-b border-border-subtle py-4">
          <button type="button" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage} className="min-h-11 rounded-sm border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
            {query.isFetchingNextPage ? "Loading comments..." : query.isFetchNextPageError ? "Retry loading comments" : "Load more comments"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
