import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  exportData: vi.fn(),
  close: vi.fn(),
  twoStep: false,
  workspaces: [{ workspaceId: "w2", name: "Marketing", role: "MEMBER" }] as Array<{ workspaceId: string; name: string; role: string }>,
  closeError: null as null | { data: { code: string }; message: string },
}));

vi.mock("@/hooks/useWorkspace", () => ({ useWorkspaceSwitcherList: () => ({ data: { pages: [{ items: mocks.workspaces }] } }) }));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    security: {
      twoStep: { useQuery: () => ({ data: { enabled: mocks.twoStep } }) },
      exportData: { useMutation: () => ({ mutate: mocks.exportData, isPending: false, error: null }) },
      closeAccount: { useMutation: () => ({ mutate: mocks.close, reset: vi.fn(), isPending: false, error: mocks.closeError }) },
    },
  },
}));

import { YourDataSettings } from "./YourDataSettings";

describe("Your data", () => {
  beforeEach(() => {
    mocks.exportData.mockReset(); mocks.close.mockReset(); mocks.twoStep = false; mocks.closeError = null;
    mocks.workspaces = [{ workspaceId: "w2", name: "Marketing", role: "MEMBER" }];
  });
  afterEach(cleanup);

  it("downloads everything as one JSON file", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<YourDataSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Download your data" }));
    mocks.exportData.mock.calls[0]![1].onSuccess({ exportedAt: "2026-11-27T10:00:00.000Z", profile: { username: "sam" } });
    expect(createObjectURL).toHaveBeenCalled();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("commons-sam-2026-11-27.json");
    click.mockRestore();
  });

  it("closes with the password after asking", () => {
    render(<YourDataSettings />);
    expect(screen.queryByLabelText("Password")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close your account…" }));
    expect(screen.queryByLabelText("Code from your app or a recovery code")).toBeNull();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "my-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Close my account" }));
    expect(mocks.close).toHaveBeenCalledWith({ password: "my-password-1" }, expect.any(Object));
  });

  it("asks for a code with two-step on", () => {
    mocks.twoStep = true;
    render(<YourDataSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Close your account…" }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "my-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Close my account" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a code from your authenticator app or a recovery code.");
    fireEvent.change(screen.getByLabelText("Code from your app or a recovery code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Close my account" }));
    expect(mocks.close).toHaveBeenCalledWith({ password: "my-password-1", code: "123456" }, expect.any(Object));
  });

  it("tells an owner which workspaces to hand on first", () => {
    mocks.workspaces = [{ workspaceId: "w1", name: "Platform", role: "OWNER" }, { workspaceId: "w2", name: "Marketing", role: "MEMBER" }];
    render(<YourDataSettings />);
    expect(screen.getByRole("link", { name: "Platform" }).getAttribute("href")).toBe("/workspace/w1/members");
    expect(screen.getByRole("button", { name: "Close your account…" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows the server's reason", () => {
    mocks.closeError = { data: { code: "FORBIDDEN" }, message: "Your password is incorrect." };
    render(<YourDataSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Close your account…" }));
    expect(screen.getByRole("alert").textContent).toBe("Your password is incorrect.");
  });
});
