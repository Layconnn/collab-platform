import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/hooks/useReactions", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSetReaction: () => ({ mutate: mocks.mutate }),
}));

import { ReactionBar, reactedBy } from "./ReactionBar";
import { applyReaction } from "@/hooks/useReactions";

const ws = "c000000000000000000000001", d = "c000000000000000000000002", c = "c000000000000000000000003";

describe("ReactionBar", () => {
  beforeEach(() => mocks.mutate.mockReset());
  afterEach(() => cleanup());

  it("shows counts, who reacted and the viewer's own as pressed", () => {
    render(<ReactionBar workspaceId={ws} discussionId={d} commentId={c} reactions={[
      { emoji: "👍", count: 3, mine: true, people: ["You", "Kim", "Lee"] },
      { emoji: "👀", count: 1, mine: false, people: ["Sam"] },
    ]} />);
    const up = screen.getByRole("button", { name: /^thumbs up 3, you reacted\. You, Kim and Lee$/ });
    expect(up.getAttribute("aria-pressed")).toBe("true");
    expect(up.getAttribute("title")).toBe("You, Kim and Lee");
    expect(screen.getByRole("button", { name: /^eyes 1\. Sam$/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles the viewer's reaction on a reply", () => {
    render(<ReactionBar workspaceId={ws} discussionId={d} commentId={c} reactions={[{ emoji: "👍", count: 1, mine: true, people: ["You"] }]} />);
    fireEvent.click(screen.getByRole("button", { name: /^thumbs up 1, you reacted/ }));
    expect(mocks.mutate).toHaveBeenCalledWith({ workspaceId: ws, commentId: c, emoji: "👍", active: false });
  });

  it("adds a reaction to the discussion from the picker, by keyboard", () => {
    render(<ReactionBar workspaceId={ws} discussionId={d} reactions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add reaction" }));
    const menu = screen.getByRole("menu", { name: "Choose a reaction" });
    expect(within(menu).getAllByRole("menuitemcheckbox")).toHaveLength(8);
    expect(document.activeElement).toBe(within(menu).getByRole("menuitemcheckbox", { name: "React with thumbs up" }));
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitemcheckbox", { name: "React with heart" }));
    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "React with rocket" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ workspaceId: ws, discussionId: d, emoji: "🚀", active: true });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the picker with Escape and returns focus", () => {
    render(<ReactionBar workspaceId={ws} discussionId={d} reactions={[]} />);
    const trigger = screen.getByRole("button", { name: "Add reaction" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("is read only while reactions load", () => {
    render(<ReactionBar workspaceId={ws} discussionId={d} reactions={[{ emoji: "🎉", count: 2, mine: false, people: ["Kim", "Lee"] }]} disabled />);
    expect(screen.queryByRole("button", { name: "Add reaction" })).toBeNull();
    expect((screen.getByRole("button", { name: /party 2/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("reaction helpers", () => {
  it("names who reacted", () => {
    expect(reactedBy({ count: 1, people: ["Maya"] })).toBe("Maya");
    expect(reactedBy({ count: 2, people: ["You", "Kim"] })).toBe("You and Kim");
    expect(reactedBy({ count: 3, people: ["Maya", "Kim", "Lee"] })).toBe("Maya, Kim and Lee");
    expect(reactedBy({ count: 7, people: ["You", "Kim", "Lee", "Sam"] })).toBe("You, Kim, Lee and 4 others");
  });

  it("applies the viewer's own reaction before the server answers", () => {
    const list = [{ emoji: "👍", count: 1, mine: false, people: ["Kim"] }];
    expect(applyReaction(list, "👍", true)).toEqual([{ emoji: "👍", count: 2, mine: true, people: ["You", "Kim"] }]);
    expect(applyReaction(list, "🎉", true)).toEqual([...list, { emoji: "🎉", count: 1, mine: true, people: ["You"] }]);
    expect(applyReaction([{ emoji: "🎉", count: 1, mine: true, people: ["You"] }], "🎉", false)).toEqual([]);
    expect(applyReaction(list, "👍", false)).toBe(list);
  });
});
