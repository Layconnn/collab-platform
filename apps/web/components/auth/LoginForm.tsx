"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { loginInputSchema, type LoginInput } from "@repo/validators/auth";

import { useAuth } from "@/hooks/useAuth";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await login.mutateAsync(values);
    router.replace("/workspace");
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Email</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" type="email" autoComplete="email" {...form.register("email")} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Password</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" type="password" autoComplete="current-password" {...form.register("password")} />
      </label>
      <button type="submit" disabled={login.isPending} className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Sign in
      </button>
      {login.error ? (
        <p className="text-sm text-red-600">Login failed: {login.error.message}</p>
      ) : null}
    </form>
  );
}
