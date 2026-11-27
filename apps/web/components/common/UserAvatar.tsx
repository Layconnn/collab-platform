"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";

import { avatarUrl } from "@/lib/avatar";

// A person's photo when they have one (settings PRD, FR-3), otherwise their
// initials. Decorative: the name always sits beside it.
export function UserAvatar({ name, photo, className = "size-9" }: { name: string | null | undefined; photo?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = avatarUrl(photo);
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const initials = words.length > 1
    ? `${words[0][0]}${words[1][0]}`
    : words[0]?.slice(0, 2);

  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-active text-xs font-semibold text-brand-link ${className}`}>
      {src && failed !== src
        // eslint-disable-next-line @next/next/no-img-element -- a signed redirect, not an optimizable static image
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} className="size-full object-cover" />
        : initials ? initials.toUpperCase() : <UserRound size={17} />}
    </span>
  );
}
