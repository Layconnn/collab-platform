import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";

const props = {
  pathname: "/workspace/workspace-1",
  currentId: "workspace-1",
  currentWorkspace: { name: "Open Atlas" },
  workspaces: [],
  isLoading: false,
  hasError: false,
  hasMore: false,
  isFetchingMore: false,
  onLoadMore: () => {},
  onRetry: vi.fn(),
};

describe("WorkspaceSwitcher", () => {
  afterEach(cleanup);

  it("keeps the expanded menu in the sidebar flow", () => {
    const { container } = render(<WorkspaceSwitcher {...props} />);

    expect(screen.getByText("Switch workspace")).toBeTruthy();
    const menu = container.querySelector("details > div");
    expect(menu?.className).toContain("w-full");
    expect(menu?.className).not.toContain("absolute");
  });

  it("anchors the collapsed flyout and bounds it to the viewport", () => {
    const { container } = render(<WorkspaceSwitcher {...props} collapsed />);

    const menu = container.querySelector("details > div");
    expect(menu?.className).toContain("absolute left-full top-0");
    expect(menu?.className).toContain("max-h-[calc(100dvh-5rem)]");
    expect(menu?.className).toContain("w-[min(18rem,calc(100vw-5.5rem))]");
  });

  it("offers retry when the workspace directory cannot load", async () => {
    props.onRetry.mockReset();
    render(<WorkspaceSwitcher {...props} hasError />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and restores focus to the switcher", async () => {
    const { container } = render(<WorkspaceSwitcher {...props} />);
    const trigger = screen.getByText("Open Atlas").closest("summary")!;
    const details = container.querySelector("details")!;
    await userEvent.setup().click(trigger);
    expect(details.open).toBe(true);
    await userEvent.setup().keyboard("{Escape}");
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when focus moves outside without stealing that focus", async () => {
    const { container } = render(<><WorkspaceSwitcher {...props} /><button>Outside</button></>);
    const trigger = screen.getByText("Open Atlas").closest("summary")!;
    const outside = screen.getByRole("button", { name: "Outside" });
    const details = container.querySelector("details")!;
    await userEvent.setup().click(trigger);
    outside.focus();
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(outside);
  });
});
