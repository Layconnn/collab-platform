import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-500">
          Use your account credentials to access your workspaces.
        </p>
      </div>
      <div className="rounded border border-slate-200 bg-white p-6">
        <LoginForm />
      </div>
    </div>
  );
}
