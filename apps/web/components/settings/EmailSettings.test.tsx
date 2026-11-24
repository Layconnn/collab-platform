import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ data: undefined as unknown, enabled: [] as boolean[], refetch: vi.fn() }));
vi.mock("@/hooks/useDigest", () => ({
  useDigestPreview: (enabled: boolean) => { mocks.enabled.push(enabled); return { data: enabled ? mocks.data : undefined, isLoading: false, isFetching: false, error: null, refetch: mocks.refetch }; },
}));

import { EmailSettings } from "./EmailSettings";

describe("EmailSettings", () => {
  beforeEach(() => { mocks.data = undefined; mocks.enabled = []; mocks.refetch.mockReset(); });
  afterEach(() => cleanup());

  it("builds the preview only when asked, and shows the email isolated in a frame", () => {
    mocks.data = { empty: false, subject: "Commons: 1 thing needs you", html: "<p>Hello</p>", text: "Hello" };
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

  it("says when nothing would be sent", () => {
    mocks.data = { empty: true, subject: "", html: "", text: "" };
    render(<EmailSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Preview today's digest" }));
    expect(screen.getByRole("status").textContent).toMatch(/Nothing would be sent today/);
  });
});
