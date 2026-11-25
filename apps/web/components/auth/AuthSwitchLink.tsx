"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { withNext } from "@/lib/safe-next";

// "Sign in" / "Create an account" that carries the page's `next` along, so
// someone arriving from an invite link comes back to it either way. The
// destination is worked out on click, from the address the page was opened at.
export function AuthSwitchLink({ href, children }: { href: "/login" | "/register"; children: ReactNode }) {
  const router = useRouter();
  return <Link
    className="font-semibold text-brand-link underline-offset-4 hover:text-brand-link-hover hover:underline"
    href={href}
    onClick={(event) => {
      const target = withNext(href, window.location.search);
      if (target === href || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      router.push(target);
    }}
  >{children}</Link>;
}
