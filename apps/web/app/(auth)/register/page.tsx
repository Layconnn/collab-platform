import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function RegisterPage() {
  return (
    <AuthLayout
      variant="register"
      eyebrow="Join the conversation"
      title="Make room for better conversations."
      description="Create your account and give your project discussions a place to grow."
      footer={<p>Already part of Commons? <AuthSwitchLink href="/login">Sign in</AuthSwitchLink></p>}
    >
      <RegisterForm />
    </AuthLayout>
  );
}
