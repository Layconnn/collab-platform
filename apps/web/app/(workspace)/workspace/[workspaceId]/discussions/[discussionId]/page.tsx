"use client";

import { Menu, Portal } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Ellipsis, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";

import { updateDiscussionInputSchema, type UpdateDiscussionInput } from "@repo/validators/discussion";
import { CommentList } from "@/components/comment/CommentList";
import { CreateCommentForm } from "@/components/comment/CreateCommentForm";
import { useCommentList } from "@/hooks/useComment";
import { MentionText } from "@/components/common/MentionText";
import { ErrorState } from "@/components/common/StateNotice";
import { UserAvatar } from "@/components/common/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useDiscussionActions, useDiscussionDetail } from "@/hooks/useDiscussion";
import { useWorkspaceDetail, useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { resolveUserIdentity } from "@/lib/user-identity";

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function actionError(error: { data?: { code?: string } | null } | null, fallback: string) {
  if (!error) return null;
  if (error.data?.code === "FORBIDDEN" || error.data?.code === "UNAUTHORIZED") return "Your workspace access changed. Refresh before trying again.";
  if (error.data?.code === "NOT_FOUND") return "This discussion is no longer available.";
  return fallback;
}

function DiscussionSkeleton() {
  return (
    <div role="status" aria-label="Loading discussion" className="mx-auto w-full max-w-[52rem] animate-pulse py-4">
      <span className="sr-only">Loading discussion...</span>
      <div aria-hidden="true">
        <div className="h-4 w-36 rounded-sm bg-surface-active" />
        <div className="mt-10 h-9 w-[min(38rem,85%)] rounded-sm bg-surface-active" />
        <div className="mt-3 h-9 w-[min(25rem,65%)] rounded-sm bg-surface-active" />
        <div className="mt-6 flex items-center gap-3"><div className="size-9 rounded-full bg-surface-active" /><div className="h-4 w-48 rounded-sm bg-surface-subtle" /></div>
        <div className="mt-10 space-y-3 border-b border-border-subtle pb-12">
          <div className="h-4 w-full rounded-sm bg-surface-subtle" />
          <div className="h-4 w-[92%] rounded-sm bg-surface-subtle" />
          <div className="h-4 w-[70%] rounded-sm bg-surface-subtle" />
        </div>
        <div className="mt-10 h-6 w-40 rounded-sm bg-surface-active" />
      </div>
    </div>
  );
}

export default function DiscussionDetailPage() {
  const { workspaceId, discussionId } = useParams<{ workspaceId: string; discussionId: string }>();
  const router = useRouter();
  const discussion = useDiscussionDetail(discussionId);
  const workspace = useWorkspaceDetail(workspaceId);
  const { user } = useAuth();
  const workspaces = useWorkspaceSwitcherList(Boolean(user));
  const { update, remove } = useDiscussionActions(workspaceId);
  const discussionDenied = [discussion.error?.data?.code, workspace.error?.data?.code]
    .some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED");
  const workspaceMismatch = Boolean(discussion.data && discussion.data.workspaceId !== workspaceId);
  const comments = useCommentList(discussionId, undefined, Boolean(discussion.data && !discussionDenied && !workspaceMismatch && discussion.error?.data?.code !== "NOT_FOUND"));
  const [editing, setEditing] = useState(false);
  const [threadAccessDenied, setThreadAccessDenied] = useState(false);
  const handleThreadAccessDenied = useCallback(() => setThreadAccessDenied(true), []);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const form = useForm<UpdateDiscussionInput>({
    resolver: zodResolver(updateDiscussionInputSchema),
    defaultValues: { discussionId, title: "", body: "" },
    shouldFocusError: true,
  });
  const listedRole = !workspaces.error && workspaces.data?.pages
    .flatMap((page) => page.items)
    .find((item) => item.workspaceId === workspaceId)?.role;
  const role = workspace.data?.ownerId === user?.id ? "OWNER" : listedRole;
  const canManageOthers = role === "OWNER" || role === "ADMIN";
  const denied = threadAccessDenied || discussionDenied || comments.error?.data?.code === "FORBIDDEN" || comments.error?.data?.code === "UNAUTHORIZED";
  const missing = workspaceMismatch || discussion.error?.data?.code === "NOT_FOUND";
  const canAct = Boolean(user && workspace.data && !workspace.error && !denied && !missing);
  const canManage = Boolean(canAct && discussion.data && (discussion.data.author?.id === user?.id || canManageOthers));

  const openEdit = () => {
    if (!discussion.data) return;
    update.reset();
    form.reset({ discussionId, title: discussion.data.title, body: discussion.data.body });
    setEditing(true);
    requestAnimationFrame(() => form.setFocus("title"));
  };
  const cancelEdit = () => {
    setEditing(false);
    update.reset();
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
  const onDelete = async () => {
    if (!window.confirm("Delete this discussion and its comments?")) return;
    try {
      await remove.mutateAsync({ discussionId });
      router.replace(`/workspace/${workspaceId}/discussions`);
    } catch {
      // Keep the discussion visible with a safe error below the header.
    }
  };

  if (denied) return <div className="mx-auto max-w-[52rem] py-8"><ErrorState title="Discussion access restricted" description="You may no longer have access to this conversation." /></div>;
  if (discussion.isLoading && !discussion.data) return <DiscussionSkeleton />;
  if (missing || (!discussion.data && !discussion.isLoading)) {
    return <div className="mx-auto max-w-[52rem] space-y-4 py-8"><ErrorState title={missing ? "Discussion unavailable" : "Could not load discussion"} description={missing ? "This conversation may have been removed." : "Please try again in a moment."} /><Link href={`/workspace/${workspaceId}/discussions`} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-link hover:text-brand-link-hover"><ArrowLeft size={16} aria-hidden="true" /> Back to discussions</Link></div>;
  }
  if (!discussion.data) return null;

  const author = resolveUserIdentity(discussion.data.author);
  const createdAt = new Date(discussion.data.createdAt);
  const updatedAt = new Date(discussion.data.updatedAt);
  const wasUpdated = updatedAt.getTime() > createdAt.getTime() + 1000;
  const updateError = actionError(update.error, "Your changes could not be saved. Please try again.");
  const removeError = actionError(remove.error, "This discussion could not be deleted. Please try again.");

  return (
    <main className="mx-auto w-full min-w-0 max-w-[52rem] pb-16">
      <Link href={`/workspace/${workspaceId}/discussions`} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-link hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring"><ArrowLeft size={16} aria-hidden="true" /> Back to discussions</Link>

      <article className="mt-6 border-b border-border pb-8 sm:pb-10">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase text-brand-link">Discussion</p>
            <h1 className="mt-3 wrap-anywhere text-[1.85rem] font-semibold leading-tight text-text-primary sm:text-[2.35rem]">{discussion.data.title}</h1>
          </div>
          {canManage ? (
            <Menu.Root positioning={{ placement: "bottom-end", strategy: "fixed" }}>
              <Menu.Trigger asChild>
                <button ref={menuTriggerRef} type="button" aria-label="Discussion actions" title="Discussion actions" disabled={remove.isPending || update.isPending} className="grid size-11 shrink-0 place-items-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
                  {remove.isPending ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Ellipsis size={19} aria-hidden="true" />}
                </button>
              </Menu.Trigger>
              <Portal><Menu.Positioner><Menu.Content minW="12rem" p="1" bg="surface" borderWidth="1px" borderColor="border" borderRadius="sm" shadow="md" zIndex="popover">
                <Menu.Item value="edit" onSelect={openEdit} color="textPrimary" _highlighted={{ bg: "surfaceHover" }} cursor="pointer" minH="10"><Pencil size={15} aria-hidden="true" /> Edit discussion</Menu.Item>
                <Menu.Item value="delete" onSelect={() => void onDelete()} color="danger" _highlighted={{ bg: "surfaceHover" }} cursor="pointer" minH="10"><Trash2 size={15} aria-hidden="true" /> Delete discussion</Menu.Item>
              </Menu.Content></Menu.Positioner></Portal>
            </Menu.Root>
          ) : null}
        </div>
        <div className="mt-6 flex min-w-0 items-center gap-3">
          <UserAvatar name={author.avatarName} className="size-9" />
          <div className="min-w-0 text-sm leading-5">
            <span className="block truncate font-semibold text-text-primary">{author.label}</span>
            <span className="block text-xs text-text-muted"><time dateTime={createdAt.toISOString()}>{dateLabel(createdAt)}</time>{wasUpdated ? <> / Updated <time dateTime={updatedAt.toISOString()}>{dateLabel(updatedAt)}</time></> : null}</span>
          </div>
        </div>

        {editing && canManage ? (
          <form onSubmit={onSubmit} className="mt-8 space-y-4 border-l-2 border-brand-accent bg-surface-subtle px-4 py-5 sm:px-6" noValidate>
            <div>
              <label htmlFor="edit-discussion-title" className="block text-sm font-semibold text-text-primary">Title</label>
              <input id="edit-discussion-title" maxLength={120} disabled={update.isPending} aria-invalid={Boolean(form.formState.errors.title)} aria-describedby={form.formState.errors.title ? "edit-discussion-title-error" : undefined} className="mt-2 min-h-11 w-full rounded-sm border border-border bg-surface px-3 text-base text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60" {...form.register("title")} />
              {form.formState.errors.title ? <p id="edit-discussion-title-error" role="alert" className="mt-1 text-sm text-danger">Use a title between 3 and 120 characters.</p> : null}
            </div>
            <div>
              <label htmlFor="edit-discussion-body" className="block text-sm font-semibold text-text-primary">Context</label>
              <textarea id="edit-discussion-body" rows={7} maxLength={5000} disabled={update.isPending} aria-invalid={Boolean(form.formState.errors.body)} aria-describedby={form.formState.errors.body ? "edit-discussion-body-error" : undefined} className="mt-2 min-h-36 w-full resize-y rounded-sm border border-border bg-surface px-3 py-2.5 text-sm leading-6 text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60" {...form.register("body")} />
              {form.formState.errors.body ? <p id="edit-discussion-body-error" role="alert" className="mt-1 text-sm text-danger">Add context of up to 5,000 characters.</p> : null}
            </div>
            {updateError ? <p role="alert" className="text-sm text-danger">{updateError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={update.isPending || form.formState.isSubmitting} className="min-h-11 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{update.isPending ? "Saving..." : "Save changes"}</button>
              <button type="button" onClick={cancelEdit} disabled={update.isPending} className="min-h-11 rounded-sm px-3 text-sm font-medium text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="mt-8 whitespace-pre-wrap wrap-anywhere text-[0.96rem] leading-7 text-text-secondary sm:text-base"><MentionText text={discussion.data.body || "This discussion has no content."} /></div>
        )}
        {!editing && updateError ? <p role="alert" className="mt-5 text-sm text-danger">{updateError}</p> : null}
        {removeError ? <p role="alert" className="mt-5 text-sm text-danger">{removeError}</p> : null}
        {discussion.error && discussion.data ? <p role="alert" className="mt-5 text-sm text-danger">This discussion could not be refreshed.</p> : null}
      </article>

      <section aria-labelledby="conversation-heading" className="pt-8 sm:pt-10">
        <div className="mb-5 flex items-end justify-between gap-4 border-b border-border-subtle pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-brand-link">Conversation</p>
            <h2 id="conversation-heading" className="mt-1 text-xl font-semibold text-text-primary sm:text-2xl">The discussion continues</h2>
          </div>
        </div>
        <CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={{ id: user?.id, canAct, canManageOthers }} query={comments} onAccessDenied={handleThreadAccessDenied} />
      </section>

      {canAct ? (
        <section id="add-comment" aria-labelledby="add-comment-heading" className="mt-8 border-t border-border-subtle pt-6 sm:mt-10">
          <h2 id="add-comment-heading" className="mb-4 text-lg font-semibold text-text-primary">Add your perspective</h2>
          <CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} />
        </section>
      ) : null}
    </main>
  );
}
