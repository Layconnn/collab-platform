import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";

export default function WorkspaceDashboardPage() {
  return (
      <div className="mx-auto flex max-w-6xl flex-col gap-9 py-2">
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
          <aside id="new-workspace" className="h-fit border-t border-[#dce6e0] pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <h2 className="text-base font-semibold text-[#17231f]">Start a community</h2>
            <p className="mb-5 mt-1 text-sm leading-6 text-[#63716a]">Create a space for your project’s questions, ideas, and contributors.</p>
            <CreateWorkspaceForm />
          </aside>
        </div>
      </div>
  );
}
