import { UserRound } from "lucide-react";

export function UserAvatar({ name, className = "size-9" }: { name: string | null | undefined; className?: string }) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const initials = words.length > 1
    ? `${words[0][0]}${words[1][0]}`
    : words[0]?.slice(0, 2);

  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full bg-surface-active text-xs font-semibold text-brand-link ${className}`}>
      {initials ? initials.toUpperCase() : <UserRound size={17} />}
    </span>
  );
}
