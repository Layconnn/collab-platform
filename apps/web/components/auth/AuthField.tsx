"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { FieldError, UseFormRegisterReturn } from "react-hook-form";

type AuthFieldProps = {
  id: string;
  label: string;
  type?: "email" | "text" | "password";
  autoComplete: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  hint?: string;
  disabled?: boolean;
};

export function AuthField({ id, label, type = "text", autoComplete, registration, error, hint, disabled }: AuthFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const errorText = error?.type === "too_small" ? `${label} is too short.`
    : error?.type === "too_big" ? `${label} is too long.`
    : type === "email" && error ? "Enter a valid email address."
    : error?.message;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-text-primary">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && passwordVisible ? "text" : type}
          autoComplete={autoComplete}
          inputMode={type === "email" ? "email" : undefined}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-sm border bg-surface px-3.5 text-[0.95rem] text-text-primary outline-none transition-colors placeholder:text-text-muted hover:border-text-muted focus-visible:border-focus-ring focus-visible:ring-2 focus-visible:ring-focus-ring/25 disabled:cursor-not-allowed disabled:opacity-60 ${isPassword ? "pr-12" : ""} ${error ? "border-danger" : "border-border"}`}
          {...registration}
        />
        {isPassword ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            title={passwordVisible ? "Hide password" : "Show password"}
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus-ring disabled:opacity-60"
          >
            {passwordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      {hint ? <p id={`${id}-hint`} className="text-xs leading-5 text-text-muted">{hint}</p> : null}
      {errorText ? <p id={`${id}-error`} role="alert" className="text-xs leading-5 text-danger">{errorText}</p> : null}
    </div>
  );
}
