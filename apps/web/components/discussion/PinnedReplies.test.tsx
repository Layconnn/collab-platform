import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/hooks/usePins", () => ({ usePinnedReplies: () => ({ data: { canPin: true, max: 3, items: mocks.items } }) }));

import { PinnedReplies } from "./PinnedReplies";

describe("PinnedReplies", () => {
  afterEach(() => cleanup());

  it("shows nothing when no reply is pinned", () => {
    mocks.items = [];
    const { container } = render(<PinnedReplies workspaceId="w" discussionId="d" />);
    expect(container.innerHTML).toBe("");
  });

  it("lists pinned replies with their author, excerpt, pinner and a link to the reply", () => {
    mocks.items = [
      { commentId: "c1", excerpt: "Vercel Queues, because it costs nothing.", author: "Lee", pinnedBy: "Sam" },
      { commentId: "c2", excerpt: "", author: "Kim", pinnedBy: null },
    ];
    render(<PinnedReplies workspaceId="w" discussionId="d" />);
    const section = screen.getByRole("region", { name: "Pinned replies" });
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Lee: Vercel Queues, because it costs nothing.", "#comment-c1"],
      ["Kim: (no text)", "#comment-c2"],
    ]);
    expect(within(section).getByText("Pinned by Sam")).toBeTruthy();
  });
});
