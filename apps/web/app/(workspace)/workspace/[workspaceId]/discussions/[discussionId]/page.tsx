"use client";

import { Menu, Portal } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Ellipsis, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";

import { updateDiscussionInputSchema, type UpdateDiscussionInput } from "@repo/validators/discussion";
import { CommentList } from "@/components/comment/CommentList";
import { CreateCommentForm } from "@/components/comment/CreateCommentForm";
import { discussionActionError } from "@/components/discussion/discussionErrors";
import { EditedButton } from "@/components/discussion/EditHistory";
import { useCommentList } from "@/hooks/useComment";
import { MentionTextarea } from "@/components/common/MentionTextarea";
import { MarkdownField } from "@/components/common/MarkdownField";
import { Markdown } from "@/components/common/Markdown";
import { AttachmentComposer } from "@/components/files/AttachmentComposer";
import { Attachments } from "@/components/files/Attachments";
import { uploadBlocker, useUploader } from "@/hooks/useAttachments";
import { ReactionBar } from "@/components/common/ReactionBar";
import { FollowControl } from "@/components/discussion/FollowControl";
import { SaveButton } from "@/components/common/SaveButton";
import { useDiscussionReactions } from "@/hooks/useReactions";
import { ErrorState } from "@/components/common/StateNotice";
import { UserAvatar } from "@/components/common/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { useDiscussionActions, useDiscussionDetail } from "@/hooks/useDiscussion";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";
import { resolveUserIdentity } from "@/lib/user-identity";
import { CreateDecisionForm } from "@/components/decision/CreateDecisionForm";
import { timeAgo } from "@/components/activity/RecentActivity";
import { DiscussionContext } from "@/components/discussion/DiscussionContext";
import { TopBarActions } from "@/components/shell/TopBarActions";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/Canopy";
import { floatPanelClasses, menuItemClasses } from "@/components/ui/overlay";
import { useDiscussionContext } from "@/hooks/useDiscussion";

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function DiscussionSkeleton() {
  return (
    <div role="status" aria-label="Loading discussion" className="w-full max-w-[52rem] animate-pulse">
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

function DiscussionReactions({ workspaceId, discussionId }: { workspaceId: string; discussionId: string }) {
  const reactions = useDiscussionReactions(workspaceId, discussionId);
  return <ReactionBar workspaceId={workspaceId} discussionId={discussionId} reactions={reactions.data?.discussion ?? []} disabled={!reactions.data} />;
}

export default function DiscussionDetailPage() {
  const { workspaceId, discussionId } = useParams<{ workspaceId: string; discussionId: string }>();
  const router = useRouter();
  const discussion = useDiscussionDetail(discussionId);
  const workspace = useWorkspaceDetail(workspaceId);
  const { user } = useAuth();
  const { update, remove } = useDiscussionActions(workspaceId);
  const discussionDenied = [discussion.error?.data?.code, workspace.error?.data?.code]
    .some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED");
  const workspaceMismatch = Boolean(discussion.data && discussion.data.workspaceId !== workspaceId);
  const panel = useDiscussionContext(workspaceId, discussionId, Boolean(discussion.data && !discussionDenied && !workspaceMismatch));
  const comments = useCommentList(discussionId, undefined, Boolean(discussion.data && !discussionDenied && !workspaceMismatch && discussion.error?.data?.code !== "NOT_FOUND"));
  const [editing, setEditing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const proposeButtonRef = useRef<HTMLButtonElement>(null);
  const [threadAccessDenied, setThreadAccessDenied] = useState(false);
  const handleThreadAccessDenied = useCallback(() => setThreadAccessDenied(true), []);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const form = useForm<UpdateDiscussionInput>({
    resolver: zodResolver(updateDiscussionInputSchema),
    defaultValues: { discussionId, title: "", body: "" },
    shouldFocusError: true,
  });
  const editBody = useWatch({ control: form.control, name: "body" });
  const uploader = useUploader(workspaceId);
  const [filesProblem, setFilesProblem] = useState<string | null>(null);
  const role = workspace.data?.viewerRole;
  const canManageOthers = role === "OWNER" || role === "ADMIN";
  const denied = threadAccessDenied || discussionDenied || comments.error?.data?.code === "FORBIDDEN" || comments.error?.data?.code === "UNAUTHORIZED";
  const missing = workspaceMismatch || workspace.error?.data?.code === "NOT_FOUND" || discussion.error?.data?.code === "NOT_FOUND";
  const canAct = Boolean(user && workspace.data && !workspace.error && !denied && !missing);
  const canManage = Boolean(canAct && discussion.data && (discussion.data.author?.id === user?.id || canManageOthers));

  const openEdit = () => {
    if (!discussion.data) return;
    update.reset();
    form.reset({ discussionId, title: discussion.data.title, body: discussion.data.body });
    uploader.reset(discussion.data.attachments);
    setFilesProblem(null);
    setEditing(true);
    requestAnimationFrame(() => form.setFocus("title"));
  };
  const cancelEdit = () => {
    setEditing(false);
    update.reset();
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const problem = uploadBlocker(uploader);
    setFilesProblem(problem);
    if (problem) {
      event.preventDefault();
      return;
    }
    void form.handleSubmit(async (values) => {
      try {
        await update.mutateAsync({ ...values, attachmentIds: uploader.attachmentIds });
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
  const toggleProposal = (open: boolean) => {
    setProposing(open);
    if (open) requestAnimationFrame(() => {
      const section = document.getElementById("decision-proposal");
      section?.scrollIntoView?.({ block: "start" });
    });
    else requestAnimationFrame(() => proposeButtonRef.current?.focus());
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

  if (denied) return <div className="max-w-[52rem] py-8"><ErrorState title="Discussion access restricted" description="You may no longer have access to this conversation." /></div>;
  if (discussion.isLoading && !discussion.data) return <DiscussionSkeleton />;
  if (missing || (!discussion.data && !discussion.isLoading)) {
    return <div className="max-w-[52rem] space-y-4 py-8"><ErrorState title={missing ? "Discussion unavailable" : "Could not load discussion"} description={missing ? "This conversation may have been removed." : "Please try again in a moment."} onRetry={missing ? undefined : () => void discussion.refetch()} retrying={discussion.isFetching} /><Link href={`/workspace/${workspaceId}/discussions`} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-link hover:text-brand-link-hover"><ArrowLeft size={16} aria-hidden="true" /> Back to discussions</Link></div>;
  }
  if (!discussion.data) return null;

  const author = resolveUserIdentity(discussion.data.author);
  const createdAt = new Date(discussion.data.createdAt);
  const updatedAt = new Date(discussion.data.updatedAt);
  const updateError = discussionActionError(update.error, "Your changes could not be saved. Please try again.");
  const removeError = discussionActionError(remove.error, "This discussion could not be deleted. Please try again.");

  const replies = panel.data?.replies;
  const files = discussion.data.attachments.length;

  return (
    <div className="min-w-0">
      {canAct ? <TopBarActions>
        {/* On phones Save and Follow sit under the title, so the bar fits. */}
        <span className="hidden sm:contents">
          <SaveButton workspaceId={workspaceId} target={{ discussionId }} label="discussion" />
          <FollowControl workspaceId={workspaceId} discussionId={discussionId} />
        </span>
        <Button ref={proposeButtonRef} variant={proposing ? "secondary" : "primary"} aria-expanded={proposing} aria-controls="decision-proposal-form" onClick={() => toggleProposal(!proposing)} icon={proposing ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}>{proposing ? "Close proposal" : "Propose decision"}</Button>
        {canManage ? (
          <Menu.Root positioning={{ placement: "bottom-end", strategy: "fixed" }}>
            <Menu.Trigger asChild>
              <button ref={menuTriggerRef} type="button" aria-label="Discussion actions" title="Discussion actions" disabled={remove.isPending || update.isPending} className="grid size-9 shrink-0 place-items-center rounded-[9px] text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
                {remove.isPending ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Ellipsis size={18} aria-hidden="true" />}
              </button>
            </Menu.Trigger>
            <Portal><Menu.Positioner className="z-50"><Menu.Content unstyled className={`${floatPanelClasses} min-w-48 p-1`}>
              <Menu.Item value="edit" onSelect={openEdit} unstyled className={`${menuItemClasses} cursor-pointer`}><Pencil size={15} aria-hidden="true" /> Edit discussion</Menu.Item>
              <Menu.Item value="delete" onSelect={() => void onDelete()} unstyled className={`${menuItemClasses} cursor-pointer !text-danger`}><Trash2 size={15} aria-hidden="true" /> Delete discussion</Menu.Item>
            </Menu.Content></Menu.Positioner></Portal>
          </Menu.Root>
        ) : null}
      </TopBarActions> : null}

      <div className="flex min-w-0 flex-col gap-8 min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:gap-0">
        <div className="min-w-0 flex-1 min-[1100px]:pr-10">
          <article className="canopy-rise border-b border-border-subtle pb-7">
            <p className="type-canopy-label m-0 text-xs tracking-[0.06em]">Discussion · opened <time dateTime={createdAt.toISOString()} title={dateLabel(createdAt)}>{timeAgo(createdAt)}</time></p>
            <h1 className="type-canopy-title mt-2 text-[2.35rem] wrap-anywhere sm:text-[2.875rem]">{discussion.data.title}</h1>
            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-text-muted">
              <UserAvatar name={author.avatarName} photo={author.photo} className="size-[26px] text-[10px]" />
              <span className="font-medium text-text-primary">{author.label}</span>
              {replies !== undefined ? <><span aria-hidden="true">·</span><span>{replies} {replies === 1 ? "reply" : "replies"}</span></> : null}
              {files ? <><span aria-hidden="true">·</span><span>{files} {files === 1 ? "file" : "files"}</span></> : null}
              {discussion.data.editCount ? <><span aria-hidden="true">·</span><EditedButton target={{ discussionId }} at={updatedAt} /></> : null}
            </div>
            {canAct ? <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
              <SaveButton workspaceId={workspaceId} target={{ discussionId }} label="discussion" />
              <FollowControl workspaceId={workspaceId} discussionId={discussionId} />
            </div> : null}

            {editing && canManage ? (
              <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6" noValidate>
                <div>
                  <label htmlFor="edit-discussion-title" className="block text-sm font-semibold text-text-primary">Title</label>
                  <input id="edit-discussion-title" maxLength={120} disabled={update.isPending} aria-invalid={Boolean(form.formState.errors.title)} aria-describedby={form.formState.errors.title ? "edit-discussion-title-error" : undefined} className="mt-2 min-h-11 w-full rounded-[10px] border border-control-border bg-surface px-3 text-base text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60" {...form.register("title")} />
                  {form.formState.errors.title ? <p id="edit-discussion-title-error" role="alert" className="mt-1 text-sm text-danger">Use a title between 3 and 120 characters.</p> : null}
                </div>
                <div>
                  <label htmlFor="edit-discussion-body" className="block text-sm font-semibold text-text-primary">Context</label>
                  <AttachmentComposer uploader={uploader} disabled={update.isPending}>
                  <MarkdownField>
                  <MentionTextarea workspaceId={workspaceId} registration={form.register("body")} value={editBody ?? ""} onInsert={(value) => form.setValue("body", value, { shouldDirty: true, shouldValidate: true })} id="edit-discussion-body" rows={7} maxLength={5000} disabled={update.isPending} aria-invalid={Boolean(form.formState.errors.body)} aria-describedby={form.formState.errors.body ? "edit-discussion-body-error" : undefined} className="mt-2 min-h-36 w-full resize-y rounded-[10px] border border-control-border bg-surface px-3 py-2.5 text-sm leading-6 text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60" />
                  </MarkdownField>
                  </AttachmentComposer>
                  {filesProblem ? <p role="alert" className="mt-1 text-sm text-danger">{filesProblem}</p> : null}
                  {form.formState.errors.body ? <p id="edit-discussion-body-error" role="alert" className="mt-1 text-sm text-danger">Add context of up to 5,000 characters.</p> : null}
                </div>
                {updateError ? <p role="alert" className="text-sm text-danger">{updateError}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" variant="primary" disabled={update.isPending || form.formState.isSubmitting}>{update.isPending ? "Saving..." : "Save changes"}</Button>
                  <Button variant="ghost" onClick={cancelEdit} disabled={update.isPending}>Cancel</Button>
                </div>
              </form>
            ) : (
              <>
                <div className="mt-5 max-w-[72ch] text-[0.9375rem] leading-[1.7] text-text-secondary">{discussion.data.body ? <Markdown text={discussion.data.body} /> : <p>This discussion has no content.</p>}<Attachments attachments={discussion.data.attachments} /></div>
                <div className="mt-4"><DiscussionReactions workspaceId={workspaceId} discussionId={discussionId} /></div>
              </>
            )}
            {!editing && updateError ? <p role="alert" className="mt-5 text-sm text-danger">{updateError}</p> : null}
            {removeError ? <p role="alert" className="mt-5 text-sm text-danger">{removeError}</p> : null}
            {discussion.error && discussion.data ? <p role="alert" className="mt-5 text-sm text-danger">This discussion could not be refreshed.</p> : null}
          </article>

          {canAct ? <section id="decision-proposal" aria-labelledby="decision-proposal-heading" hidden={!proposing} className="canopy-rise mt-6 scroll-mt-24 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-7">
            <SectionLabel as="p">Carry the reasoning forward</SectionLabel>
            <h2 id="decision-proposal-heading" className="mt-1.5 font-serif text-[1.75rem] leading-tight text-text-primary">Propose a decision</h2>
            <p className="mt-1.5 max-w-[60ch] text-sm leading-6 text-text-secondary">Capture the question, proposed outcome, and why it matters while this conversation is fresh.</p>
            <div id="decision-proposal-form" className="mt-5">
              <CreateDecisionForm workspaceId={workspaceId} discussionId={discussionId} discussionTitle={discussion.data.title} onCancel={() => toggleProposal(false)} />
            </div>
          </section> : null}

          <section aria-labelledby="conversation-heading" className="pt-6">
            <SectionLabel id="conversation-heading" className="mb-1">Conversation{replies !== undefined ? ` · ${replies} ${replies === 1 ? "reply" : "replies"}` : ""}</SectionLabel>
            <CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={{ id: user?.id, canAct, canManageOthers }} query={comments} onAccessDenied={handleThreadAccessDenied} />
          </section>

          {canAct ? (
            <section id="add-comment" aria-labelledby="add-comment-heading" className={`glass-float z-10 mt-6 rounded-2xl border p-3 ${proposing || editing ? "" : "lg:sticky lg:bottom-5"}`}>
              <h2 id="add-comment-heading" className="sr-only">Add your perspective</h2>
              <CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} floating />
            </section>
          ) : null}
        </div>

        <DiscussionContext
          workspaceId={workspaceId}
          discussionId={discussionId}
          files={discussion.data.attachments}
          canPropose={canAct && !proposing}
          onPropose={() => toggleProposal(true)}
        />
      </div>
    </div>
  );
}
