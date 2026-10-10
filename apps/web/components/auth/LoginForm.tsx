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
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Email</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f]" type="email" autoComplete="email" {...form.register("email")} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Password</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f]" type="password" autoComplete="current-password" {...form.register("password")} />
      </label>
      <button type="submit" disabled={login.isPending} className="w-full rounded-md bg-[#16765b] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#105d47] disabled:opacity-60">
        {login.isPending ? "Signing in..." : "Sign in"}
      </button>
      {login.error ? (
        <p className="text-sm text-red-600">Login failed: {login.error.message}</p>
      ) : null}
    </form>
  );
}
