// Pure helpers for the command palette: building, matching and remembering items.

export type CommandGroup = "Recent" | "Actions" | "Workspaces" | "Decisions" | "Discussions" | "Replies" | "Search";

export type CommandItem = {
  id: string;
  group: CommandGroup;
  label: string;
  // Shown after the label, such as the workspace an action applies to.
  hint?: string;
  // Extra words that match the item but are not shown.
  keywords?: string;
  // Navigation target; items without one run `action` instead.
  href?: string;
  action?: "theme-light" | "theme-dark" | "theme-system" | "shortcuts" | "sign-out" | "new-workspace";
};

export type CommandContext = {
  workspace?: { id: string; name: string; role?: "OWNER" | "ADMIN" | "MEMBER" };
  workspaces: Array<{ id: string; name: string }>;
};

// Actions follow the permission matrix: every member can read and start
// discussions; only owners and admins can list members (LIST_MEMBERS).
export function buildCommands(context: CommandContext): CommandItem[] {
  const items: CommandItem[] = [];
  const ws = context.workspace;
  if (ws) {
    const base = `/workspace/${ws.id}`;
    items.push(
      { id: "new-discussion", group: "Actions", label: "New discussion", hint: ws.name, keywords: "start create thread post", href: `${base}/discussions#new-discussion` },
      { id: "open-overview", group: "Actions", label: "Open overview", hint: ws.name, keywords: "home workspace activity", href: base },
      { id: "open-discussions", group: "Actions", label: "Open discussions", hint: ws.name, keywords: "threads conversations", href: `${base}/discussions` },
      { id: "open-decisions", group: "Actions", label: "Open decisions", hint: ws.name, keywords: "records proposals adr", href: `${base}/decisions` },
    );
    if (ws.role === "OWNER" || ws.role === "ADMIN") {
      items.push({ id: "open-members", group: "Actions", label: "Open members", hint: ws.name, keywords: "people roles team invite", href: `${base}/members` });
    }
  }
  items.push(
    { id: "search", group: "Actions", label: "Search everything", keywords: "find look up", href: "/search" },
    { id: "email-settings", group: "Actions", label: "Email settings", keywords: "digest notifications preferences unsubscribe", href: "/settings/email" },
    { id: "saved", group: "Actions", label: "Saved items", keywords: "bookmarks later starred favourites favorites", href: "/saved" },
    { id: "new-workspace", group: "Actions", label: "New workspace", keywords: "create add", action: "new-workspace" },
    { id: "all-workspaces", group: "Actions", label: "All workspaces", keywords: "list switch", href: "/workspace" },
    { id: "theme-light", group: "Actions", label: "Switch to light theme", keywords: "appearance mode colour color", action: "theme-light" },
    { id: "theme-dark", group: "Actions", label: "Switch to dark theme", keywords: "appearance mode colour color night", action: "theme-dark" },
    { id: "theme-system", group: "Actions", label: "Use system theme", keywords: "appearance mode colour color auto", action: "theme-system" },
    { id: "shortcuts", group: "Actions", label: "Keyboard shortcuts", keywords: "keys help hotkeys", action: "shortcuts" },
    { id: "sign-out", group: "Actions", label: "Sign out", keywords: "log out logout leave", action: "sign-out" },
  );
  for (const workspace of context.workspaces) {
    if (workspace.id === ws?.id) continue;
    items.push({ id: `workspace-${workspace.id}`, group: "Workspaces", label: workspace.name, hint: "Workspace", keywords: "go to switch", href: `/workspace/${workspace.id}` });
  }
  return items;
}

const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

// Every typed word must appear in the label, hint or keywords. Labels that
// start with the query come first, then the original order.
export function matchCommands(items: CommandItem[], query: string): CommandItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const scored = items
    .map((item, index) => {
      const label = normalize(item.label);
      const haystack = `${label} ${normalize(item.hint ?? "")} ${normalize(item.keywords ?? "")}`;
      if (!words.every((word) => haystack.includes(word))) return null;
      const rank = label.startsWith(words.join(" ")) ? 0 : words.every((word) => label.includes(word)) ? 1 : 2;
      return { item, rank, index };
    })
    .filter((entry): entry is { item: CommandItem; rank: number; index: number } => entry !== null);
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map((entry) => entry.item);
}

// Recently opened places, kept only in this browser (FR-17).
export const RECENT_KEY = "commons.palette.recent";
const RECENT_LIMIT = 6;
export type RecentEntry = { label: string; href: string; hint?: string };

export function readRecent(storage: Pick<Storage, "getItem"> | undefined): RecentEntry[] {
  try {
    const parsed = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry?.label === "string" && typeof entry?.href === "string" && entry.href.startsWith("/")).slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberRecent(storage: Pick<Storage, "getItem" | "setItem"> | undefined, entry: RecentEntry): void {
  try {
    const next = [entry, ...readRecent(storage).filter((existing) => existing.href !== entry.href)].slice(0, RECENT_LIMIT);
    storage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private windows); recents are a convenience.
  }
}

export function recentItems(entries: RecentEntry[]): CommandItem[] {
  return entries.map((entry) => ({ id: `recent-${entry.href}`, group: "Recent" as const, label: entry.label, hint: entry.hint, href: entry.href }));
}

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

// Live search results as palette items, grouped by type (FR-18).
export type SearchHit = {
  type: "DECISION" | "DISCUSSION" | "COMMENT";
  id: string;
  title: string;
  workspace: { id: string; name: string };
  discussionId: string | null;
};

const RESULT_GROUP = { DECISION: "Decisions", DISCUSSION: "Discussions", COMMENT: "Replies" } as const;
const GROUP_ORDER = ["DECISION", "DISCUSSION", "COMMENT"] as const;

export function searchResultItems(hits: SearchHit[], hrefOf: (hit: SearchHit) => string): CommandItem[] {
  return GROUP_ORDER.flatMap((type) =>
    hits.filter((hit) => hit.type === type).map((hit) => ({
      id: `result-${hit.type}-${hit.id}`,
      group: RESULT_GROUP[hit.type],
      label: hit.type === "COMMENT" ? `Reply in ${hit.title}` : hit.title,
      hint: hit.workspace.name,
      href: hrefOf(hit),
    })),
  );
}

// The last item while typing: the same query on the full search page (FR-21).
export function seeAllResultsItem(query: string): CommandItem {
  const trimmed = query.trim();
  return { id: "see-all-results", group: "Search", label: `See all results for “${trimmed}”`, href: `/search?q=${encodeURIComponent(trimmed)}` };
}

