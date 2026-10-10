"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { registerInputSchema, type RegisterInput } from "@repo/validators/auth";
import { useAuth } from "@/hooks/useAuth";
import { AuthField } from "@/components/auth/AuthField";
import { authErrorMessage } from "@/components/auth/authError";

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [redirecting, setRedirecting] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerInputSchema),
    defaultValues: { email: "", username: "", password: "" },
    shouldFocusError: true,
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submittingRef.current || redirecting) {
      event.preventDefault();
      return;
    }
    submittingRef.current = true;
    void form.handleSubmit(async (values) => {
      form.clearErrors("root");
      try {
        await register.mutateAsync(values);
        setRedirecting(true);
        router.replace("/workspace");
      } catch (error) {
        form.setError("root", { type: "server", message: authErrorMessage(error, "register") });
        submittingRef.current = false;
      }
    }, () => { submittingRef.current = false; })(event);
  };

  const rootError = form.formState.errors.root?.message;
  const busy = form.formState.isSubmitting || register.isPending || redirecting;
  useEffect(() => {
    if (rootError) errorRef.current?.focus();
  }, [rootError]);

  return (
    <form onSubmit={onSubmit} onChangeCapture={() => form.clearErrors("root")} className="space-y-4" noValidate>
      <AuthField id="register-email" label="Email" type="email" autoComplete="email" registration={form.register("email")} error={form.formState.errors.email} disabled={busy} />
      <AuthField id="register-username" label="Username" autoComplete="username" registration={form.register("username")} error={form.formState.errors.username} hint="3-30 letters, numbers, or underscores." disabled={busy} />
      <AuthField id="register-password" label="Password" type="password" autoComplete="new-password" registration={form.register("password")} error={form.formState.errors.password} hint="Use 8-128 characters." disabled={busy} />
      {rootError ? <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-sm border border-danger/30 bg-surface-subtle px-3.5 py-3 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{rootError}</p> : null}
      <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-brand-action px-5 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-65">
        {busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
        {redirecting ? "Opening workspace..." : busy ? "Creating account..." : "Create account"}
        {!busy ? <ArrowRight size={17} aria-hidden="true" /> : null}
      </button>
    </form>
  );
}
