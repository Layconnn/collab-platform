import { ArrowDown, Plus } from "lucide-react";

import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";

export default function WorkspacesPage() {
  return (
    <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-10 pb-10">
      <header className="flex flex-col gap-5 border-b border-border-subtle pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-brand-link">Commons / Workspaces</p>
          <h1 className="mt-3 text-[1.8rem] font-semibold leading-tight text-text-primary sm:text-[2.1rem]">Your workspaces</h1>
          <p className="mt-2 max-w-[60ch] text-sm leading-6 text-text-secondary">Choose a space to continue a conversation, or make room for a new project.</p>
        </div>
        <a href="#new-workspace" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-sm bg-brand-action px-4 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover active:bg-brand-action-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none sm:w-auto"><Plus size={16} aria-hidden="true" /> New workspace</a>
      </header>

      <section aria-labelledby="workspace-directory-heading" className="min-w-0">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h2 id="workspace-directory-heading" className="text-lg font-semibold text-text-primary">Workspace directory</h2>
          <ArrowDown size={17} className="text-text-muted" aria-hidden="true" />
        </div>
        <WorkspaceList />
      </section>

      <section id="new-workspace" aria-labelledby="new-workspace-heading" className="scroll-mt-20 border-t border-border-subtle pt-8 sm:pt-10">
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-12">
          <div className="max-w-[42ch]">
            <p className="text-xs font-semibold uppercase text-brand-link">Begin together</p>
            <h2 id="new-workspace-heading" className="mt-2 text-xl font-semibold leading-snug text-text-primary sm:text-2xl">Create a workspace</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">A workspace keeps your people and discussions in one place. Give it a name and a short address; you can add existing account holders after creating it.</p>
          </div>
          <CreateWorkspaceForm />
        </div>
      </section>
    </div>
  );
}
