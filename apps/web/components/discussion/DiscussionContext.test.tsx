import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  context: null as null | Record<string, unknown>,
  error: null as null | { data: { code: string } },
  pins: [] as unknown[],
}));

vi.mock("@/hooks/useDiscussion", () => ({ useDiscussionContext: () => ({ data: mocks.context, error: mocks.error }) }));
vi.mock("@/hooks/usePins", () => ({ usePinnedReplies: () => ({ data: { canPin: true, max: 3, items: mocks.pins } }) }));

import { DiscussionContext } from "./DiscussionContext";

const panel = (props: Partial<Parameters<typeof DiscussionContext>[0]> = {}) => (
  <DiscussionContext workspaceId="w1" discussionId="d1" files={[]} canPropose onPropose={() => {}} {...props} />
);

describe("DiscussionContext", () => {
  beforeEach(() => {
    mocks.context = { replies: 0, people: [], morePeople: 0, decisions: [] };
    mocks.error = null;
    mocks.pins = [];
  });
  afterEach(cleanup);

  it("invites a proposal when the discussion has no decision", () => {
    const onPropose = vi.fn();
    render(panel({ onPropose }));
    expect(screen.getByText(/No decision yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Propose a decision" }));
    expect(onPropose).toHaveBeenCalledOnce();
    cleanup();
    render(panel({ canPropose: false }));
    expect(screen.queryByRole("button", { name: "Propose a decision" })).toBeNull();
  });

  it("links each decision with its status", () => {
    mocks.context = { replies: 2, people: [], morePeople: 0, decisions: [
      { id: "x1", question: "Ship logo B", status: "DECIDED" },
      { id: "x2", question: "Ship logo A", status: "SUPERSEDED" },
    ] };
    render(panel());
    const section = screen.getByRole("region", { name: "Decisions · 2" });
    const links = within(section).getAllByRole("link");
    expect(links[0]!.getAttribute("href")).toBe("/workspace/w1/decisions/x1");
    expect(within(links[0]!).getByText("Decided").className).toContain("bg-status-decided");
    expect(within(links[1]!).getByText("Replaced")).toBeTruthy();
  });

  it("lists the author and repliers with their counts", () => {
    mocks.context = { replies: 3, morePeople: 2, decisions: [], people: [
      { id: "u1", name: "Maya Okafor", username: "maya", author: true, replies: 0 },
      { id: "u2", name: null, username: "sam", author: false, replies: 2 },
      { id: "u3", name: "Lee", username: "lee", author: false, replies: 1 },
    ] };
    render(panel());
    const section = screen.getByRole("region", { name: "People · 5" });
    expect(within(section).getAllByRole("listitem").map((row) => row.textContent)).toEqual(["MOMaya OkaforAuthor", "SAsam2 replies", "LELee1 reply"]);
    expect(within(section).getByText("and 2 others")).toBeTruthy();
  });

  it("lists the discussion's files with download links", () => {
    render(panel({ files: [{ id: "f1", fileName: "brief.pdf", size: 176 * 1024 }] }));
    const section = screen.getByRole("region", { name: "Files · 1" });
    expect(within(section).getByRole("link", { name: "brief.pdf" }).getAttribute("href")).toBe("/api/files/f1");
    expect(section.textContent).toContain("176 KB");
  });

  it("quotes pinned replies with their author and pinner, linking to the reply", () => {
    mocks.pins = [
      { commentId: "c1", excerpt: "B reads better at small sizes.", author: "Sam", pinnedBy: "Maya" },
      { commentId: "c2", excerpt: "", author: "Kim", pinnedBy: null },
    ];
    render(panel());
    const section = screen.getByRole("region", { name: "Pinned" });
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["“B reads better at small sizes.” Sam", "#comment-c1"],
      ["“(no text)” Kim", "#comment-c2"],
    ]);
    expect(within(section).getByText("Pinned by Maya")).toBeTruthy();
  });

  it("says when people cannot be loaded", () => {
    mocks.context = null;
    mocks.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    render(panel());
    expect(screen.getByText("People are unavailable right now.")).toBeTruthy();
  });
});
