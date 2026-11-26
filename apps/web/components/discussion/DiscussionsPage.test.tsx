import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  workspace: { data: { name: "Open Atlas" }, error: null as null | { data: { code: string } } },
  discussions: { data: { pages: [{ items: [] }] }, error: null as null | { data: { code: string } }, hasNextPage: false },
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ workspaceId: "c000000000000000000000001" }) }));
vi.mock("@/hooks/useWorkspace", () => ({ useWorkspaceDetail: () => mocks.workspace }));
vi.mock("@/hooks/useDiscussion", () => ({ useDiscussionList: () => mocks.discussions }));
vi.mock("@/components/discussion/DiscussionList", () => ({ DiscussionList: () => <div>Discussion feed</div> }));
vi.mock("@/components/discussion/CreateDiscussionForm", () => ({ CreateDiscussionForm: () => <label>Composer form <input /></label> }));

import Page from "@/app/(workspace)/workspace/[workspaceId]/discussions/page";
import { TopBarSlotProvider } from "@/components/shell/TopBarActions";

// The page puts "New discussion" in the shell's top bar; give it one.
function DiscussionListPage() {
  const slot = document.getElementById("top-bar") ?? Object.assign(document.body.appendChild(document.createElement("div")), { id: "top-bar" });
  return <TopBarSlotProvider slot={slot}><Page /></TopBarSlotProvider>;
}

describe("Discussions page", () => {
  beforeEach(() => {
    mocks.workspace.error = null;
    mocks.discussions.error = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    Element.prototype.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", "/workspace/c000000000000000000000001/discussions");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the composer for the existing workspace-home anchor", () => {
    window.history.replaceState(null, "", "#new-discussion");
    render(<DiscussionListPage />);

    expect(screen.getByRole("heading", { name: "Start a discussion" })).toBeTruthy();
    expect(screen.getByText("Composer form")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close composer" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("opens and closes from the primary action", () => {
    render(<DiscussionListPage />);
    fireEvent.click(screen.getByRole("button", { name: "New discussion" }));
    expect(window.location.hash).toBe("#new-discussion");
    expect(screen.getByText("Composer form")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Composer form"), { target: { value: "A draft" } });

    fireEvent.click(screen.getByRole("button", { name: "Close composer" }));
    expect(screen.getByLabelText("Composer form").closest("[hidden]")).toBeTruthy();
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "New discussion" }));
    expect(screen.getByLabelText("Composer form")).toHaveProperty("value", "A draft");
  });

  it("does not expose the composer or cached workspace name after access is denied", () => {
    mocks.workspace.error = { data: { code: "FORBIDDEN" } };
    render(<DiscussionListPage />);

    expect(screen.queryByRole("button", { name: "New discussion" })).toBeNull();
    expect(screen.queryByText("Open Atlas")).toBeNull();
  });

  it("sums up the list under the title", () => {
    const row = (id: string, status: string | null) => ({ id, decision: status ? { id: `d${id}`, status } : null });
    mocks.discussions.data = { pages: [{ items: [row("1", "DECIDED"), row("2", "PROPOSED"), row("3", null)] as never[] }] };
    mocks.discussions.hasNextPage = true;
    render(<DiscussionListPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Discussions" })).toBeTruthy();
    expect(screen.getByText("Open Atlas · Discussions")).toBeTruthy();
    expect(screen.getByText("3 discussions+")).toBeTruthy();
    expect(screen.getByText("1 open proposal")).toBeTruthy();
    expect(screen.getByText("1 decided")).toBeTruthy();
    mocks.discussions.data = { pages: [{ items: [] }] };
    mocks.discussions.hasNextPage = false;
  });
});
