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
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Email</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f]" type="email" autoComplete="email" {...form.register("email")} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Username</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f]" autoComplete="username" {...form.register("username")} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Password</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f]" type="password" autoComplete="new-password" {...form.register("password")} />
      </label>
      {register.error ? <p role="alert" className="text-sm text-red-700">{register.error.message}</p> : null}
      <button type="submit" disabled={register.isPending} className="w-full rounded-md bg-[#16765b] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#105d47] disabled:opacity-60">
        {register.isPending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
