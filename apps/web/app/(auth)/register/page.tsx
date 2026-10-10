import Link from "next/link";

import { RegisterForm } from "@/components/auth/RegisterForm";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function RegisterPage() {
  return (
    <AuthLayout
      eyebrow="Make space for good work"
      title="Find your place in the open-source community."
      description="Create an account to start a project space, join conversations, and work alongside contributors."
      footer={<p className="text-sm text-[#63716a]">Already part of Commons? <Link className="font-semibold text-[#16765b] hover:text-[#105d47]" href="/login">Sign in</Link></p>}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[#17231f]">Create your account</h2>
        <p className="mt-1 text-sm text-[#63716a]">Start with the basics. You can set up your first community next.</p>
      </div>
        <RegisterForm />
    </AuthLayout>
  );
}
