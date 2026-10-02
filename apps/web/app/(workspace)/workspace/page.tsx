import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";
import { NotificationDropdown } from "@/components/notification/NotificationDropdown";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default function WorkspaceDashboardPage() {
  return (
    <AuthGuard>
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your workspaces</h1>
          <p className="text-sm text-slate-500">Choose a workspace to continue.</p>
        </div>
        <div className="flex items-center gap-4">
          <NotificationDropdown />
          <SignOutButton />
        </div>
      </div>
      <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Workspace list</h2>
          <WorkspaceList />
        </div>
        <div className="rounded border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Create workspace</h2>
          <CreateWorkspaceForm />
        </div>
      </div>
    </div>
    </AuthGuard>
  );
}
