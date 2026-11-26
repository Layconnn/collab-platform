"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useTheme } from "@/components/theme/ThemeProvider";
import { resultHref } from "@/components/search/SearchPage";
import { useAuth } from "@/hooks/useAuth";
import { useSearch } from "@/hooks/useSearch";
import { useWorkspaceDetail, useWorkspaceSwitcherList } from "@/hooks/useWorkspace";
import { useUiStore } from "@/stores/ui.store";
import { dialogPanelClasses, dialogTitleClasses, scrimClasses, solidPanelClasses } from "@/components/ui/overlay";
import {
  buildCommands, isMacPlatform, matchCommands, readRecent, recentItems, rememberRecent,
  searchResultItems, seeAllResultsItem, type CommandItem, type SearchHit,
} from "./commandItems";

const storage = () => (typeof window === "undefined" ? undefined : window.localStorage);
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

// Opens the palette on Cmd-K or Ctrl-K and the shortcuts sheet on "?", from
// any signed-in page. Mounted once by the app shell.
export function useCommandShortcuts() {
  const setPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(!useUiStore.getState().isCommandPaletteOpen);
        return;
      }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !isTyping(event.target)) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen, setShortcutsOpen]);
}

export function CommandPalette() {
  const open = useUiStore((state) => state.isCommandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  return open ? <PaletteDialog onClose={() => setOpen(false)} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { setMode } = useTheme();
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const setCreateWorkspaceOpen = useUiStore((state) => state.setCreateWorkspaceOpen);
  const workspaceId = pathname.match(/^\/workspace\/([^/]+)/)?.[1];
  const workspace = useWorkspaceDetail(workspaceId ?? "", Boolean(user && workspaceId));
  const workspaces = useWorkspaceSwitcherList(Boolean(user));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent] = useState(() => readRecent(storage()));
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const commands = useMemo(() => buildCommands({
    workspace: workspaceId && workspace.data && !workspace.error
      ? { id: workspaceId, name: workspace.data.name, role: workspace.data.viewerRole }
      : undefined,
    workspaces: (workspaces.data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({ id: item.workspaceId, name: item.name })),
  }), [workspaceId, workspace.data, workspace.error, workspaces.data]);
  // Live results follow the typing after a 150 ms pause, so a fast typist
  // sends at most one search request per pause (FR-18).
  const [searchText, setSearchText] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useSearch({ query: searchText }, 8);
  const searchable = searchText.replace(/\s+/g, "").length >= 2;
  const pageItems = search.data?.pages[0]?.items;
  const current = searchable && searchText === query.trim();
  const hits = useMemo<SearchHit[]>(() => (current ? pageItems ?? [] : []), [current, pageItems]);
  // Typed but not yet sent, or sent and loading: both count as searching.
  const typedSearchable = query.trim().replace(/\s+/g, "").length >= 2;
  const searching = typedSearchable && (search.isFetching || searchText !== query.trim());
  const items = useMemo(() => {
    if (!query.trim()) return [...recentItems(recent), ...commands];
    const results = searchResultItems(hits, (hit) => resultHref({ ...hit, snippet: "", status: null, author: "", updatedAt: new Date() }));
    return [...matchCommands(commands, query), ...results, ...(query.trim().replace(/\s+/g, "").length >= 2 ? [seeAllResultsItem(query)] : [])];
  }, [commands, query, recent, hits]);

  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, []);
  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const run = async (item: CommandItem | undefined) => {
    if (!item) return;
    if (item.href) {
      rememberRecent(storage(), { label: item.label, href: item.href, hint: item.hint });
      onClose();
      router.push(item.href);
      return;
    }
    if (item.action === "shortcuts") { onClose(); setShortcutsOpen(true); return; }
    if (item.action === "new-workspace") { onClose(); setCreateWorkspaceOpen(true); return; }
    if (item.action?.startsWith("theme-")) { setMode(item.action.slice("theme-".length) as "light" | "dark" | "system"); onClose(); return; }
    if (item.action === "sign-out") {
      onClose();
      try { await logout.mutateAsync({}); } finally { router.replace("/login"); }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = items.length - 1;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index >= last ? 0 : index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index <= 0 ? Math.max(last, 0) : index - 1)); }
    else if (event.key === "Home" && items.length) { event.preventDefault(); setActive(0); }
    else if (event.key === "End" && items.length) { event.preventDefault(); setActive(last); }
    else if (event.key === "Enter") { event.preventDefault(); void run(items[active]); }
    else if (event.key === "Escape") { event.preventDefault(); onClose(); }
    else if (event.key === "Tab") { event.preventDefault(); }
  };

  return <div className={`${scrimClasses} z-[60] flex items-start justify-center px-3 pt-[12vh] sm:px-4`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Command palette" className={`${solidPanelClasses} w-full max-w-[38rem] overflow-hidden`}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={items.length ? optionId(active) : undefined}
        aria-label="Type a command or search"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={onKeyDown}
        placeholder="Type a command, a workspace or a page…"
        autoComplete="off"
        spellCheck={false}
        className="h-14 w-full border-b border-border-subtle bg-transparent px-5 text-[0.9375rem] text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto p-2">
        {items.map((item, index) => {
          const heading = index === 0 || items[index - 1]?.group !== item.group ? item.group : null;
          return <li key={item.id} role="presentation">
            {heading ? <div aria-hidden="true" className="px-3 pb-1.5 pt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">{heading}</div> : null}
            <div
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => setActive(index)}
              onClick={() => void run(item)}
              className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-[0.8125rem] transition-colors duration-100 ease-out ${index === active ? "bg-surface-active text-text-primary shadow-[inset_2px_0_0_var(--live)]" : "text-text-secondary"}`}
            >
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              {item.hint ? <span className="shrink-0 truncate font-mono text-[11px] text-text-muted">{item.hint}</span> : null}
            </div>
          </li>;
        })}
        {!items.length ? <li role="presentation" className="px-3 py-6 text-center text-sm text-text-muted">No matching commands.</li> : null}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-2 font-mono text-[11px] text-text-muted">
        <span>↑ ↓ to move · Enter to open · Esc to close</span>
        <span role="status" aria-live="polite">{searching ? "Searching…" : search.error && searchable ? "Search unavailable" : ""}</span>
      </div>
    </div>
  </div>;
}

export function ShortcutsSheet() {
  const open = useUiStore((state) => state.isShortcutsOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, [open]);
  if (!open) return null;
  const mod = isMacPlatform() ? "⌘" : "Ctrl";
  const rows: Array<[string, string]> = [
    [`${mod} K`, "Open or close the command palette"],
    ["?", "Show keyboard shortcuts"],
    ["↑ ↓ Home End", "Move through palette results"],
    ["Enter", "Open the selected result"],
    ["Esc", "Close the palette or this sheet"],
  ];
  return <div className={`${scrimClasses} z-[60] flex items-center justify-center p-4`} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" className={`${dialogPanelClasses} w-full max-w-md !rounded-2xl p-5 sm:p-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="shortcuts-title" className={dialogTitleClasses}>Keyboard shortcuts</h2>
        <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-lg px-3 text-[0.8125rem] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">Close</button>
      </div>
      <dl className="mt-4 divide-y divide-border-subtle">
        {rows.map(([keys, label]) => <div key={keys} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <dt className="text-text-secondary">{label}</dt>
          <dd><kbd className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 font-mono text-[11px] text-text-primary">{keys}</kbd></dd>
        </div>)}
      </dl>
    </div>
  </div>;
}
