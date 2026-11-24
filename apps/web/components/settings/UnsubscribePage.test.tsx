import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  describe: { data: undefined as unknown, error: null as unknown, isLoading: false },
  apply: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null as unknown, variables: undefined as unknown },
}));
vi.mock("@/hooks/useDigest", () => ({ useUnsubscribeLink: () => ({ describe: mocks.describe, apply: mocks.apply }) }));

import { UnsubscribePage } from "./UnsubscribePage";

describe("UnsubscribePage", () => {
  beforeEach(() => {
    mocks.describe = { data: { scope: "workspace", workspaceName: "Marketing" }, error: null, isLoading: false };
    mocks.apply = { mutate: vi.fn(), isPending: false, isSuccess: false, error: null, variables: undefined };
  });
  afterEach(() => cleanup());

  it("asks before stopping anything; opening the link changes nothing", () => {
    render(<UnsubscribePage token="tok" />);
    expect(screen.getByRole("heading", { name: "Stop digests for Marketing?" })).toBeTruthy();
    expect(mocks.apply.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stop digests for Marketing" }));
    expect(mocks.apply.mutate).toHaveBeenCalledWith({ token: "tok", undo: false });
  });

  it("confirms and offers undo", () => {
    mocks.describe.data = { scope: "all", workspaceName: null };
    mocks.apply = { ...mocks.apply, isSuccess: true, variables: { token: "tok", undo: false } };
    render(<UnsubscribePage token="tok" />);
    expect(screen.getByText("You will not get daily digests any more.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.apply.mutate).toHaveBeenCalledWith({ token: "tok", undo: true });
  });

  it("explains an expired or changed link", () => {
    mocks.describe = { data: undefined, error: { message: "invalid" }, isLoading: false };
    render(<UnsubscribePage token="bad" />);
    expect(screen.getByRole("heading", { name: "This link has expired" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email settings" }).getAttribute("href")).toBe("/settings/email");
  });
});
