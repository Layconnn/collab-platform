import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ status: "NONE" as "FOLLOWING" | "MUTED" | "NONE", mutate: vi.fn() }));
vi.mock("@/hooks/useFollow", () => ({
  useDiscussionFollow: () => ({
    follow: { data: { status: mocks.status, followers: 2 } },
    set: { mutate: mocks.mutate, isPending: false, isSuccess: false, error: null },
  }),
}));

import { FollowControl } from "./FollowControl";

const key = { workspaceId: "c000000000000000000000001", discussionId: "c000000000000000000000002" };

describe("FollowControl", () => {
  beforeEach(() => { mocks.status = "NONE"; mocks.mutate.mockReset(); });
  afterEach(() => cleanup());

  it("follows in one click when not following", () => {
    render(<FollowControl {...key} />);
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ ...key, status: "FOLLOWING" });
  });

  it("offers mute and unfollow when following, by keyboard", () => {
    mocks.status = "FOLLOWING";
    render(<FollowControl {...key} />);
    const trigger = screen.getByRole("button", { name: "Following" });
    expect(trigger.getAttribute("title")).toBe("You hear about new replies.");
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Notifications for this discussion" });
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => [item.textContent?.split(/(?=[A-Z][a-z]+ )/)[0], item.getAttribute("aria-checked")])).toEqual([["Follow", "true"], ["Mute", "false"], ["Unfollow", "false"]]);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.click(items[1]!);
    expect(mocks.mutate).toHaveBeenCalledWith({ ...key, status: "MUTED" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows a muted discussion and lets the member follow again", () => {
    mocks.status = "MUTED";
    render(<FollowControl {...key} />);
    fireEvent.click(screen.getByRole("button", { name: "Muted" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Follow/ }));
    expect(mocks.mutate).toHaveBeenCalledWith({ ...key, status: "FOLLOWING" });
  });

  it("closes with Escape without changing anything", () => {
    mocks.status = "FOLLOWING";
    render(<FollowControl {...key} />);
    fireEvent.click(screen.getByRole("button", { name: "Following" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
