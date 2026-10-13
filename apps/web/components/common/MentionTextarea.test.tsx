import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";

import { activeMentionAt, insertMention } from "./mention-input";

const mocks = vi.hoisted(() => ({ refetch: vi.fn(), members: [
  { id: "a", name: "Maya Chen", username: "maya" },
  { id: "b", name: "Lina Rahman", username: "lina" },
] }));

vi.mock("@/hooks/useMentionMembers", () => ({
  useMentionMembers: (_workspaceId: string, query: string, enabled: boolean) => ({
    data: enabled ? mocks.members.filter((member) =>
      member.username.includes(query) || member.name.toLowerCase().includes(query)) : undefined,
    isFetching: false,
    isError: false,
    refetch: mocks.refetch,
  }),
}));

import { MentionTextarea } from "./MentionTextarea";

function Editor({ onSubmit = vi.fn(), as = "textarea" }: { onSubmit?: (value: string) => void; as?: "input" | "textarea" }) {
  const form = useForm<{ body: string }>({ defaultValues: { body: "" } });
  const body = useWatch({ control: form.control, name: "body" });
  return <form onSubmit={form.handleSubmit(({ body }) => onSubmit(body))}>
    <label htmlFor="body">Message</label>
    <MentionTextarea as={as} id="body" workspaceId="workspace" registration={form.register("body")} value={body} onInsert={(value) => form.setValue("body", value, { shouldDirty: true })} />
    <button type="submit">Send</button>
  </form>;
}

describe("mention cursor operations", () => {
  it("finds the token at the caret, not the last @ in the draft", () => {
    expect(activeMentionAt("Hi @ma and @li", 6, 6)).toEqual({ start: 3, end: 6, query: "ma" });
    expect(activeMentionAt("@ma", 3, 3)).toEqual({ start: 0, end: 3, query: "ma" });
    expect(activeMentionAt("Hi @ma!", 4, 5)).toBeNull();
    expect(activeMentionAt("Hi @ma!", 7, 7)).toBeNull();
  });

  it("replaces only the active mention and preserves punctuation and other mentions", () => {
    expect(insertMention("Hi @ma, ask @li", { start: 3, end: 6, query: "ma" }, "maya"))
      .toEqual({ value: "Hi @maya, ask @li", caret: 8 });
    expect(insertMention("Hi @ma now", { start: 3, end: 6, query: "ma" }, "maya"))
      .toEqual({ value: "Hi @maya now", caret: 8 });
    expect(insertMention("@ma", { start: 0, end: 3, query: "ma" }, "maya"))
      .toEqual({ value: "@maya", caret: 5 });
  });

  it("does not suggest a member inside an email address or URL", () => {
    expect(activeMentionAt("contact dev@maya", 16, 16)).toBeNull();
    expect(activeMentionAt("read /@maya", 11, 11)).toBeNull();
    expect(activeMentionAt("@maya@example", 5, 5)).toBeNull();
    expect(activeMentionAt("contact dev@maya then @li", 25, 25)).toEqual({ start: 22, end: 25, query: "li" });
  });
});

describe("MentionTextarea", () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.refetch.mockImplementation(async () => ({ data: mocks.members, isError: false }));
    const editorRect = () => ({ top: 120, bottom: 220, left: 16, right: 300, width: 284, height: 100, x: 16, y: 120, toJSON: () => ({}) });
    vi.spyOn(HTMLTextAreaElement.prototype, "getBoundingClientRect").mockImplementation(editorRect);
    vi.spyOn(HTMLInputElement.prototype, "getBoundingClientRect").mockImplementation(editorRect);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens at @, filters by display name, and inserts with keyboard without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Editor onSubmit={onSubmit} />);
    const editor = screen.getByRole("combobox", { name: "Message" }) as HTMLTextAreaElement;
    await user.type(editor, "Hello @");
    expect(await screen.findByRole("listbox", { name: "Workspace members" })).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.type(editor, "Chen");
    expect(await screen.findByRole("option", { name: /Maya Chen.*@maya/ })).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(editor.value).toBe("Hello @maya"));
    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe(11);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses the same picker in a single-line discussion title", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Editor as="input" onSubmit={onSubmit} />);
    const editor = screen.getByRole("combobox", { name: "Message" }) as HTMLInputElement;
    await user.type(editor, "Ask @li");
    await screen.findByRole("option", { name: /Lina Rahman.*@lina/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(editor.value).toBe("Ask @lina"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("selects by touch-style pointer input and restores the caret in a scrolled textarea", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const editor = screen.getByRole("combobox", { name: "Message" }) as HTMLTextAreaElement;
    await user.type(editor, "Earlier context\nAsk @ma");
    editor.scrollTop = 32;
    const option = await screen.findByRole("option", { name: /Maya Chen.*@maya/ });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);
    await waitFor(() => expect(editor.value).toBe("Earlier context\nAsk @maya"));
    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe(editor.value.length);
  });

  it("supports arrow navigation, Escape, and username filtering", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const editor = screen.getByRole("combobox", { name: "Message" });
    await user.type(editor, "@");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(editor, "lin");
    expect(await screen.findByRole("option", { name: /Lina Rahman.*@lina/ })).toBeTruthy();
  });

  it("shows no matches and refuses a removed member on selection", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const editor = screen.getByRole("combobox", { name: "Message" }) as HTMLTextAreaElement;
    await user.type(editor, "@zzz");
    expect(await screen.findByText("No matching members.")).toBeTruthy();
    await user.clear(editor);
    await user.type(editor, "@ma");
    await screen.findByRole("option", { name: /Maya Chen.*@maya/ });
    mocks.refetch.mockResolvedValueOnce({ data: [], isError: false });
    fireEvent.click(screen.getByRole("option", { name: /Maya Chen.*@maya/ }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Could not verify"));
    expect(editor.value).toBe("@ma");
  });

  it("keeps the draft when member lookup fails and lets Tab leave the editor", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const editor = screen.getByRole("combobox", { name: "Message" }) as HTMLTextAreaElement;
    await user.type(editor, "@ma");
    await screen.findByRole("option", { name: /Maya Chen.*@maya/ });
    mocks.refetch.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("option", { name: /Maya Chen.*@maya/ }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Could not verify"));
    expect(editor.value).toBe("@ma");
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Send" }));
  });

  it("keeps the suggestion panel within the mobile visual viewport", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const editor = screen.getByRole("combobox", { name: "Message" }) as HTMLTextAreaElement;
    editor.getBoundingClientRect = () => ({ top: 220, bottom: 360, left: 300, right: 590, width: 290, height: 140, x: 300, y: 220, toJSON: () => ({}) });
    const priorViewport = window.visualViewport;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { offsetTop: 20, offsetLeft: 0, height: 310, width: 390, addEventListener: vi.fn(), removeEventListener: vi.fn() } });
    try {
      await user.type(editor, "@ma");
      const panel = await screen.findByRole("listbox");
      await waitFor(() => expect(panel.style.width).toBe("290px"));
      expect(parseFloat(panel.style.left) + parseFloat(panel.style.width)).toBeLessThanOrEqual(382);
      expect(parseFloat(panel.style.top) + parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(330);
    } finally {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: priorViewport });
    }
  });

  it("hides suggestions when the editor scrolls outside the visible viewport", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const editor = screen.getByRole("combobox", { name: "Message" }) as HTMLTextAreaElement;
    let top = 120;
    editor.getBoundingClientRect = () => ({ top, bottom: top + 100, left: 16, right: 300, width: 284, height: 100, x: 16, y: top, toJSON: () => ({}) });
    await user.type(editor, "@ma");
    await screen.findByRole("listbox");

    top = window.innerHeight + 20;
    fireEvent.scroll(window);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(editor.getAttribute("aria-expanded")).toBe("false");
    expect(editor.hasAttribute("aria-controls")).toBe(false);
    expect(editor.hasAttribute("aria-activedescendant")).toBe(false);

    top = 120;
    fireEvent.scroll(window);
    expect(await screen.findByRole("listbox")).toBeTruthy();
  });
});
