"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { ArrowRight, LoaderCircle } from "lucide-react";

import {
  createWorkspaceInputSchema,
  type CreateWorkspaceInput,
} from "@repo/validators/workspace";
import { useCreateWorkspace } from "@/hooks/useWorkspace";
import { suggestWorkspaceSlug } from "@/lib/workspace-identity";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const createWorkspace = useCreateWorkspace();
  const submittingRef = useRef(false);
  const rootErrorRef = useRef<HTMLParagraphElement>(null);
  const [manuallyEditedSlug, setManuallyEditedSlug] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceInputSchema),
    defaultValues: { name: "", slug: "" },
    shouldFocusError: true,
  });
  const name = useWatch({ control: form.control, name: "name" });
  const { setValue } = form;

  useEffect(() => {
    if (!manuallyEditedSlug) {
      setValue("slug", suggestWorkspaceSlug(name ?? ""), {
        shouldValidate: false,
      });
    }
  }, [name, setValue, manuallyEditedSlug]);

  useEffect(() => {
    let frame = 0;
    const focusCreation = () => {
      if (window.location.hash !== "#new-workspace") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        document
          .getElementById("new-workspace")
          ?.scrollIntoView?.({ block: "start" });
        document
          .getElementById("new-workspace-name")
          ?.focus({ preventScroll: true });
      });
    };
    const onAnchorClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('a[href="#new-workspace"], a[href="/workspace#new-workspace"]')) {
        focusCreation();
      }
    };
    focusCreation();
    window.addEventListener("hashchange", focusCreation);
    document.addEventListener("click", onAnchorClick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", focusCreation);
      document.removeEventListener("click", onAnchorClick);
    };
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submittingRef.current || redirecting) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    void form.handleSubmit(
      async (values) => {
        form.clearErrors("root");
        try {
          const workspace = await createWorkspace.mutateAsync(values);
          setRedirecting(true);
          router.push(`/workspace/${workspace.id}`);
        } catch (error) {
          const code =
            typeof error === "object" && error !== null && "data" in error
              ? (error as { data?: { code?: string } }).data?.code
              : undefined;
          if (code === "CONFLICT") {
            form.setError(
              "slug",
              {
                type: "server",
                message: "This address is already in use. Choose another.",
              },
              { shouldFocus: true },
            );
          } else {
            form.setError("root", {
              type: "server",
              message:
                code === "FORBIDDEN"
                  ? "You cannot create a workspace with this account."
                  : "Workspace could not be created. Please try again.",
            });
          }
          submittingRef.current = false;
        }
      },
      () => {
        submittingRef.current = false;
      },
    )(event);
  };

  const busy =
    form.formState.isSubmitting || createWorkspace.isPending || redirecting;
  const nameError = form.formState.errors.name?.message;
  const slugError = form.formState.errors.slug?.message;
  const rootError = form.formState.errors.root?.message;

  useEffect(() => {
    if (rootError) rootErrorRef.current?.focus();
  }, [rootError]);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="new-workspace-name"
          className="block text-sm font-semibold text-text-primary"
        >
          Workspace name
        </label>
        <p
          id="new-workspace-name-help"
          className="mt-1 text-xs leading-5 text-text-muted"
        >
          The name your team will see throughout Commons.
        </p>
        <input
          id="new-workspace-name"
          autoComplete="organization"
          maxLength={120}
          disabled={busy}
          placeholder="Open Atlas"
          aria-invalid={Boolean(nameError)}
          aria-describedby={`new-workspace-name-help${nameError ? " new-workspace-name-error" : ""}`}
          className="mt-2 h-12 w-full min-w-0 rounded-sm border border-border bg-surface px-3.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted hover:border-text-muted focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/25 disabled:opacity-60 motion-reduce:transition-none"
          {...form.register("name")}
        />
        {nameError ? (
          <p
            id="new-workspace-name-error"
            role="alert"
            className="mt-1.5 text-xs leading-5 text-danger"
          >
            {nameError}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="new-workspace-slug"
          className="block text-sm font-semibold text-text-primary"
        >
          Workspace address
        </label>
        <p
          id="new-workspace-slug-help"
          className="mt-1 text-xs leading-5 text-text-muted"
        >
          A short, readable identifier for your workspace. You can edit the
          suggestion.
        </p>
        <div className="mt-2 flex h-12 min-w-0 items-center rounded-sm border border-border bg-surface focus-within:border-focus-ring focus-within:ring-2 focus-within:ring-focus-ring/25 hover:border-text-muted">
          <span
            className="shrink-0 border-r border-border-subtle px-3 text-xs text-text-muted"
            aria-hidden="true"
          >
            commons /
          </span>
          <input
            id="new-workspace-slug"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={60}
            disabled={busy}
            placeholder="open-atlas"
            aria-invalid={Boolean(slugError)}
            aria-describedby={`new-workspace-slug-help${slugError ? " new-workspace-slug-error" : ""}`}
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
            {...form.register("slug", {
              onChange: () => {
                setManuallyEditedSlug(true);
                form.clearErrors("slug");
              },
            })}
          />
        </div>
        {slugError ? (
          <p
            id="new-workspace-slug-error"
            role="alert"
            className="mt-1.5 text-xs leading-5 text-danger"
          >
            {slugError}
          </p>
        ) : null}
      </div>
      {rootError ? (
        <p
          ref={rootErrorRef}
          tabIndex={-1}
          role="alert"
          className="border-l-2 border-danger bg-surface-subtle px-3 py-2.5 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {rootError}
        </p>
      ) : null}
      <div className="border-t border-border-subtle pt-5">
        {busy ? <span role="status" className="sr-only">{redirecting ? "Opening workspace..." : "Creating workspace..."}</span> : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-brand-action px-5 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:w-auto"
        >
          {busy ? (
            <LoaderCircle
              size={17}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ArrowRight size={17} aria-hidden="true" />
          )}
          {redirecting
            ? "Opening workspace..."
            : busy
              ? "Creating workspace..."
              : "Create workspace"}
        </button>
      </div>
    </form>
  );
}
