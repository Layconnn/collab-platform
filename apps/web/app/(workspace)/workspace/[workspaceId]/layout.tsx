import Link from "next/link";

import { NotificationDropdown } from "@/components/notification/NotificationDropdown";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SignOutButton } from "@/components/auth/SignOutButton";

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
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <Link href="/workspace" className="text-sm font-semibold text-slate-700">Workspaces</Link>
              <Link href={`/workspace/${workspaceId}`} className="text-sm text-slate-500">Overview</Link>
              <Link href={`/workspace/${workspaceId}/discussions`} className="text-sm text-slate-500">Discussions</Link>
              <Link href={`/workspace/${workspaceId}/members`} className="text-sm text-slate-500">Members</Link>
            </div>
            <NotificationDropdown />
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
