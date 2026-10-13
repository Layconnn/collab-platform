import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout
      variant="login"
      eyebrow="Welcome back"
      title="Pick up where the conversation left off."
      description="Return to the questions, replies, and people that move your project forward."
      footer={<p>New to Commons? <Link className="font-semibold text-brand-link underline-offset-4 hover:text-brand-link-hover hover:underline" href="/register">Create an account</Link></p>}
    >
      <LoginForm />
    </AuthLayout>
  );
}
