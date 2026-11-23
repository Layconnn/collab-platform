import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  params: "",
  replace: vi.fn(),
  lastFilters: null as null | Record<string, unknown>,
  items: [] as unknown[],
  error: null as null | { data: { code: string } },
  isLoading: false,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.params),
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/search",
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "c000000000000000000000099" } }) }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceSwitcherList: () => ({ data: { pages: [{ items: [{ workspaceId: "c000000000000000000000001", name: "Platform" }] }] } }),
}));
vi.mock("@/hooks/useSearch", () => ({
  useSearch: (filters: Record<string, unknown>) => {
    mocks.lastFilters = filters;
    return {
      data: mocks.isLoading ? undefined : { pages: [{ items: mocks.items, nextCursor: null }] },
      error: mocks.error, isLoading: mocks.isLoading, isFetching: false,
      hasNextPage: mocks.hasNextPage, isFetchingNextPage: false, fetchNextPage: mocks.fetchNextPage, refetch: mocks.refetch,
    };
  },
}));

import { SearchPage, Snippet, resultHref } from "./SearchPage";

const ws = { id: "c000000000000000000000001", name: "Platform" };
const result = (overrides: Record<string, unknown>) => ({
  type: "DECISION", id: "c000000000000000000000002", workspace: ws, title: "Use Vercel Queues",
  snippet: "Publish one \u0002job\u0003 per event.", status: "DECIDED", author: "Maya", discussionId: null,
  updatedAt: new Date(Date.now() - 2 * 3_600_000), ...overrides,
});

describe("SearchPage", () => {
  beforeEach(() => {
    mocks.params = ""; mocks.items = []; mocks.error = null; mocks.isLoading = false; mocks.hasNextPage = false; mocks.lastFilters = null;
    mocks.replace.mockReset(); mocks.fetchNextPage.mockReset(); mocks.refetch.mockReset();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("starts with a focused search box and tips", () => {
    render(<SearchPage />);
    const input = screen.getByRole("searchbox", { name: "Search decisions, discussions and replies" });
    expect(document.activeElement).toBe(input);
    expect(screen.getByText("Find anything your team has discussed or decided.")).toBeTruthy();
  });

  it("puts the query in the URL after a pause in typing", () => {
    vi.useFakeTimers();
    render(<SearchPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "worker queue" } });
    expect(mocks.replace).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(mocks.replace).toHaveBeenCalledWith("/search?q=worker+queue", { scroll: false });
  });

  it("reads every filter from the URL", () => {
    mocks.params = "q=queue&type=decision,comment&workspace=c000000000000000000000001&status=decided&mine=1&since=week";
    render(<SearchPage />);
    expect(mocks.lastFilters).toMatchObject({
      query: "queue", types: ["DECISION", "COMMENT"], workspaceId: ws.id, status: "DECIDED", authorId: "c000000000000000000000099",
    });
    expect((mocks.lastFilters?.updatedAfter as Date).getTime()).toBeLessThan(Date.now() - 6 * 86_400_000);
    expect(screen.getByRole("button", { name: "Decisions" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Discussions" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("A status filter shows decisions only.")).toBeTruthy();
  });

  it("changes filters through the URL and clears them together", () => {
    mocks.params = "q=queue&type=decision";
    render(<SearchPage />);
    fireEvent.click(screen.getByRole("button", { name: "Replies" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/search?q=queue&type=decision%2Ccomment", { scroll: false });
    fireEvent.change(screen.getByRole("combobox", { name: /Workspace/ }), { target: { value: ws.id } });
    expect(mocks.replace).toHaveBeenLastCalledWith(`/search?q=queue&type=decision&workspace=${ws.id}`, { scroll: false });
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]!);
    expect(mocks.replace).toHaveBeenLastCalledWith("/search?q=queue", { scroll: false });
  });

  it("shows results with highlighted snippets, links and details", () => {
    mocks.params = "q=job";
    mocks.items = [result({}), result({ type: "COMMENT", id: "c000000000000000000000003", title: "Pick a queue", status: null, discussionId: "c000000000000000000000004", snippet: "the \u0002job\u0003 runs" })];
    render(<SearchPage />);
    const rows = within(screen.getByRole("region", { name: "Search results" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("link", { name: "Use Vercel Queues" }).getAttribute("href")).toBe(`/workspace/${ws.id}/decisions/c000000000000000000000002`);
    expect(rows[0]!.querySelector("mark")?.textContent).toBe("job");
    expect(rows[0]!.textContent).toContain("Platform");
    expect(rows[0]!.textContent).toContain("Maya · updated 2 hours ago");
    expect(within(rows[1]!).getByRole("link", { name: "Reply in Pick a queue" }).getAttribute("href")).toBe(`/workspace/${ws.id}/discussions/c000000000000000000000004`);
    expect(screen.getByRole("status").textContent).toBe("2 results");
  });

  it("offers more results and explains empty and failed searches", () => {
    mocks.params = "q=job";
    mocks.items = [result({})];
    mocks.hasNextPage = true;
    const view = render(<SearchPage />);
    fireEvent.click(screen.getByRole("button", { name: "More results" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();

    mocks.items = []; mocks.hasNextPage = false; mocks.params = "q=nothing&type=decision";
    view.rerender(<SearchPage />);
    expect(screen.getByText("No results for “nothing”")).toBeTruthy();
    expect(screen.getByText("Try clearing the filters, or use fewer words.")).toBeTruthy();

    mocks.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    view.rerender(<SearchPage />);
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("asks for two characters before searching", () => {
    mocks.params = "q=a";
    const { container } = render(<SearchPage />);
    expect(screen.getByText("Keep typing: use at least two characters.")).toBeTruthy();
    expect(container.querySelector("ol"), "no results list").toBeNull();
  });
});

describe("Snippet and links", () => {
  it("marks only the highlighted words", () => {
    const { container } = render(<p><Snippet text={"a \u0002b\u0003 c \u0002d\u0003"} /></p>);
    expect([...container.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["b", "d"]);
    expect(container.textContent).toBe("a b c d");
  });

  it("links each result type to its page", () => {
    expect(resultHref(result({ type: "DISCUSSION", id: "d1" }) as never)).toBe(`/workspace/${ws.id}/discussions/d1`);
    expect(resultHref(result({ type: "COMMENT", discussionId: "d2" }) as never)).toBe(`/workspace/${ws.id}/discussions/d2`);
  });
});
