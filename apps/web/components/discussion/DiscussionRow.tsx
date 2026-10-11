import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/api/root";
import { UserAvatar } from "@/components/common/UserAvatar";
import { resolveUserIdentity } from "@/lib/user-identity";

export type DiscussionSummary =
  inferRouterOutputs<AppRouter>["discussion"]["listByWorkspace"]["items"][number];

function dateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function DiscussionRow({
  discussion,
  workspaceId,
  compact = false,
  actions,
  error,
}: {
  discussion: DiscussionSummary;
  workspaceId: string;
  compact?: boolean;
  actions?: ReactNode;
  error?: string;
}) {
  const author = resolveUserIdentity(discussion.author);
  const createdAt = new Date(discussion.createdAt);
  const updatedAt = new Date(discussion.updatedAt);
  const wasUpdated = updatedAt.getTime() > createdAt.getTime() + 1000;

  return (
    <li className="min-w-0 border-b border-border-subtle">
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={`/workspace/${workspaceId}/discussions/${discussion.id}`}
          className={`group flex min-w-0 flex-1 items-center gap-3 rounded-sm px-1 transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring motion-reduce:transition-none sm:px-3 ${compact ? "min-h-[4.25rem] py-2.5" : "min-h-[4.5rem] py-3"}`}
        >
          <UserAvatar name={author.avatarName} className="size-8" />
          <span className="min-w-0 flex-1">
            <span className={`block wrap-anywhere font-semibold text-text-primary transition-colors group-hover:text-brand-link motion-reduce:transition-none ${compact ? "text-sm leading-5 sm:text-[0.95rem]" : "text-[0.95rem] leading-5 sm:text-base"}`}>
              {discussion.title}
            </span>
            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4 text-text-muted">
              <span className="max-w-full truncate text-text-secondary">{author.label}</span>
              <span aria-hidden="true">/</span>
              <time dateTime={createdAt.toISOString()}>{dateLabel(createdAt)}</time>
              {!compact && wasUpdated ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span>Updated <time dateTime={updatedAt.toISOString()}>{dateLabel(updatedAt)}</time></span>
                </>
              ) : null}
            </span>
          </span>
          {!actions ? <ArrowUpRight size={16} className="shrink-0 text-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" /> : null}
        </Link>
        {actions ? <div className="shrink-0 pr-1 sm:pr-2">{actions}</div> : null}
      </div>
      {error ? <p role="alert" className="pb-3 pl-12 pr-3 text-sm text-danger sm:pl-14">{error}</p> : null}
    </li>
  );
}
