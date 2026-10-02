import Link from "next/link";

import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Create your account</h1>
        <p className="mt-2 text-sm text-slate-600">Set up an account to create and join workspaces.</p>
      </div>
      <div className="rounded border border-slate-200 bg-white p-6">
        <RegisterForm />
      </div>
      <p className="text-sm text-slate-600">Already registered? <Link className="font-medium text-teal-800" href="/login">Sign in</Link></p>
    </main>
  );
}
