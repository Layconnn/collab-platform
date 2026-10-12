"use client";

import { useRef, useState, type FormEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { LoaderCircle, UserRoundPlus } from "lucide-react";
import type { z } from "zod";

import {
  addWorkspaceMemberByUsernameInputSchema,
  type AddWorkspaceMemberByUsernameInput,
  type ResolveWorkspaceMemberCandidateInput,
} from "@repo/validators/workspace";
import { UserAvatar } from "@/components/common/UserAvatar";
import { resolveUserIdentity } from "@/lib/user-identity";

type Candidate = { name: string | null; username: string };
type Resolution =
  | { status: "ready"; user: Candidate }
  | { status: "already_member" | "unavailable" };

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "data" in error
    ? (error as { data?: { code?: string } }).data?.code
    : undefined;
}

export function AddMemberForm({
  workspaceId,
  onResolve,
  onAdd,
  pending,
}: {
  workspaceId: string;
  onResolve: (
    values: ResolveWorkspaceMemberCandidateInput,
  ) => Promise<Resolution>;
  onAdd: (values: AddWorkspaceMemberByUsernameInput) => Promise<void>;
  pending: boolean;
}) {
  const submittingRef = useRef(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const form = useForm<
    z.input<typeof addWorkspaceMemberByUsernameInputSchema>,
    unknown,
    AddWorkspaceMemberByUsernameInput
  >({
    resolver: zodResolver(addWorkspaceMemberByUsernameInputSchema),
    defaultValues: { workspaceId, username: "", role: "MEMBER" },
    shouldFocusError: true,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    void form.handleSubmit(
      async (values) => {
        setFeedback(null);
        try {
          if (!candidate || candidate.username !== values.username) {
            const result = await onResolve({
              workspaceId,
              username: values.username,
            });
            if (result.status === "ready") {
              setCandidate(result.user);
            } else {
              setCandidate(null);
              setFeedback({
                kind: "error",
                message:
                  result.status === "already_member"
                    ? "This account already belongs to the workspace."
                    : "No available account matches that exact username.",
              });
            }
          } else {
            await onAdd(values);
            form.reset({ workspaceId, username: "", role: "MEMBER" });
            setCandidate(null);
            setFeedback({
              kind: "success",
              message: "Account added to this workspace.",
            });
          }
        } catch (error) {
          const code = errorCode(error);
          if (code === "CONFLICT" || code === "NOT_FOUND") setCandidate(null);
          setFeedback({
            kind: "error",
            message:
              code === "CONFLICT"
                ? "This account already belongs to the workspace."
                : code === "NOT_FOUND"
                  ? "No available account matches that exact username."
                  : code === "FORBIDDEN" || code === "UNAUTHORIZED"
                    ? "You no longer have permission to add members."
                    : code === "TOO_MANY_REQUESTS"
                      ? "Too many attempts. Please wait a minute and try again."
                      : "Could not complete this request. Please try again.",
          });
        } finally {
          submittingRef.current = false;
        }
      },
      () => {
        submittingRef.current = false;
      },
    )(event);
  };

  const busy = pending || form.formState.isSubmitting;
  const usernameError = form.formState.errors.username?.message;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="add-member-username"
          className="block text-sm font-semibold text-text-primary"
        >
          Commons username
        </label>
        <p
          id="add-member-username-help"
          className="mt-1 text-xs leading-5 text-text-muted"
        >
          Enter the exact username of someone who already has a Commons account.
        </p>
        <input
          id="add-member-username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={busy}
          placeholder="username"
          aria-invalid={Boolean(usernameError)}
          aria-describedby={`add-member-username-help${usernameError ? " add-member-username-error" : ""}`}
          className="mt-2 h-11 w-full min-w-0 rounded-sm border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
          {...form.register("username", {
            onChange: () => {
              setCandidate(null);
              setFeedback(null);
            },
          })}
        />
        {usernameError ? (
          <p
            id="add-member-username-error"
            role="alert"
            className="mt-1 text-xs text-danger"
          >
            {usernameError}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="add-member-role"
          className="block text-sm font-semibold text-text-primary"
        >
          Starting role
        </label>
        <select
          id="add-member-role"
          disabled={busy}
          className="mt-2 h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"
          {...form.register("role")}
        >
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
        </select>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          Admins can add accounts and manage ordinary members.
        </p>
      </div>
      {candidate ? (
        <div
          role="status"
          className="flex min-w-0 items-center gap-3 border-y border-border-subtle bg-surface-subtle px-3 py-3"
        >
          <UserAvatar
            name={resolveUserIdentity(candidate).avatarName}
            className="size-9"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {resolveUserIdentity(candidate).label}
            </p>
            <p className="truncate text-xs text-text-muted">
              @{candidate.username}
            </p>
          </div>
        </div>
      ) : null}
      {feedback ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`border-l-2 px-3 py-2 text-sm ${feedback.kind === "error" ? "border-danger bg-surface-subtle text-danger" : "border-success bg-surface-subtle text-text-primary"}`}
        >
          {feedback.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60 motion-reduce:transition-none"
      >
        {busy ? (
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <UserRoundPlus size={16} aria-hidden="true" />
        )}
        {busy ? "Working..." : candidate ? "Add to workspace" : "Find account"}
      </button>
    </form>
  );
}
