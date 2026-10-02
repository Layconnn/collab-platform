"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { registerInputSchema, type RegisterInput } from "@repo/validators/auth";
import { useAuth } from "@/hooks/useAuth";

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerInputSchema),
    defaultValues: { email: "", username: "", password: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await register.mutateAsync(values);
    router.replace("/workspace");
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Email</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" type="email" autoComplete="email" {...form.register("email")} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Username</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" autoComplete="username" {...form.register("username")} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Password</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" type="password" autoComplete="new-password" {...form.register("password")} />
      </label>
      {register.error ? <p role="alert" className="text-sm text-red-700">{register.error.message}</p> : null}
      <button type="submit" disabled={register.isPending} className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {register.isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
