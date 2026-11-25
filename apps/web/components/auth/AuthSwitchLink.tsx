"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { withNext } from "@/lib/safe-next";

// "Sign in" / "Create an account" that carries the page's `next` along, so
// someone arriving from an invite link comes back to it either way.
export function AuthSwitchLink({ href, children }: { href: "/login" | "/register"; children: ReactNode }) {
  const [target, setTarget] = useState<string>(href);
  useEffect(() => { setTarget(withNext(href, window.location.search)); }, [href]);
  return <Link className="font-semibold text-brand-link underline-offset-4 hover:text-brand-link-hover hover:underline" href={target}>{children}</Link>;
}
