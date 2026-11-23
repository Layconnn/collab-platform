import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  pathname: "/workspace/c000000000000000000000001/decisions",
  role: "MEMBER" as "OWNER" | "ADMIN" | "MEMBER",
  push: vi.fn(), replace: vi.fn(), setMode: vi.fn(), logout: vi.fn(),
  searchQueries: [] as string[],
  searchFetching: false,
  hits: [] as unknown[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), usePathname: () => mocks.pathname }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, logout: { mutateAsync: mocks.logout } }) }));
vi.mock("@/components/theme/ThemeProvider", () => ({ useTheme: () => ({ mode: "system", setMode: mocks.setMode }) }));
vi.mock("@/hooks/useSearch", () => ({
  useSearch: (filters: { query: string }) => {
    mocks.searchQueries.push(filters.query);
    const enabled = filters.query.replace(/\s+/g, "").length >= 2;
    return { data: enabled ? { pages: [{ items: mocks.hits, nextCursor: null }] } : undefined, isFetching: enabled && mocks.searchFetching, error: null };
  },
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceDetail: () => ({ data: { name: "Platform", viewerRole: mocks.role }, error: null }),
  useWorkspaceSwitcherList: () => ({ data: { pages: [{ items: [
    { workspaceId: "c000000000000000000000001", name: "Platform" },
    { workspaceId: "c000000000000000000000002", name: "Marketing" },
  ] }] } }),
}));

import { CommandPalette, ShortcutsSheet, useCommandShortcuts } from "./CommandPalette";
import { buildCommands, matchCommands, readRecent, rememberRecent, RECENT_KEY } from "./commandItems";
import { useUiStore } from "@/stores/ui.store";

function Host() {
  useCommandShortcuts();
  return <><button type="button">Before</button><input aria-label="Notes" /><CommandPalette /><ShortcutsSheet /></>;
}
const press = (key: string, init: KeyboardEventInit = {}) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init })); });
const combobox = () => screen.getByRole("combobox", { name: "Type a command or search" });
const options = () => screen.getAllByRole("option").map((option) => option.textContent);

describe("CommandPalette", () => {
  beforeEach(() => {
    mocks.pathname = "/workspace/c000000000000000000000001/decisions"; mocks.role = "MEMBER";
    mocks.searchQueries = []; mocks.searchFetching = false; mocks.hits = [];
    mocks.push.mockReset(); mocks.replace.mockReset(); mocks.setMode.mockReset(); mocks.logout.mockReset().mockResolvedValue({ success: true });
    useUiStore.setState({ isCommandPaletteOpen: false, isShortcutsOpen: false });
    window.localStorage.clear();
  });
  afterEach(() => cleanup());

  it("opens on Ctrl-K, focuses the input and returns focus on Escape", () => {
    render(<Host />);
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();
    press("k", { ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeTruthy();
    expect(document.activeElement).toBe(combobox());
    fireEvent.keyDown(combobox(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it("toggles closed with the same shortcut, and also opens with Cmd-K", () => {
    render(<Host />);
    press("k", { metaKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    press("k", { metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists actions for the current workspace and other workspaces; members cannot open the member list", () => {
    render(<Host />);
    press("k", { ctrlKey: true });
    expect(options()).toContain("New discussionPlatform");
    expect(options()).toContain("MarketingWorkspace");
    expect(options().some((label) => label?.startsWith("Open members"))).toBe(false);
  });

  it("shows the member list to admins", () => {
    mocks.role = "ADMIN";
    render(<Host />);
    press("k", { ctrlKey: true });
    expect(options()).toContain("Open membersPlatform");
  });

  it("filters as you type and opens the selection with Enter, remembering it", () => {
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "dec" } });
    expect(options()[0]).toBe("Open decisionsPlatform");
    fireEvent.keyDown(combobox(), { key: "Enter" });
    expect(mocks.push).toHaveBeenCalledWith("/workspace/c000000000000000000000001/decisions");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]")[0]).toMatchObject({ label: "Open decisions" });
  });

  it("moves the selection with the arrow keys and announces it", () => {
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "theme" } });
    const first = screen.getAllByRole("option")[0]!;
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(combobox().getAttribute("aria-activedescendant")).toBe(first.id);
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(combobox(), { key: "End" });
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("switches the theme and signs out", async () => {
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "dark theme" } });
    fireEvent.keyDown(combobox(), { key: "Enter" });
    expect(mocks.setMode).toHaveBeenCalledWith("dark");
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "sign out" } });
    await act(async () => { fireEvent.keyDown(combobox(), { key: "Enter" }); });
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/login");
  });

  it("says when nothing matches", () => {
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "z" } });
    expect(screen.getByText("No matching commands.")).toBeTruthy();
    expect(combobox().getAttribute("aria-activedescendant")).toBeNull();
    // Longer queries always offer the full search page.
    fireEvent.change(combobox(), { target: { value: "zzzz" } });
    expect(options()).toEqual(["See all results for “zzzz”"]);
  });

  it("opens the shortcuts sheet on ? but not while typing", () => {
    render(<Host />);
    const notes = screen.getByRole("textbox", { name: "Notes" });
    notes.focus();
    act(() => { notes.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true })); });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    press("?");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    expect(screen.getByText("Open or close the command palette")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("command items", () => {
  it("needs every typed word and ranks label matches first", () => {
    const items = buildCommands({ workspace: { id: "w1", name: "Platform", role: "OWNER" }, workspaces: [] });
    expect(matchCommands(items, "open dec").map((i) => i.id)).toEqual(["open-decisions"]);
    expect(matchCommands(items, "log out").map((i) => i.id)).toEqual(["sign-out"]);
    expect(matchCommands(items, "THEME")[0]?.label).toMatch(/theme/);
    expect(matchCommands(items, "nothing like this")).toEqual([]);
  });

  it("omits workspace actions outside a workspace", () => {
    const ids = buildCommands({ workspaces: [{ id: "w2", name: "Other" }] }).map((i) => i.id);
    expect(ids).not.toContain("new-discussion");
    expect(ids).toContain("workspace-w2");
  });

  it("keeps the six most recent places without duplicates and survives bad storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    for (let i = 0; i < 8; i++) rememberRecent(storage, { label: `Page ${i}`, href: `/p/${i}` });
    rememberRecent(storage, { label: "Page 3 again", href: "/p/3" });
    expect(readRecent(storage).map((e) => e.label)).toEqual(["Page 3 again", "Page 7", "Page 6", "Page 5", "Page 4", "Page 2"]);
    store.set(RECENT_KEY, "{not json");
    expect(readRecent(storage)).toEqual([]);
    store.set(RECENT_KEY, JSON.stringify([{ label: "Evil", href: "https://example.com" }]));
    expect(readRecent(storage)).toEqual([]);
    expect(() => rememberRecent({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }, { label: "x", href: "/x" })).not.toThrow();
  });
});

describe("CommandPalette live search", () => {
  const ws = { id: "c000000000000000000000001", name: "Platform" };
  beforeEach(() => {
    mocks.pathname = "/workspace"; mocks.searchQueries = []; mocks.searchFetching = false;
    mocks.push.mockReset();
    mocks.hits = [
      { type: "COMMENT", id: "c3", title: "Pick a queue", workspace: ws, discussionId: "c2" },
      { type: "DECISION", id: "c1", title: "Use Vercel Queues", workspace: ws, discussionId: null },
      { type: "DISCUSSION", id: "c2", title: "Pick a queue", workspace: ws, discussionId: "c2" },
    ];
    useUiStore.setState({ isCommandPaletteOpen: false, isShortcutsOpen: false });
    window.localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("searches 150 ms after typing stops and groups results by type", () => {
    vi.useFakeTimers();
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "que" } });
    fireEvent.change(combobox(), { target: { value: "queue" } });
    expect(mocks.searchQueries.at(-1)).toBe("");
    act(() => { vi.advanceTimersByTime(149); });
    expect(mocks.searchQueries.at(-1)).toBe("");
    act(() => { vi.advanceTimersByTime(1); });
    expect(mocks.searchQueries.at(-1)).toBe("queue");
    expect(mocks.searchQueries).not.toContain("que");
    expect(options()).toEqual([
      "Use Vercel QueuesPlatform",
      "Pick a queuePlatform",
      "Reply in Pick a queuePlatform",
      "See all results for “queue”",
    ]);
    expect(screen.getByText("Decisions")).toBeTruthy();
    expect(screen.getByText("Replies")).toBeTruthy();
  });

  it("keeps matching actions above search results", () => {
    vi.useFakeTimers();
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "new workspace" } });
    act(() => { vi.advanceTimersByTime(150); });
    expect(options()[0]).toBe("New workspace");
    expect(options().at(-1)).toBe("See all results for “new workspace”");
  });

  it("opens a result and offers the full search page", () => {
    vi.useFakeTimers();
    const view = render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "queue" } });
    act(() => { vi.advanceTimersByTime(150); });
    fireEvent.keyDown(combobox(), { key: "Enter" });
    expect(mocks.push).toHaveBeenLastCalledWith(`/workspace/${ws.id}/decisions/c1`);
    view.unmount();
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "vercel queues" } });
    act(() => { vi.advanceTimersByTime(150); });
    fireEvent.keyDown(combobox(), { key: "End" });
    fireEvent.keyDown(combobox(), { key: "Enter" });
    expect(mocks.push).toHaveBeenLastCalledWith("/search?q=vercel%20queues");
  });

  it("announces while searching and hides stale results", () => {
    vi.useFakeTimers();
    mocks.searchFetching = true;
    render(<Host />);
    press("k", { ctrlKey: true });
    fireEvent.change(combobox(), { target: { value: "queue" } });
    expect(screen.getByRole("status").textContent).toBe("Searching…");
    expect(options().some((label) => label?.includes("Vercel"))).toBe(false);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.getByRole("status").textContent).toBe("Searching…");
  });
});
