"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useWorkspaceDetail } from "@/hooks/useWorkspace";
import { useDiscussionList } from "@/hooks/useDiscussion";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { useAuth } from "@/hooks/useAuth";
import { LoadingState, ErrorState } from "@/components/common/StateNotice";

function shortDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default function WorkspaceOverviewPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const { data, isLoading, error } = useWorkspaceDetail(workspaceId);
  const discussions = useDiscussionList(workspaceId);
  const members = useWorkspaceMembers(workspaceId).members;
  const { user } = useAuth();

  if (isLoading) {
    return <LoadingState label="Loading workspace..." />;
  }

  if (error || !data) {
    return <ErrorState title="Workspace not found" description={error?.message} />;
  }

  const discussionItems = discussions.data?.pages.flatMap((page) => page.items) ?? [];
  const memberItems = members.data?.pages.flatMap((page) => page.items) ?? [];
  const currentRole = memberItems.find((member) => member.userId === user?.id)?.role;

  return (
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-lg bg-[#123d30] px-5 py-7 text-white sm:px-8 sm:py-9">
          <div className="relative z-10 max-w-2xl">
            <p className="text-sm font-semibold text-[#b9e2cc]">Community home <span className="mx-1 text-[#edc478]">/</span> {data.slug}</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{data.name}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#e0eee6]">A shared space for project questions, decisions, updates, and the people who make the work happen.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/workspace/${workspaceId}/discussions`} className="rounded-md bg-[#f1c66d] px-4 py-2.5 text-sm font-semibold text-[#263b31] transition-colors hover:bg-[#ffda8a]">Open discussions</Link>
              <Link href={`/workspace/${workspaceId}/members`} className="rounded-md border border-white/35 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10">Meet contributors</Link>
            </div>
          </div>
        </section>
        <section aria-label="Community activity summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Contributors", value: members.isLoading ? "..." : `${memberItems.length}${members.hasNextPage ? "+" : ""}`, color: "text-[#16765b]" },
            { label: "Discussions", value: discussions.isLoading ? "..." : `${discussionItems.length}${discussions.hasNextPage ? "+" : ""}`, color: "text-[#b2603e]" },
            { label: "Your role", value: members.isLoading ? "..." : currentRole ? currentRole.charAt(0) + currentRole.slice(1).toLowerCase() : "Member", color: "text-[#96711f]" },
            { label: "Started", value: shortDate(data.createdAt), color: "text-[#495b86]" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-md border border-[#dce6e0] bg-white px-4 py-4">
              <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 text-xs font-medium text-[#63716a]">{stat.label}</p>
            </div>
          ))}
        </section>
        <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-[#16765b]">Community pulse</p>
                <h2 className="mt-1 text-xl font-semibold text-[#17231f]">Latest discussions</h2>
              </div>
              <Link href={`/workspace/${workspaceId}/discussions`} className="text-sm font-semibold text-[#16765b] hover:text-[#105d47]">View all</Link>
            </div>
            {discussions.isLoading ? <div className="rounded-md border border-[#dce6e0] bg-white p-5"><LoadingState label="Gathering community conversations..." /></div> : null}
            {discussions.error ? <ErrorState title="Could not load discussions" description={discussions.error.message} /> : null}
            {!discussions.isLoading && !discussions.error && discussionItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#b8c9be] bg-white p-6">
                <p className="font-semibold text-[#17231f]">The first conversation starts here.</p>
                <p className="mt-1 text-sm text-[#63716a]">Share a project update or ask a question to bring contributors in.</p>
                <Link href={`/workspace/${workspaceId}/discussions`} className="mt-4 inline-flex rounded-md bg-brand-action px-3 py-2 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover">Start a discussion</Link>
              </div>
            ) : null}
            {discussionItems.length > 0 ? (
              <ul className="divide-y divide-[#dce6e0] rounded-md border border-[#dce6e0] bg-white px-4 sm:px-5">
                {discussionItems.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <Link href={`/workspace/${workspaceId}/discussions/${item.id}`} className="group flex items-center justify-between gap-4 py-4">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[#17231f] group-hover:text-[#16765b]">{item.title}</span>
                        <span className="mt-1 block text-xs text-[#63716a]">{item.author.name ?? "Community member"} <span aria-hidden="true">·</span> {shortDate(item.createdAt)}</span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-[#829088]">-&gt;</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <aside className="rounded-md border border-[#dce6e0] bg-[#fffdf7] p-5">
            <p className="text-xs font-semibold uppercase text-[#b2603e]">A welcoming community</p>
            <h2 className="mt-2 text-lg font-semibold text-[#17231f]">Make it easier to contribute.</h2>
            <ul className="mt-4 space-y-3 text-sm leading-5 text-[#49574f]">
              <li className="flex gap-2"><span className="font-bold text-[#16765b]">01</span><span>Ask clear questions and share enough context.</span></li>
              <li className="flex gap-2"><span className="font-bold text-[#16765b]">02</span><span>Welcome new perspectives and explain project decisions.</span></li>
              <li className="flex gap-2"><span className="font-bold text-[#16765b]">03</span><span>Keep useful answers visible in the discussion.</span></li>
            </ul>
            <Link href={`/workspace/${workspaceId}/members`} className="mt-5 inline-flex text-sm font-semibold text-[#16765b] hover:text-[#105d47]">See contributors <span className="ml-1" aria-hidden="true">-&gt;</span></Link>
          </aside>
        </section>
      </div>
  );
}
