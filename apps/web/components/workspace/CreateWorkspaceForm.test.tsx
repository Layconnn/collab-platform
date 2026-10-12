import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  pending: false,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/hooks/useWorkspace", () => ({
  useCreateWorkspace: () => ({
    mutateAsync: mocks.create,
    isPending: mocks.pending,
  }),
}));

import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";

describe("CreateWorkspaceForm", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.create.mockReset();
    mocks.pending = false;
  });
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", window.location.pathname);
    vi.unstubAllGlobals();
  });

  it("focuses the creation form when reached through the workspace anchor", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    window.history.replaceState(null, "", "#new-workspace");
    render(<CreateWorkspaceForm />);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Workspace name" }),
      ),
    );
  });

  it("restores focus when the workspace anchor is selected again", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    window.history.replaceState(null, "", "#new-workspace");
    render(<><a href="#new-workspace">New workspace</a><CreateWorkspaceForm /></>);
    const link = screen.getByRole("link", { name: "New workspace" });
    link.focus();
    fireEvent.click(link);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Workspace name" })));
  });

  it("suggests an address and preserves a manually edited address", async () => {
    render(<CreateWorkspaceForm />);
    const name = screen.getByRole("textbox", {
      name: "Workspace name",
    }) as HTMLInputElement;
    const slug = screen.getByRole("textbox", {
      name: "Workspace address",
    }) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Open Atlas" } });
    await waitFor(() => expect(slug.value).toBe("open-atlas"));
    fireEvent.change(slug, { target: { value: "atlas-team" } });
    fireEvent.change(name, { target: { value: "Open Atlas Team" } });
    expect(slug.value).toBe("atlas-team");
  });

  it("validates locally before requesting creation", async () => {
    render(<CreateWorkspaceForm />);
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("textbox", { name: "Workspace name" })
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps slug conflicts attached to the address field", async () => {
    mocks.create.mockRejectedValue({ data: { code: "CONFLICT" } });
    render(<CreateWorkspaceForm />);
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), {
      target: { value: "Open Atlas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    await waitFor(() =>
      expect(
        screen.getByText("This address is already in use. Choose another."),
      ).toBeTruthy(),
    );
    expect(
      screen
        .getByRole("textbox", { name: "Workspace address" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("focuses a safe server error and preserves the workspace draft", async () => {
    mocks.create.mockRejectedValue(new Error("internal database detail"));
    render(<CreateWorkspaceForm />);
    const name = screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Open Atlas" } });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Workspace could not be created. Please try again.");
    expect(document.activeElement).toBe(alert);
    expect(name.value).toBe("Open Atlas");
    expect(screen.queryByText("internal database detail")).toBeNull();
  });

  it("opens the newly created workspace once", async () => {
    mocks.create.mockResolvedValue({ id: "workspace-1" });
    render(<CreateWorkspaceForm />);
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), {
      target: { value: "Open Atlas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/workspace/workspace-1"),
    );
    expect(
      screen
        .getByRole("button", { name: "Opening workspace..." })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
