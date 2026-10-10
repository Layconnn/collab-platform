"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkspaceNavigation({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const links = [
    { label: "Overview", href: `/workspace/${workspaceId}`, exact: true },
    { label: "Discussions", href: `/workspace/${workspaceId}/discussions` },
    { label: "Members", href: `/workspace/${workspaceId}/members` },
  ];

  return (
    <nav aria-label="Community navigation" className="order-3 flex w-full justify-center gap-1 overflow-x-auto sm:order-none sm:w-auto sm:justify-start">
      {links.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.label}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? "border-[#16765b] text-[#105d47]"
                : "border-transparent text-[#63716a] hover:text-[#17231f]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
