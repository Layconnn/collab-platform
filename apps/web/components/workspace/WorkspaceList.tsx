"use client";

import Link from "next/link";
import Image from "next/image";

import { useWorkspaceList } from "@/hooks/useWorkspace";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";

export function WorkspaceList() {
  const { data, isLoading, error } = useWorkspaceList();

  if (isLoading) {
    return <LoadingState label="Loading workspaces..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load workspaces" description={error.message} />;
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="grid gap-6 border-y border-[#dce6e0] py-6 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase text-[#b2603e]">A good place to start</p>
          <h3 className="mt-2 text-xl font-semibold text-[#17231f]">Every great project starts with people.</h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[#63716a]">Create a workspace for questions, project decisions, and the contributors who bring the work to life.</p>
        </div>
        <Image
          src="/community-onboarding.png"
          alt="Three contributors collaborating around an open-source project"
          width={1536}
          height={1024}
          className="h-auto w-full rounded-md object-cover sm:max-h-44"
          priority
        />
      </div>
    );
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-[#dce6e0] bg-white p-4">
          <p className="text-2xl font-semibold text-[#17231f]">{data.items.length}{data.nextCursor ? "+" : ""}</p>
          <p className="mt-1 text-xs font-medium text-[#63716a]">Workspaces</p>
        </div>
        <div className="rounded-md border border-[#dce6e0] bg-white p-4">
          <p className="text-2xl font-semibold text-[#16765b]">{data.items.filter((item) => item.role === "OWNER").length}</p>
          <p className="mt-1 text-xs font-medium text-[#63716a]">Owned by you</p>
        </div>
        <div className="col-span-2 rounded-md border border-[#dce6e0] bg-white p-4 sm:col-span-1">
          <p className="text-2xl font-semibold text-[#b2603e]">{data.items.filter((item) => item.role !== "OWNER").length}</p>
          <p className="mt-1 text-xs font-medium text-[#63716a]">You contribute to</p>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
      {data.items.map((workspace) => (
        <li key={workspace.workspaceId} className="min-w-0 rounded-md border border-[#dce6e0] bg-white transition-colors hover:border-[#8fb6a2] hover:bg-[#fbfdfb]">
          <Link href={`/workspace/${workspace.workspaceId}`} className="group flex h-full min-h-36 items-center justify-between gap-4 p-4">
            <span className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-[#e6f2ec] text-base font-semibold text-[#16765b]" aria-hidden="true">
                {workspace.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-[#17231f] group-hover:text-[#105d47]">{workspace.name}</span>
                <span className="mt-1 block truncate text-sm text-[#63716a]">/{workspace.slug}</span>
                <span className="mt-4 inline-flex rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#36584a]">{workspace.role.toLowerCase()}</span>
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-lg text-[#829088] transition-transform group-hover:translate-x-1">-&gt;</span>
          </Link>
        </li>
      ))}
      </ul>
    </>
  );
}
