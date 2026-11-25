"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import type { SearchResultType } from "@repo/validators/search";
import { EmptyState, ErrorState } from "@/components/common/StateNotice";
import { timeAgo } from "@/components/activity/RecentActivity";
import { DecisionStatus } from "@/components/decision/decisionUI";
import { useAuth } from "@/hooks/useAuth";
import { useSearch, type SearchFilters } from "@/hooks/useSearch";
import { useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { FileCount } from "@/components/files/FileCount";

// Server snippets wrap matched words in these control characters.
const HIGHLIGHT_START = "\u0002";
const HIGHLIGHT_END = "\u0003";

const TYPES: Array<{ param: string; value: SearchResultType; label: string }> = [
  { param: "decision", value: "DECISION", label: "Decisions" },
  { param: "discussion", value: "DISCUSSION", label: "Discussions" },
  { param: "comment", value: "COMMENT", label: "Replies" },
];
const STATUSES = [
  { param: "proposed", value: "PROPOSED", label: "Proposals" },
  { param: "decided", value: "DECIDED", label: "Finalized" },
  { param: "superseded", value: "SUPERSEDED", label: "Superseded" },
] as const;
const SINCE = [
  { param: "week", label: "Past week", days: 7 },
  { param: "month", label: "Past month", days: 30 },
  { param: "year", label: "Past year", days: 365 },
] as const;
const TYPE_LABEL: Record<SearchResultType, string> = { DECISION: "Decision", DISCUSSION: "Discussion", COMMENT: "Reply" };

export type SearchResultItem = {
  type: SearchResultType;
  id: string;
  workspace: { id: string; name: string };
  title: string;
  snippet: string;
  status: "PROPOSED" | "DECIDED" | "SUPERSEDED" | null;
  author: string;
  discussionId: string | null;
  files?: number;
  updatedAt: Date | string;
};

export function Snippet({ text }: { text: string }) {
  const parts: Array<{ text: string; hit: boolean }> = [];
  let hit = false;
  let buffer = "";
  for (const char of text) {
    if (char === HIGHLIGHT_START || char === HIGHLIGHT_END) {
      if (buffer) parts.push({ text: buffer, hit });
      buffer = "";
      hit = char === HIGHLIGHT_START;
      continue;
    }
    buffer += char;
  }
  if (buffer) parts.push({ text: buffer, hit });
  return <>{parts.map((part, index) => part.hit
    ? <mark key={index} className="rounded-[2px] bg-brand-accent/25 px-0.5 font-semibold text-text-primary">{part.text}</mark>
    : <span key={index}>{part.text}</span>)}</>;
}

export function resultHref(item: SearchResultItem) {
  const base = `/workspace/${item.workspace.id}`;
  if (item.type === "DECISION") return `${base}/decisions/${item.id}`;
  if (item.type === "DISCUSSION") return `${base}/discussions/${item.id}`;
  return `${base}/discussions/${item.discussionId ?? ""}`;
}

// Reads the filters from the URL. Dates are rounded to the hour so the query
// key, and the cache, stay stable while the page is open.
function filtersFrom(params: URLSearchParams, userId: string | undefined): SearchFilters {
  const types = (params.get("type") ?? "").split(",").map((p) => TYPES.find((t) => t.param === p)?.value).filter((v): v is SearchResultType => Boolean(v));
  const status = STATUSES.find((s) => s.param === params.get("status"))?.value;
  const since = SINCE.find((s) => s.param === params.get("since"));
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return {
    query: (params.get("q") ?? "").slice(0, 200),
    types: types.length ? types : undefined,
    workspaceId: params.get("workspace") || undefined,
    status,
    authorId: params.get("mine") === "1" && userId ? userId : undefined,
    updatedAfter: since ? new Date(hour - since.days * 86_400_000) : undefined,
  };
}

const chipClass = (on: boolean) =>
  `min-h-10 rounded-sm border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-focus-ring ${on ? "border-brand-accent bg-surface-subtle text-brand-link" : "border-border-subtle text-text-secondary hover:bg-surface-hover"}`;
const selectClass = "min-h-10 rounded-sm border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring";

export function SearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const filters = useMemo(() => filtersFrom(new URLSearchParams(params.toString()), user?.id), [params, user?.id]);
  const [text, setText] = useState(filters.query);
  const workspaces = useWorkspaceSwitcherList(Boolean(user));
  const workspaceOptions = workspaces.data?.pages.flatMap((page) => page.items) ?? [];
  const search = useSearch(filters);
  const items: SearchResultItem[] = search.data?.pages.flatMap((page) => page.items) ?? [];

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  // Typing updates the URL after a short pause, so each pause sends one request.
  useEffect(() => {
    if (text === filters.query) return;
    const timer = setTimeout(() => update({ q: text.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const onSubmit = (event: FormEvent) => { event.preventDefault(); update({ q: text.trim() || null }); };
  const selectedTypes = new Set(filters.types ?? []);
  // No type selected means all types, as does selecting every type.
  const toggleType = (value: SearchResultType) => {
    const nextTypes = TYPES.filter((t) => (t.value === value ? !selectedTypes.has(value) : selectedTypes.has(t.value))).map((t) => t.param);
    update({ type: nextTypes.length && nextTypes.length < TYPES.length ? nextTypes.join(",") : null });
  };
  const filtersActive = Boolean(filters.types || filters.workspaceId || filters.status || filters.authorId || filters.updatedAfter);
  const query = filters.query.trim();
  const tooShort = query.replace(/\s+/g, "").length < 2;
  const denied = ["UNAUTHORIZED", "FORBIDDEN"].includes(search.error?.data?.code ?? "");

  return <div className="mx-auto w-full min-w-0 max-w-[60rem] pb-16">
    <p className="text-xs font-semibold uppercase text-brand-link">Across your workspaces</p>
    <h1 className="mt-1 text-[1.85rem] font-semibold leading-tight text-text-primary sm:text-[2.2rem]">Search</h1>

    <form role="search" onSubmit={onSubmit} className="mt-6">
      <label htmlFor={inputId} className="block text-sm font-semibold text-text-primary">Search decisions, discussions and replies</label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={text}
        maxLength={200}
        onChange={(event) => setText(event.target.value)}
        placeholder="worker queue, &quot;vercel queues&quot;, -redis"
        autoComplete="off"
        className="mt-2 h-12 w-full min-w-0 rounded-sm border border-control-border bg-surface px-4 text-base text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-focus-ring"
      />
    </form>

    <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type">
      {TYPES.map((type) => <button key={type.param} type="button" aria-pressed={selectedTypes.has(type.value)} onClick={() => toggleType(type.value)} className={chipClass(selectedTypes.has(type.value))}>{type.label}</button>)}
      <button type="button" aria-pressed={Boolean(filters.authorId)} onClick={() => update({ mine: filters.authorId ? null : "1" })} className={chipClass(Boolean(filters.authorId))}>Only mine</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-3">
      <label className="flex items-center gap-2 text-sm text-text-secondary">Workspace
        <select value={filters.workspaceId ?? ""} onChange={(event) => update({ workspace: event.target.value || null })} className={selectClass}>
          <option value="">All workspaces</option>
          {workspaceOptions.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-text-secondary">Decision status
        <select value={STATUSES.find((s) => s.value === filters.status)?.param ?? ""} onChange={(event) => update({ status: event.target.value || null })} className={selectClass}>
          <option value="">Any</option>
          {STATUSES.map((status) => <option key={status.param} value={status.param}>{status.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-text-secondary">Updated
        <select value={params.get("since") ?? ""} onChange={(event) => update({ since: event.target.value || null })} className={selectClass}>
          <option value="">Any time</option>
          {SINCE.map((since) => <option key={since.param} value={since.param}>{since.label}</option>)}
        </select>
      </label>
      {filtersActive ? <button type="button" onClick={() => update({ type: null, workspace: null, status: null, mine: null, since: null })} className="min-h-10 px-2 text-sm font-semibold text-brand-link hover:text-brand-link-hover">Clear filters</button> : null}
    </div>
    {filters.status ? <p className="mt-2 text-xs text-text-muted">A status filter shows decisions only.</p> : null}

    <section aria-label="Search results" className="mt-8">
      {tooShort ? <div className="border-t border-border-subtle pt-6 text-sm leading-6 text-text-secondary">
        <p className="font-semibold text-text-primary">{query ? "Keep typing: use at least two characters." : "Find anything your team has discussed or decided."}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Words all have to match; the last one can be the start of a word.</li>
          <li>Put an exact phrase in quotes: <code className="font-mono text-xs">&quot;vercel queues&quot;</code></li>
          <li>Leave a word out with a minus: <code className="font-mono text-xs">queue -redis</code></li>
        </ul>
      </div> : null}

      {!tooShort && search.isLoading && !search.data ? <div role="status" aria-label="Searching" className="border-t border-border-subtle">
        {[1, 2, 3].map((row) => <div key={row} aria-hidden="true" className="space-y-2 border-b border-border-subtle py-5"><span className="block h-4 w-1/2 animate-pulse rounded-sm bg-surface-active" /><span className="block h-3 w-5/6 animate-pulse rounded-sm bg-surface-subtle" /></div>)}
      </div> : null}

      {!tooShort && search.error ? <ErrorState
        title={denied ? "Search unavailable" : "Could not search"}
        description={denied ? "Your session may have ended. Sign in again to search." : "Please try again in a moment."}
        onRetry={denied ? undefined : () => void search.refetch()}
        retrying={search.isFetching}
      /> : null}

      {!tooShort && !search.isLoading && !search.error && !items.length ? <div className="space-y-3">
        <EmptyState title={`No results for “${query}”`} description={filtersActive ? "Try clearing the filters, or use fewer words." : "Try fewer or different words, or the start of a word."} />
        {filtersActive ? <button type="button" onClick={() => update({ type: null, workspace: null, status: null, mine: null, since: null })} className="text-sm font-semibold text-brand-link hover:text-brand-link-hover">Clear filters</button> : null}
      </div> : null}

      {!tooShort && items.length && !search.error ? <>
        <p role="status" className="text-sm text-text-muted">{items.length}{search.hasNextPage ? "+" : ""} {items.length === 1 ? "result" : "results"}</p>
        <ol className="mt-3 border-t border-border-subtle">
          {items.map((item) => <li key={`${item.type}:${item.id}`} className="min-w-0 border-b border-border-subtle py-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="font-semibold uppercase text-brand-link">{TYPE_LABEL[item.type]}</span>
              <span>{item.workspace.name}</span>
              {item.status ? <DecisionStatus status={item.status} /> : null}
            </div>
            <h2 className="mt-1.5 wrap-anywhere text-base font-semibold text-text-primary">
              <Link href={resultHref(item)} className="underline-offset-2 hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring">{item.type === "COMMENT" ? `Reply in ${item.title}` : item.title}</Link>
            </h2>
            {item.snippet ? <p className="mt-1.5 wrap-anywhere text-sm leading-6 text-text-secondary"><Snippet text={item.snippet} /></p> : null}
            <p className="mt-1.5 text-xs text-text-muted">{item.author} · updated <time dateTime={new Date(item.updatedAt).toISOString()}>{timeAgo(item.updatedAt)}</time>{item.files ? <> · <FileCount count={item.files} /></> : null}</p>
          </li>)}
        </ol>
        {search.hasNextPage ? <button type="button" disabled={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()} className="mt-4 min-h-11 rounded-sm border border-border px-4 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">{search.isFetchingNextPage ? "Loading..." : "More results"}</button> : null}
      </> : null}
    </section>
  </div>;
}
