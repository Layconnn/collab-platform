import {
  Bell,
  Building2,
  ChevronDown,
  CornerDownRight,
  MessageSquare,
  Users,
} from "lucide-react";

export function ProductPreview() {
  return (
    <div
      role="img"
      aria-label="Illustrative Commons application showing an Open Atlas discussion with nested replies, a mention, and an unread notification"
      className="overflow-hidden rounded-md border border-border bg-surface shadow-[0_28px_70px_-48px_rgba(15,35,27,0.5)]"
    >
      <div
        aria-hidden="true"
        className="grid md:min-h-[560px] md:grid-cols-[4.5rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]"
      >
        <aside className="hidden min-w-0 flex-col border-r border-border-subtle bg-[#f8faf9] md:flex">
          <div className="flex h-14 items-center justify-center border-b border-border-subtle px-3 xl:justify-start xl:gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded bg-brand-700 text-sm font-bold text-white">
              C
            </span>
            <span className="hidden truncate text-sm font-semibold text-text-primary xl:block">
              Commons
            </span>
          </div>
          <div className="p-3">
            <div className="flex min-h-11 items-center justify-center gap-2 rounded border border-border-subtle bg-surface px-1.5 xl:justify-start xl:px-2">
              <span className="grid size-8 shrink-0 place-items-center rounded bg-brand-100 text-[10px] font-bold text-brand-800">
                OA
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-xs font-semibold text-text-primary xl:block">
                Open Atlas
              </span>
              <ChevronDown
                size={14}
                className="hidden shrink-0 text-text-muted xl:block"
              />
            </div>
          </div>
          <p className="mb-2 hidden px-5 pt-3 text-[10px] font-semibold uppercase text-text-muted xl:block">
            Workspace
          </p>
          <div className="space-y-1 px-3 text-xs font-medium">
            <div className="flex h-10 items-center justify-center gap-3 border-l-2 border-transparent px-2.5 text-text-secondary xl:justify-start">
              <Building2 size={16} className="shrink-0" />
              <span className="hidden xl:inline">Overview</span>
            </div>
            <div className="flex h-10 items-center justify-center gap-3 border-l-2 border-brand bg-surface-subtle px-2.5 text-brand-800 xl:justify-start">
              <MessageSquare size={16} className="shrink-0" />
              <span className="hidden xl:inline">Discussions</span>
            </div>
            <div className="flex h-10 items-center justify-center gap-3 border-l-2 border-transparent px-2.5 text-text-secondary xl:justify-start">
              <Users size={16} className="shrink-0" />
              <span className="hidden xl:inline">Members</span>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-center gap-2.5 border-t border-border-subtle p-3 xl:justify-start">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-800">
              MC
            </span>
            <span className="hidden min-w-0 truncate text-xs font-medium text-text-secondary xl:block">
              Maya Chen
            </span>
          </div>
        </aside>

        <div className="min-w-0 bg-surface">
          <div className="flex h-14 items-center justify-between gap-3 border-b border-border-subtle px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 text-xs text-text-muted">
              <span className="grid size-7 shrink-0 place-items-center rounded bg-brand-700 text-[11px] font-bold text-white md:hidden">
                C
              </span>
              <span className="hidden shrink-0 md:inline">Workspaces</span>
              <span className="hidden md:inline">/</span>
              <span className="min-w-0 truncate">Open Atlas</span>
              <span>/</span>
              <span className="shrink-0 font-medium text-text-secondary">
                Discussions
              </span>
            </div>
            <span className="relative grid size-9 shrink-0 place-items-center rounded text-text-secondary">
              <Bell size={17} />
              <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-brand-700 text-[9px] font-bold text-white">
                1
              </span>
            </span>
          </div>

          <div className="mx-auto max-w-[760px] px-4 py-6 sm:px-7 sm:py-8 lg:px-8">
            <p className="mb-5 text-xs font-semibold text-brand-700">
              &larr; All discussions
            </p>
            <div className="border-b border-border-subtle pb-6">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-text-muted">
                <MessageSquare size={13} /> Discussion
              </div>
              <h2 className="mt-3 max-w-[600px] text-[22px] font-semibold leading-tight text-text-primary sm:text-[27px]">
                How should first-time setup work?
              </h2>
              <div className="mt-4 flex items-center gap-2.5 text-xs text-text-muted">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-800">
                  MC
                </span>
                <span>
                  <strong className="font-semibold text-text-primary">
                    Maya Chen
                  </strong>
                  <span className="hidden sm:inline">
                    {" "}
                    started this conversation
                  </span>
                </span>
                <span aria-hidden="true" className="ml-auto hidden sm:inline">
                  Oct 8
                </span>
              </div>
              <p className="mt-5 max-w-[620px] text-[13px] leading-[1.7] text-text-secondary sm:text-sm">
                New contributors lose context between the README and their first
                local run. Could we make the initial path easier to follow?
              </p>
            </div>

            <div className="pt-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-primary">
                  Conversation
                </h3>
                <span className="text-xs text-text-muted">2 replies</span>
              </div>
              <div className="mt-4 border-l-2 border-brand-200 pl-3.5 sm:pl-5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-active text-[10px] font-semibold text-brand-800">
                    LR
                  </span>
                  <strong className="font-semibold text-text-primary">
                    Lina Rahman
                  </strong>
                  <span className="text-text-muted">replied</span>
                </div>
                <p className="mt-2 text-[13px] leading-6 text-text-secondary">
                  A single quick-start path would help. We could move the
                  environment notes next to the first command.
                </p>
                <div className="ml-2 mt-4 border-l-2 border-border-subtle pl-3.5 sm:ml-4 sm:pl-5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-800">
                      SK
                    </span>
                    <strong className="font-semibold text-text-primary">
                      Sam Kim
                    </strong>
                    <CornerDownRight size={13} className="text-text-muted" />
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-text-secondary">
                    <span className="font-semibold text-info">@maya</span> I can
                    draft that flow and bring it back here for review.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex min-h-12 items-center justify-between gap-3 rounded border border-border bg-[#fbfcfb] px-3 text-xs text-text-muted">
                <span>Add your perspective...</span>
                <span className="shrink-0 rounded bg-brand-700 px-2.5 py-1.5 font-semibold text-white">
                  Reply
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
