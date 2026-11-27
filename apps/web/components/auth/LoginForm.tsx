"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";

import { loginInputSchema, type LoginInput } from "@repo/validators/auth";

import { useAuth } from "@/hooks/useAuth";
import { AuthField } from "@/components/auth/AuthField";
import { authErrorMessage } from "@/components/auth/authError";
import { safeNextPath } from "@/lib/safe-next";


const submitClass = "flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-brand-action px-5 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-65";
const alertClass = "rounded-sm border border-danger/30 bg-surface-subtle px-3.5 py-3 text-sm text-danger outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

const failureOf = (error: unknown) => {
  const value = typeof error === "object" && error !== null ? error as { message?: unknown; data?: { code?: string } | null } : {};
  return { message: typeof value.message === "string" ? value.message : "", code: value.data?.code };
};

// The code step of signing in with two-step on (settings PRD, FR-13).
function TwoStepCode({ challengeToken, onRestart, onSignedIn }: { challengeToken: string; onRestart: (notice: string) => void; onSignedIn: () => void }) {
  const { verifyTwoStep } = useAuth();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const busy = verifyTwoStep.isPending || done;

  useEffect(() => { inputRef.current?.focus(); }, [recovery]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const value = code.trim();
    if (!recovery && !/^\d{6}$/.test(value.replace(/\s/g, ""))) { setError("Enter the 6-digit code from your app."); return; }
    if (recovery && value.replace(/[^a-z0-9]/gi, "").length !== 10) { setError("Enter one of your recovery codes, like abcde-fghjk."); return; }
    setError(null);
    try {
      await verifyTwoStep.mutateAsync({ challengeToken, code: value });
      setDone(true);
      onSignedIn();
    } catch (failure) {
      const { message, code: status } = failureOf(failure);
      // An expired challenge, or five wrong codes: back to the password.
      if (/password again/.test(message)) { onRestart(message); return; }
      setError(status === "TOO_MANY_REQUESTS" ? "Too many attempts. Please wait a moment and try again."
        : recovery ? "That recovery code didn’t work. Each code works once."
        : "That code didn’t work. Try the newest code in your app.");
      setCode("");
    }
  };

  const id = recovery ? "login-recovery-code" : "login-code";
  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label="Two-step sign-in">
      <div className="space-y-1.5">
        <p className="m-0 text-[0.95rem] font-semibold text-text-primary">Two-step sign-in</p>
        <p className="m-0 text-sm text-text-secondary">{recovery
          ? "Enter one of the recovery codes you saved when you turned two-step sign-in on. Each works once."
          : "Open your authenticator app and enter the 6-digit code for Commons."}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm font-semibold text-text-primary">{recovery ? "Recovery code" : "Authentication code"}</label>
        <input ref={inputRef} id={id} value={code} onChange={(event) => { setCode(event.target.value); setError(null); }}
          inputMode={recovery ? "text" : "numeric"} autoComplete={recovery ? "off" : "one-time-code"} autoCapitalize="off" spellCheck={false}
          maxLength={recovery ? 24 : 7} placeholder={recovery ? "abcde-fghjk" : "123456"} disabled={busy}
          aria-invalid={error ? true : undefined}
          className={`h-12 w-full rounded-sm border bg-surface px-3.5 font-mono text-[1.05rem] tracking-[0.2em] text-text-primary !outline-none transition-colors placeholder:text-text-muted hover:border-text-muted focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/25 disabled:opacity-60 ${error ? "border-danger" : "border-control-border"}`} />
      </div>
      {error ? <p ref={errorRef} tabIndex={-1} role="alert" className={alertClass}>{error}</p> : null}
      {busy ? <span role="status" className="sr-only">{done ? "Opening workspace..." : "Checking the code..."}</span> : null}
      <button type="submit" disabled={busy} className={submitClass}>
        {busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
        {done ? "Opening workspace..." : busy ? "Checking..." : "Verify"}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" disabled={busy} onClick={() => onRestart("")} className="inline-flex items-center gap-1.5 rounded-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"><ArrowLeft size={15} aria-hidden="true" />Back</button>
        <button type="button" disabled={busy} onClick={() => { setRecovery((value) => !value); setCode(""); setError(null); }} className="rounded-sm font-medium text-brand-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {recovery ? "Use your authenticator app" : "Use a recovery code"}
        </button>
      </div>
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: "", password: "" },
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
        const result = await login.mutateAsync(values);
        if (result?.twoStep) {
          setChallenge(result.challengeToken);
          submittingRef.current = false;
          return;
        }
        setRedirecting(true);
        router.replace(safeNextPath(window.location.search));
      } catch (error) {
        form.setError("root", { type: "server", message: authErrorMessage(error, "login") });
        submittingRef.current = false;
      }
    }, () => { submittingRef.current = false; })(event);
  };

  const rootError = form.formState.errors.root?.message;
  const busy = form.formState.isSubmitting || login.isPending || redirecting;
  useEffect(() => {
    if (rootError) errorRef.current?.focus();
  }, [rootError]);

  if (challenge) {
    return <TwoStepCode challengeToken={challenge}
      onSignedIn={() => router.replace(safeNextPath(window.location.search))}
      onRestart={(notice) => {
        setChallenge(null);
        form.setValue("password", "");
        if (notice) form.setError("root", { type: "server", message: notice });
      }} />;
  }

  return (
    <form onSubmit={onSubmit} onChangeCapture={() => form.clearErrors("root")} className="space-y-5" noValidate>
      <AuthField id="login-email" label="Email" type="email" autoComplete="email" registration={form.register("email")} error={form.formState.errors.email} disabled={busy} />
      <AuthField id="login-password" label="Password" type="password" autoComplete="current-password" registration={form.register("password")} error={form.formState.errors.password} disabled={busy} />
      {rootError ? <p ref={errorRef} tabIndex={-1} role="alert" className={alertClass}>{rootError}</p> : null}
      {busy ? <span role="status" className="sr-only">{redirecting ? "Opening workspace..." : "Signing in..."}</span> : null}
      <button type="submit" disabled={busy} className={submitClass}>
        {busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
        {redirecting ? "Opening workspace..." : busy ? "Signing in..." : "Sign in"}
        {!busy ? <ArrowRight size={17} aria-hidden="true" /> : null}
      </button>
    </form>
  );
}
