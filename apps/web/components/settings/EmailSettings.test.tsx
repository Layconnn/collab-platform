import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  data: undefined as unknown,
  enabled: [] as boolean[],
  refetch: vi.fn(),
  prefs: { enabled: true, workspaces: [{ id: "w1", name: "Platform", included: true }, { id: "w2", name: "Marketing", included: false }] },
  setEnabled: vi.fn(),
  setWorkspace: vi.fn(),
}));
vi.mock("@/hooks/useDigest", () => ({
  useDigestPreview: (enabled: boolean) => { mocks.enabled.push(enabled); return { data: enabled ? mocks.data : undefined, isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }; },
  useDigestPreferences: () => ({ data: mocks.prefs, error: null, isFetching: false, refetch: vi.fn() }),
  useDigestPreferenceActions: () => ({ setEnabled: { mutate: mocks.setEnabled, isPending: false, error: null }, setWorkspace: { mutate: mocks.setWorkspace, isPending: false, error: null } }),
}));

import { EmailSettings } from "./EmailSettings";

describe("EmailSettings", () => {
  beforeEach(() => {
    mocks.data = undefined; mocks.enabled = []; mocks.refetch.mockReset(); mocks.setEnabled.mockReset(); mocks.setWorkspace.mockReset();
    mocks.prefs = { enabled: true, workspaces: [{ id: "w1", name: "Platform", included: true }, { id: "w2", name: "Marketing", included: false }] };
  });
  afterEach(() => cleanup());

  it("turns the digest off and changes which workspaces it covers", () => {
    render(<EmailSettings />);
    const toggle = screen.getByRole("switch", { name: "Send me the daily digest" }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    const group = screen.getByRole("group", { name: "Include these workspaces" });
    const boxes = within(group).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([true, false]);
    fireEvent.click(within(group).getByRole("checkbox", { name: "Marketing" }));
    expect(mocks.setWorkspace).toHaveBeenCalledWith({ workspaceId: "w2", included: true }, expect.anything());
    expect((within(group).getByRole("checkbox", { name: "Marketing" }) as HTMLInputElement).checked).toBe(true); // the click shows at once
    fireEvent.click(toggle);
    expect(mocks.setEnabled).toHaveBeenCalledWith({ enabled: false }, expect.anything());
    expect(toggle.checked).toBe(false);
    expect((group as HTMLFieldSetElement).disabled).toBe(true); // workspace choices wait while the digest is off
  });

  it("disables the workspace choices while the digest is off", () => {
    mocks.prefs = { ...mocks.prefs, enabled: false };
    render(<EmailSettings />);
    expect((screen.getByRole("group", { name: "Include these workspaces" }) as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("builds the preview only when asked, and shows the email isolated in a frame", () => {
    mocks.data = { empty: false, enabled: true, subject: "Commons: 1 thing needs you", html: "<p>Hello</p>", text: "Hello" };
    render(<EmailSettings />);
    expect(mocks.enabled.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Preview today's digest" }));
    expect(mocks.enabled.at(-1)).toBe(true);
    expect(screen.getByText("Commons: 1 thing needs you")).toBeTruthy();
    const frame = screen.getByTitle("Preview of today's digest email") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toBe("<p>Hello</p>");
    fireEvent.click(screen.getByRole("button", { name: "Refresh preview" }));
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("says when nothing would be sent, and when the digest is off", () => {
    mocks.data = { empty: true, enabled: true, subject: "", html: "", text: "" };
    const view = render(<EmailSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Preview today's digest" }));
    expect(screen.getByRole("status").textContent).toMatch(/Nothing would be sent today/);
    view.unmount();
    mocks.data = { empty: false, enabled: false, subject: "S", html: "<p>x</p>", text: "x" };
    render(<EmailSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Preview today's digest" }));
    expect(screen.getByRole("status").textContent).toMatch(/digest is off/);
    expect(screen.getByTitle("Preview of today's digest email")).toBeTruthy();
  });
});
