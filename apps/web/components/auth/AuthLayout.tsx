import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-[#123d30] px-4 py-8 sm:px-6">
      <Image src="/community-onboarding.png" alt="Contributors collaborating on a shared project" fill priority sizes="100vw" className="object-cover object-center" />
      <div aria-hidden="true" className="absolute inset-0 bg-[#102d24]/70" />
      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-16">
        <section className="max-w-xl text-white">
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Commons home">
            <span className="grid size-10 place-items-center rounded-md border border-white/50 bg-white/10 text-sm font-bold">C</span>
            <span className="text-sm font-semibold">Commons</span>
          </Link>
          <p className="mt-12 text-sm font-bold uppercase text-[#f1c66d]">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight">{title}</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-white/85">{description}</p>
          <div className="mt-9 hidden items-center gap-3 text-sm font-medium text-white/80 sm:flex">
            <span className="size-2 rounded-full bg-[#f1c66d]" />
            Built for questions, ideas, and open collaboration.
          </div>
        </section>
        <section className="rounded-md bg-[#fffdf8] p-5 shadow-xl sm:p-8">
          {children}
          <div className="mt-6 border-t border-[#dce6e0] pt-5">{footer}</div>
        </section>
      </div>
    </main>
  );
}
