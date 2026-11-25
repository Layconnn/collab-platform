import { LoginForm } from "@/components/auth/LoginForm";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout
      variant="login"
      eyebrow="Welcome back"
      title="Pick up where the conversation left off."
      description="Return to the questions, replies, and people that move your project forward."
      footer={<p>New to Commons? <AuthSwitchLink href="/register">Create an account</AuthSwitchLink></p>}
    >
      <LoginForm />
    </AuthLayout>
  );
}
