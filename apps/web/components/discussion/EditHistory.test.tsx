import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  discussion: { data: undefined as unknown, isLoading: false, error: null as unknown, isFetching: false, refetch: vi.fn() },
  comment: { data: undefined as unknown, isLoading: false, error: null as unknown, isFetching: false, refetch: vi.fn() },
  discussionCalls: [] as unknown[],
}));

vi.mock("@/hooks/useDiscussion", () => ({
  useDiscussionHistory: (...args: unknown[]) => { mocks.discussionCalls.push(args); return mocks.discussion; },
}));
vi.mock("@/hooks/useComment", () => ({ useCommentHistory: () => mocks.comment }));

import { EditedButton } from "./EditHistory";

const at = (day: number) => new Date(`2026-11-${day}T10:00:00.000Z`);

describe("EditedButton", () => {
  afterEach(() => {
    cleanup();
    mocks.discussionCalls = [];
    mocks.discussion = { data: undefined, isLoading: false, error: null, isFetching: false, refetch: vi.fn() };
    mocks.comment = { data: undefined, isLoading: false, error: null, isFetching: false, refetch: vi.fn() };
  });

  it("loads nothing until opened, then shows each discussion version with what the next edit changed", () => {
    mocks.discussion.data = {
      total: 3,
      versions: [
        { version: 3, current: true, title: "Which queue for jobs?", body: "Second draft", fileNames: ["plan-v2.pdf"], byLabel: "Maya", at: at(26) },
        { version: 2, current: false, title: "Which queue for jobs?", body: "First draft", fileNames: ["plan.pdf"], byLabel: "Sam", at: at(25) },
        { version: 1, current: false, title: "Which queue?", body: "First draft", fileNames: ["plan.pdf"], byLabel: "Sam", at: at(24) },
      ],
    };
    render(<EditedButton target={{ discussionId: "d1" }} at={at(26)} />);
    expect(mocks.discussionCalls).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Edited.*show edit history/ }));
    const dialog = screen.getByRole("dialog", { name: "Discussion history" });
    expect(dialog.textContent).toContain("2 edits, newest first.");
    const versions = within(dialog).getAllByRole("listitem").filter((item) => item.querySelector("h3"));
    expect(versions.map((item) => item.querySelector("h3")!.textContent)).toEqual(["Current version", "Version 2", "Original"]);
    expect(versions[0]!.textContent).toContain("Edited by Maya");
    expect(versions[2]!.textContent).toContain("Written by Sam");

    // Version 2: Maya's edit replaced the body and swapped the file.
    expect(versions[1]!.querySelector("del")!.textContent).toBe("removed: First");
    expect(versions[1]!.querySelector("ins")!.textContent).toBe("added: Second");
    expect(within(versions[1]!).getByText("plan.pdf").tagName).toBe("DEL");
    expect(within(versions[1]!).getByText("plan-v2.pdf").tagName).toBe("INS");
    // The original: the title's last word became "queue for jobs?".
    expect([...versions[2]!.querySelectorAll("del, ins")].map((node) => node.textContent)).toEqual(["removed: queue?", "added: queue for jobs?"]);
    // The current version is plain text.
    expect(versions[0]!.querySelector("del, ins")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a reply's history without titles, and an empty text plainly", () => {
    mocks.comment.data = {
      total: 2,
      versions: [
        { version: 2, current: true, body: "", fileNames: ["chart.png"], byLabel: "Sam", at: at(26) },
        { version: 1, current: false, body: "See the chart", fileNames: ["chart.png"], byLabel: "Sam", at: at(25) },
      ],
    };
    render(<EditedButton target={{ commentId: "c1" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Edited/ }));
    const dialog = screen.getByRole("dialog", { name: "Reply history" });
    expect(dialog.textContent).toContain("1 edit, newest first.");
    expect(within(dialog).getByText("No text")).toBeTruthy();
    const original = within(dialog).getByRole("heading", { name: "Original" }).closest("li")!;
    expect(original.querySelector("del")!.textContent).toBe("removed: See the chart");
  });

  it("says when the history is loading, failed, or longer than shown", () => {
    mocks.comment.isLoading = true;
    const { rerender } = render(<EditedButton target={{ commentId: "c1" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Edited/ }));
    expect(screen.getByRole("status").textContent).toContain("Loading the history");

    mocks.comment = { ...mocks.comment, isLoading: false, error: new Error("offline") };
    rerender(<EditedButton target={{ commentId: "c1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.comment.refetch).toHaveBeenCalled();

    mocks.comment = { ...mocks.comment, error: null, data: { total: 60, versions: [{ version: 60, current: true, body: "Latest", fileNames: [], byLabel: "Sam", at: at(26) }] } };
    rerender(<EditedButton target={{ commentId: "c1" }} />);
    expect(screen.getByText("Showing the newest 1 of 60 versions.")).toBeTruthy();
  });
});
