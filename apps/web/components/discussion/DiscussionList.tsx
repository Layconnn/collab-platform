"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Ellipsis, LoaderCircle, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { Menu, Portal } from "@chakra-ui/react";

import { updateDiscussionInputSchema, type UpdateDiscussionInput } from "@repo/validators/discussion";
import { ErrorState } from "@/components/common/StateNotice";
import { DiscussionRow, type DiscussionSummary } from "@/components/discussion/DiscussionRow";
import { discussionActionError } from "@/components/discussion/discussionErrors";
import { useAuth } from "@/hooks/useAuth";
import { useDiscussionActions, useDiscussionList } from "@/hooks/useDiscussion";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";
import { floatPanelClasses, menuItemClasses } from "@/components/ui/overlay";
import { Button } from "@/components/ui/Button";

function DiscussionEntry({ discussion, workspaceId, canManage }: { discussion: DiscussionSummary; workspaceId: string; canManage: boolean }) {
  const { update, remove } = useDiscussionActions(workspaceId);
  const [editing, setEditing] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const form = useForm<UpdateDiscussionInput>({
    resolver: zodResolver(updateDiscussionInputSchema),
    defaultValues: { discussionId: discussion.id, title: discussion.title },
    shouldFocusError: true,
  });
  const cancelEdit = () => {
    form.reset({ discussionId: discussion.id, title: discussion.title });
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
        if (typeof error === "object" && error !== null && "data" in error) {
          const code = (error as { data?: { code?: string } }).data?.code;
          if (code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND") {
            setEditing(false);
          }
        }
        // Other mutation errors remain visible without discarding the edit.
      }
    })(event);
  };

  if (editing && canManage) {
    return (
      <li className="border-t border-border-subtle bg-surface-subtle px-4 py-5 first:border-t-0 sm:px-5">
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <label htmlFor={`edit-discussion-${discussion.id}`} className="block text-sm font-semibold text-text-primary">Edit discussion title</label>
          <input
            id={`edit-discussion-${discussion.id}`}
            aria-invalid={Boolean(form.formState.errors.title)}
            aria-describedby={form.formState.errors.title ? `edit-discussion-error-${discussion.id}` : undefined}
            className="min-h-10 w-full rounded-[10px] border border-control-border bg-surface px-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
            maxLength={120}
            {...form.register("title")}
          />
          {form.formState.errors.title ? <p id={`edit-discussion-error-${discussion.id}`} role="alert" className="text-sm text-danger">Please add a clear title within the allowed length.</p> : null}
          {update.error ? <p role="alert" className="text-sm text-danger">{discussionActionError(update.error, "Your changes could not be saved. Please try again.")}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" disabled={update.isPending || form.formState.isSubmitting}>{update.isPending ? "Saving..." : "Save title"}</Button>
            <Button variant="ghost" disabled={update.isPending} onClick={cancelEdit}>Cancel</Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <DiscussionRow
      discussion={discussion}
      workspaceId={workspaceId}
      error={discussionActionError(remove.error, "This discussion could not be deleted. Please try again.") ?? discussionActionError(update.error, "Your changes could not be saved. Please try again.") ?? undefined}
      actions={canManage ? (
        <Menu.Root positioning={{ placement: "bottom-end", strategy: "fixed" }}>
          <Menu.Trigger asChild>
            <button ref={menuTriggerRef} type="button" aria-label={`Actions for ${discussion.title}`} title="Discussion actions" disabled={remove.isPending} className="grid size-9 place-items-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
              {remove.isPending ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Ellipsis size={18} aria-hidden="true" />}
            </button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner className="z-50">
              <Menu.Content unstyled className={`${floatPanelClasses} min-w-44 p-1`}>
                <Menu.Item value="edit" onSelect={() => { update.reset(); form.reset({ discussionId: discussion.id, title: discussion.title }); setEditing(true); requestAnimationFrame(() => form.setFocus("title")); }} unstyled className={`${menuItemClasses} cursor-pointer`}>
                  <Pencil size={15} aria-hidden="true" /> Edit title
                </Menu.Item>
                <Menu.Item value="delete" onSelect={() => { if (window.confirm("Delete this discussion and its comments?")) remove.mutate({ discussionId: discussion.id }); }} unstyled className={`${menuItemClasses} cursor-pointer !text-danger`}>
                  <Trash2 size={15} aria-hidden="true" /> Delete discussion
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      ) : undefined}
    />
  );
}

function DiscussionSkeleton() {
  return (
    <div role="status" aria-label="Loading discussions" className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
      <span className="sr-only">Loading discussions...</span>
      {[1, 2, 3, 4].map((item) => (
        <div key={item} aria-hidden="true" className="flex items-center gap-3 border-t border-border-subtle px-5 py-4 first:border-t-0">
          <span className="size-9 shrink-0 animate-pulse rounded-full bg-surface-active" />
          <span className="min-w-0 flex-1 space-y-3">
            <span className="block h-4 w-[min(28rem,82%)] animate-pulse rounded-sm bg-surface-active" />
            <span className="block h-3 w-36 animate-pulse rounded-sm bg-surface-subtle" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function DiscussionList({ workspaceId, query, onCreate, accessDenied = false }: {
  workspaceId: string;
  query: ReturnType<typeof useDiscussionList>;
  onCreate: () => void;
  accessDenied?: boolean;
}) {
  const { user } = useAuth();
  const workspace = useWorkspaceDetail(workspaceId, Boolean(user));
  const role = workspace.data?.viewerRole;
  const canManageOthers = role === "OWNER" || role === "ADMIN";
  const denied = accessDenied || workspace.error?.data?.code === "FORBIDDEN" || workspace.error?.data?.code === "UNAUTHORIZED" || query.error?.data?.code === "FORBIDDEN" || query.error?.data?.code === "UNAUTHORIZED";
  if (denied) {
    return <div className="space-y-4"><ErrorState title="Discussion access restricted" description="You may no longer have access to this workspace's discussions." /><Link href="/workspace" className="inline-flex min-h-10 items-center font-semibold text-brand-link hover:text-brand-link-hover">All workspaces</Link></div>;
  }
  if (query.isLoading && !query.data) return <DiscussionSkeleton />;
  if (query.error && !query.data) {
    return <div className="space-y-3"><ErrorState title="Could not load discussions" description="The conversation list is temporarily unavailable." /><button type="button" onClick={() => void query.refetch()} className="min-h-10 font-semibold text-brand-link hover:text-brand-link-hover">Try again</button></div>;
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div>
      {query.error && query.data ? (
        <div className="mb-4 space-y-2">
          <ErrorState title={query.isFetchNextPageError ? "Could not load more discussions" : "Could not refresh discussions"} description="The discussions already on this page are still available." />
          <button type="button" onClick={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())} className="min-h-10 font-semibold text-brand-link hover:text-brand-link-hover">Try again</button>
        </div>
      ) : null}
      {!items.length && !query.error ? (
        <div className="canopy-rise rounded-2xl border border-dashed border-border px-6 py-10 sm:px-10 sm:py-14">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-callout text-brand-link"><MessageSquareText size={21} /></span>
          <h3 className="mt-5 font-serif text-[1.75rem] leading-tight text-text-primary">Start with the question worth keeping.</h3>
          <p className="mt-2 max-w-[50ch] text-sm leading-6 text-text-secondary">Share an update or open a question. Replies will stay with the discussion so the next person can pick up the context.</p>
          <Button variant="primary" className="mt-5" onClick={onCreate} icon={<Plus size={16} aria-hidden="true" />}>Start the first discussion</Button>
        </div>
      ) : null}
      {items.length ? <ol aria-label="Discussions" className="canopy-rise overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">{items.map((discussion) => (
        <DiscussionEntry
          key={discussion.id}
          discussion={discussion}
          workspaceId={workspaceId}
          canManage={Boolean(user && workspace.data && !workspace.error && (discussion.author?.id === user.id || canManageOthers))}
        />
      ))}</ol> : null}
      {query.hasNextPage && !query.isFetchNextPageError ? (
        <div className="flex justify-center py-5">
          <Button variant="secondary" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} icon={query.isFetchingNextPage ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}>
            {query.isFetchingNextPage ? "Loading discussions..." : "Load more discussions"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
