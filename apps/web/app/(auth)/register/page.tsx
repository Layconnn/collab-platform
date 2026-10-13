import Link from "next/link";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function RegisterPage() {
  return (
    <AuthLayout
      variant="register"
      eyebrow="Join the conversation"
      title="Make room for better conversations."
      description="Create your account and give your project discussions a place to grow."
      footer={<p>Already part of Commons? <Link className="font-semibold text-brand-link underline-offset-4 hover:text-brand-link-hover hover:underline" href="/login">Sign in</Link></p>}
    >
      <RegisterForm />
    </AuthLayout>
  );
}
