import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Your community is picking up where you left off."
      description="Sign in to return to the project conversations, decisions, and people you care about."
      footer={<p className="text-sm text-[#63716a]">New to Commons? <Link className="font-semibold text-[#16765b] hover:text-[#105d47]" href="/register">Create an account</Link></p>}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[#17231f]">Sign in</h2>
        <p className="mt-1 text-sm text-[#63716a]">Use your account credentials to continue.</p>
      </div>
        <LoginForm />
    </AuthLayout>
  );
}
