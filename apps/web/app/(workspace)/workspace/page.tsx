import Link from "next/link";
import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";
import { NotificationDropdown } from "@/components/notification/NotificationDropdown";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default function WorkspaceDashboardPage() {
  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#f5f8f6]">
      <header className="border-b border-[#dce6e0] bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/workspace" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#16765b] text-sm font-bold text-white">C</span>
            <span>
              <span className="block text-sm font-semibold text-[#17231f]">Commons</span>
              <span className="hidden text-[11px] text-[#63716a] sm:block">Open-source communities</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <NotificationDropdown />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-9 px-4 py-8 sm:px-6 sm:py-12">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[#16765b]">Your community spaces</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#17231f]">Find your people and get involved.</h1>
          <p className="mt-3 text-base leading-7 text-[#63716a]">Choose a workspace to follow project conversations, share progress, and help move ideas forward.</p>
        </div>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-labelledby="communities-heading">
            <div className="mb-4 flex items-center justify-between border-b border-[#dce6e0] pb-3">
              <h2 id="communities-heading" className="text-base font-semibold text-[#17231f]">Your communities</h2>
            </div>
            <WorkspaceList />
          </section>
          <aside className="h-fit border-t border-[#dce6e0] pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <h2 className="text-base font-semibold text-[#17231f]">Start a community</h2>
            <p className="mb-5 mt-1 text-sm leading-6 text-[#63716a]">Create a space for your project’s questions, ideas, and contributors.</p>
            <CreateWorkspaceForm />
          </aside>
        </div>
      </main>
    </div>
    </AuthGuard>
  );
}
