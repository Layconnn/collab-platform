import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ items: [] as unknown[], mutate: vi.fn(), next: false, fetchNextPage: vi.fn() }));
vi.mock("@/hooks/useSaved", () => ({
  useSavedList: () => ({ data: { pages: [{ items: mocks.items, nextCursor: null }] }, isLoading: false, error: null, isFetching: false, hasNextPage: mocks.next, isFetchingNextPage: false, fetchNextPage: mocks.fetchNextPage, refetch: vi.fn() }),
  useSetSaved: () => ({ mutate: mocks.mutate, isPending: false }),
}));

import { SavedPage } from "./SavedPage";

const ws = { id: "w1", name: "Platform" };

describe("SavedPage", () => {
  beforeEach(() => { mocks.items = []; mocks.mutate.mockReset(); mocks.next = false; });
  afterEach(() => cleanup());

  it("explains an empty list", () => {
    render(<SavedPage />);
    expect(screen.getByRole("heading", { name: "Nothing saved yet" })).toBeTruthy();
  });

  it("lists saved discussions, replies and decisions with links and lets the member remove one", () => {
    mocks.items = [
      { id: "s1", type: "REPLY", savedAt: new Date(), workspace: ws, title: "Which queue?", excerpt: "Vercel Queues.", by: "Lee", href: "/workspace/w1/discussions/d1#comment-c1", target: { commentId: "c1" } },
      { id: "s2", type: "DECISION", savedAt: new Date(), workspace: ws, title: "Use Vercel Queues", excerpt: "Finalized decision", by: "Sam", href: "/workspace/w1/decisions/x1", target: { decisionId: "x1" } },
    ];
    mocks.next = true;
    render(<SavedPage />);
    const rows = within(screen.getByRole("list", { name: "Saved items" })).getAllByRole("listitem");
    expect(within(rows[0]!).getByRole("link", { name: "Reply in Which queue?" }).getAttribute("href")).toBe("/workspace/w1/discussions/d1#comment-c1");
    expect(rows[0]!.textContent).toContain("Lee: Vercel Queues.");
    expect(rows[1]!.textContent).toContain("Decision · Platform");
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "Remove decision “Use Vercel Queues” from Saved" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ workspaceId: "w1", decisionId: "x1", saved: false });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });
});
