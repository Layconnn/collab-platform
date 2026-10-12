"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowLeft,
  Crown,
  Ellipsis,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Menu, Portal } from "@chakra-ui/react";

import type { AppRouter } from "@/server/api/root";
import { AddMemberForm } from "@/components/workspace/AddMemberForm";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceDetail } from "@/hooks/useWorkspace";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { ErrorState } from "@/components/common/StateNotice";
import { UserAvatar } from "@/components/common/UserAvatar";
import { resolveUserIdentity } from "@/lib/user-identity";
import { workspaceInitials } from "@/lib/workspace-identity";

type Member =
  inferRouterOutputs<AppRouter>["workspace"]["listMembers"]["items"][number];
type ConfirmAction = { kind: "remove" | "transfer"; member: Member };

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "data" in error
    ? (error as { data?: { code?: string } }).data?.code
    : undefined;
}

function memberDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function roleStyle(role: Member["role"]): string {
  return role === "OWNER"
    ? "bg-warning/10 text-warning"
    : role === "ADMIN"
      ? "bg-info/10 text-info"
      : "bg-surface-subtle text-text-secondary";
}

export function WorkspaceMembersPanel({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { user } = useAuth();
  const workspace = useWorkspaceDetail(workspaceId, Boolean(user));
  const {
    members,
    resolveMemberCandidate,
    addMemberByUsername,
    updateRole,
    removeMember,
    transferOwnership,
  } = useWorkspaceMembers(workspaceId, Boolean(workspace.data));
  const allMembers = useMemo(
    () => members.data?.pages.flatMap((page) => page.items) ?? [],
    [members.data],
  );
  const isOwner = Boolean(user && workspace.data?.ownerId === user.id);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [roleDraft, setRoleDraft] = useState<{
    userId: string;
    role: "ADMIN" | "MEMBER";
  } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirm) {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      cancelRef.current?.focus();
    }
  }, [confirm]);

  const closeConfirm = () => {
    dialogRef.current?.close();
    setConfirm(null);
    requestAnimationFrame(() => lastTriggerRef.current?.focus());
  };

  const onRoleChange = async (member: Member, role: "ADMIN" | "MEMBER") => {
    setActionError("");
    setActionStatus("");
    setRoleDraft({ userId: member.userId, role });
    try {
      await updateRole.mutateAsync({
        workspaceId,
        userId: member.userId,
        role,
      });
      setActionStatus(
        `Role updated for ${resolveUserIdentity(member.user).label}.`,
      );
    } catch (error) {
      setActionError(
        errorCode(error) === "FORBIDDEN"
          ? "You no longer have permission to change roles."
          : "Could not change that role. Please try again.",
      );
      void members.refetch();
      void workspace.refetch();
    } finally {
      setRoleDraft(null);
    }
  };

  const confirmMutation = async () => {
    if (!confirm) return;
    const { kind, member } = confirm;
    const label = resolveUserIdentity(member.user).label;
    setActionError("");
    setActionStatus("");
    try {
      if (kind === "remove") {
        await removeMember.mutateAsync({ workspaceId, userId: member.userId });
        setActionStatus(`${label} was removed from the workspace.`);
      } else {
        await transferOwnership.mutateAsync({
          workspaceId,
          newOwnerUserId: member.userId,
        });
        setActionStatus(
          `Ownership transferred to ${label}. You are now an admin.`,
        );
      }
      closeConfirm();
    } catch (error) {
      setActionError(
        errorCode(error) === "FORBIDDEN"
          ? "You no longer have permission for this action."
          : "Could not complete this change. Please try again.",
      );
      void members.refetch();
      void workspace.refetch();
    }
  };

  const denied =
    workspace.error?.data?.code === "FORBIDDEN" ||
    workspace.error?.data?.code === "UNAUTHORIZED" ||
    workspace.error?.data?.code === "NOT_FOUND";
  const rosterDenied =
    members.error?.data?.code === "FORBIDDEN" ||
    members.error?.data?.code === "UNAUTHORIZED";
  if (denied)
    return (
      <div className="space-y-4">
        <ErrorState
          title="Workspace unavailable"
          description="This workspace is unavailable to your account."
        />
        <Link
          href="/workspace"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-link"
        >
          <ArrowLeft size={16} aria-hidden="true" /> All workspaces
        </Link>
      </div>
    );
  if (workspace.isLoading && !workspace.data)
    return (
      <div
        role="status"
        aria-label="Loading members page"
        className="space-y-6"
      >
        <span className="block h-10 w-64 max-w-full animate-pulse rounded-sm bg-surface-active" />
        <span className="block h-4 w-80 max-w-full animate-pulse rounded-sm bg-surface-subtle" />
        <div className="space-y-3 border-t border-border-subtle pt-5">
          {[0, 1, 2].map((item) => (
            <span
              key={item}
              className="block h-14 w-full animate-pulse rounded-sm bg-surface-subtle"
            />
          ))}
        </div>
      </div>
    );
  if (!workspace.data)
    return (
      <div className="space-y-3">
        <ErrorState
          title="Could not load workspace"
          description="Please try again in a moment."
        />
        <button
          type="button"
          onClick={() => void workspace.refetch()}
          className="min-h-11 text-sm font-semibold text-brand-link"
        >
          Try again
        </button>
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-8 pb-10">
      <header className="border-b border-border-subtle pb-7">
        <Link
          href={`/workspace/${workspaceId}`}
          className="inline-flex min-h-9 max-w-full min-w-0 items-center gap-1.5 wrap-anywhere text-xs font-semibold text-brand-link hover:text-brand-link-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
        >
          <ArrowLeft size={14} aria-hidden="true" /> {workspace.data.name}
        </Link>
        <div className="mt-4 flex min-w-0 items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-sm bg-brand-action text-sm font-semibold text-on-brand-action"
          >
            {workspaceInitials(workspace.data.name)}
          </span>
          <div className="min-w-0">
            <h1 className="text-[1.7rem] font-semibold leading-tight text-text-primary sm:text-[2rem]">
              Members
            </h1>
            <p className="mt-1 break-all text-xs text-text-muted">
              /{workspace.data.slug}
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-[60ch] text-sm leading-6 text-text-secondary">
          The people who can contribute to this workspace and the roles they
          hold.
        </p>
      </header>

      {rosterDenied ? (
        <div className="max-w-2xl space-y-5">
          <ErrorState
            title="Member directory unavailable"
            description="This directory is not available to your current role or access may have changed."
          />
        </div>
      ) : members.isLoading && !members.data ? (
        <div
          role="status"
          aria-label="Loading members"
          className="space-y-3 border-t border-border-subtle pt-4"
        >
          <span className="sr-only">Loading members...</span>
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              aria-hidden="true"
              className="flex items-center gap-3 border-b border-border-subtle py-3"
            >
              <span className="size-9 shrink-0 animate-pulse rounded-full bg-surface-active" />
              <span className="h-4 w-40 animate-pulse rounded-sm bg-surface-subtle" />
            </div>
          ))}
        </div>
      ) : members.error && !members.data ? (
        <div className="space-y-3">
          <ErrorState
            title="Could not load members"
            description="The directory is temporarily unavailable."
          />
          <button
            type="button"
            onClick={() => void members.refetch()}
            className="min-h-11 text-sm font-semibold text-brand-link"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-9 lg:grid-cols-[minmax(0,1fr)_19rem] xl:gap-12">
          <section
            aria-labelledby="member-directory-heading"
            className="min-w-0"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-brand-link">
                  Workspace directory
                </p>
                <h2
                  id="member-directory-heading"
                  className="mt-1 text-lg font-semibold text-text-primary"
                >
                  People
                </h2>
              </div>
              <span className="text-xs font-medium text-text-muted">
                {allMembers.length}
                {members.hasNextPage ? "+" : ""}{" "}
                {allMembers.length === 1 && !members.hasNextPage
                  ? "member"
                  : "members"}
              </span>
            </div>
            {actionError ? (
              <p
                role="alert"
                className="mb-4 border-l-2 border-danger bg-surface-subtle px-3 py-2.5 text-sm text-danger"
              >
                {actionError}
              </p>
            ) : null}
            {actionStatus ? (
              <p
                role="status"
                className="mb-4 border-l-2 border-success bg-surface-subtle px-3 py-2.5 text-sm text-text-primary"
              >
                {actionStatus}
              </p>
            ) : null}
            {members.error && members.data ? (
              <div className="mb-4 space-y-2">
                <ErrorState
                  title="Could not refresh members"
                  description="The members already loaded remain visible."
                />
                <button
                  type="button"
                  onClick={() =>
                    void (members.isFetchNextPageError
                      ? members.fetchNextPage()
                      : members.refetch())
                  }
                  className="min-h-11 text-sm font-semibold text-brand-link"
                >
                  Try again
                </button>
              </div>
            ) : null}
            {allMembers.length === 0 ? (
              <p className="border-y border-border-subtle py-8 text-sm text-text-secondary">
                No members are available right now.
              </p>
            ) : (
              <ul className="border-t border-border-subtle">
                {allMembers.map((member) => {
                  const identity = resolveUserIdentity(member.user);
                  const mayRemove =
                    member.role !== "OWNER" &&
                    (isOwner || member.role === "MEMBER");
                  const mayTransfer = isOwner && member.role !== "OWNER";
                  return (
                    <li
                      key={member.id}
                      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle py-3.5 sm:flex-nowrap sm:gap-4"
                    >
                      <UserAvatar
                        name={identity.avatarName}
                        className="size-10"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="wrap-anywhere text-sm font-semibold leading-5 text-text-primary">
                          {identity.label}
                          {member.userId === user?.id ? (
                            <span className="ml-2 text-xs font-normal text-text-muted">
                              You
                            </span>
                          ) : null}
                        </p>
                        {member.user.username &&
                        identity.label !== member.user.username ? (
                          <p className="mt-0.5 truncate text-xs text-text-muted">
                            @{member.user.username}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-text-muted">
                          Joined{" "}
                          <time
                            dateTime={new Date(member.createdAt).toISOString()}
                          >
                            {memberDate(member.createdAt)}
                          </time>
                        </p>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
                        {isOwner && member.role !== "OWNER" ? (
                          <select
                            aria-label={`Role for ${identity.label}`}
                            value={
                              roleDraft?.userId === member.userId
                                ? roleDraft.role
                                : member.role
                            }
                            disabled={updateRole.isPending}
                            onChange={(event) =>
                              void onRoleChange(
                                member,
                                event.target.value as "ADMIN" | "MEMBER",
                              )
                            }
                            className="h-10 rounded-sm border border-border bg-surface px-2 text-xs font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        ) : (
                          <span
                            className={`inline-flex min-h-8 items-center rounded-sm px-2 text-xs font-semibold ${roleStyle(member.role)}`}
                          >
                            {member.role.charAt(0) +
                              member.role.slice(1).toLowerCase()}
                          </span>
                        )}
                        {mayRemove || mayTransfer ? (
                          <Menu.Root
                            positioning={{
                              placement: "bottom-end",
                              strategy: "fixed",
                            }}
                          >
                            <Menu.Trigger asChild>
                              <button
                                type="button"
                                onClick={(event) => {
                                  lastTriggerRef.current = event.currentTarget;
                                }}
                                aria-label={`Actions for ${identity.label}`}
                                title="Member actions"
                                disabled={
                                  removeMember.isPending ||
                                  transferOwnership.isPending
                                }
                                className="grid size-10 place-items-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
                              >
                                <Ellipsis size={18} aria-hidden="true" />
                              </button>
                            </Menu.Trigger>
                            <Portal>
                              <Menu.Positioner>
                                <Menu.Content
                                  minW="12rem"
                                  p="1"
                                  bg="surface"
                                  borderWidth="1px"
                                  borderColor="border"
                                  borderRadius="sm"
                                  shadow="md"
                                  zIndex="popover"
                                >
                                  {mayTransfer ? (
                                    <Menu.Item
                                      value="transfer"
                                      onSelect={() =>
                                        setConfirm({ kind: "transfer", member })
                                      }
                                      color="textPrimary"
                                      _highlighted={{ bg: "surfaceHover" }}
                                      cursor="pointer"
                                      minH="10"
                                    >
                                      <Crown size={15} aria-hidden="true" />{" "}
                                      Transfer ownership
                                    </Menu.Item>
                                  ) : null}
                                  {mayRemove ? (
                                    <Menu.Item
                                      value="remove"
                                      onSelect={() =>
                                        setConfirm({ kind: "remove", member })
                                      }
                                      color="danger"
                                      _highlighted={{ bg: "surfaceHover" }}
                                      cursor="pointer"
                                      minH="10"
                                    >
                                      <Trash2 size={15} aria-hidden="true" />{" "}
                                      Remove member
                                    </Menu.Item>
                                  ) : null}
                                </Menu.Content>
                              </Menu.Positioner>
                            </Portal>
                          </Menu.Root>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {members.hasNextPage ? (
              <button
                type="button"
                onClick={() => void members.fetchNextPage()}
                disabled={members.isFetchingNextPage}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-sm border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
              >
                {members.isFetchingNextPage ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {members.isFetchingNextPage
                  ? "Loading members..."
                  : "Load more members"}
              </button>
            ) : null}
          </section>
          <aside className="min-w-0 space-y-6 border-t border-border-subtle pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <div>
              <p className="text-xs font-semibold uppercase text-brand-link">
                Participation
              </p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">
                Add a teammate
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Add someone who already has a Commons account. They can join the
                conversation immediately.
              </p>
            </div>
            <AddMemberForm
              workspaceId={workspaceId}
              onResolve={async (values) => {
                try {
                  return await resolveMemberCandidate.mutateAsync(values);
                } catch (error) {
                  if (
                    errorCode(error) === "FORBIDDEN" ||
                    errorCode(error) === "UNAUTHORIZED"
                  ) {
                    void members.refetch();
                    void workspace.refetch();
                  }
                  throw error;
                }
              }}
              onAdd={async (values) => {
                try {
                  await addMemberByUsername.mutateAsync(values);
                } catch (error) {
                  if (
                    errorCode(error) === "FORBIDDEN" ||
                    errorCode(error) === "UNAUTHORIZED"
                  ) {
                    void members.refetch();
                    void workspace.refetch();
                  }
                  throw error;
                }
              }}
              pending={
                resolveMemberCandidate.isPending ||
                addMemberByUsername.isPending
              }
            />
          </aside>
        </div>
      )}

      {confirm ? (
        <dialog
          ref={dialogRef}
          onCancel={(event) => {
            event.preventDefault();
            closeConfirm();
          }}
          className="w-[min(30rem,calc(100vw-2rem))] max-w-none rounded-sm border border-border bg-surface p-0 text-text-primary shadow-xl backdrop:bg-black/55"
        >
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-brand-link">
              {confirm.kind === "transfer" ? (
                <ShieldCheck size={20} aria-hidden="true" />
              ) : (
                <UsersRound size={20} aria-hidden="true" />
              )}
              <span className="text-xs font-semibold uppercase">
                Workspace membership
              </span>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-text-primary">
              {confirm.kind === "transfer"
                ? "Transfer ownership?"
                : "Remove this member?"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {confirm.kind === "transfer"
                ? `Transfer this workspace to ${resolveUserIdentity(confirm.member.user).label}? You will become an admin.`
                : `${resolveUserIdentity(confirm.member.user).label} will lose access to this workspace and its discussions.`}
            </p>
            {actionError ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {actionError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                ref={cancelRef}
                type="button"
                onClick={closeConfirm}
                disabled={removeMember.isPending || transferOwnership.isPending}
                className="min-h-11 rounded-sm px-4 text-sm font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmMutation()}
                disabled={removeMember.isPending || transferOwnership.isPending}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60 ${confirm.kind === "remove" ? "bg-danger text-white hover:opacity-90" : "bg-brand-action text-on-brand-action hover:bg-brand-action-hover"}`}
              >
                {removeMember.isPending || transferOwnership.isPending ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {confirm.kind === "transfer"
                  ? "Transfer ownership"
                  : "Remove member"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
