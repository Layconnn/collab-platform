import Link from "next/link";

import { NotificationDropdown } from "@/components/notification/NotificationDropdown";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { WorkspaceNavigation } from "@/components/workspace/WorkspaceNavigation";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f5f8f6]">
        <header className="sticky top-0 z-20 border-b border-[#dce6e0] bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/workspace" className="flex shrink-0 items-center gap-3" aria-label="Commons home">
              <span className="grid size-9 place-items-center rounded-md bg-[#16765b] text-sm font-bold text-white">C</span>
              <span className="hidden sm:block">
                <span className="block text-sm font-semibold leading-4 text-[#17231f]">Commons</span>
                <span className="block pt-1 text-[11px] leading-3 text-[#63716a]">Community workspace</span>
              </span>
            </Link>
            <WorkspaceNavigation workspaceId={workspaceId} />
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationDropdown />
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
