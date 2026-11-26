import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Modal } from "@/components/common/Modal";

describe("Modal", () => {
  afterEach(cleanup);

  it("names the dialog by its title and focuses the first field", () => {
    render(<Modal title="Invite people" onClose={() => {}}><input aria-label="Username" /><button>Send</button></Modal>);

    const dialog = screen.getByRole("dialog", { name: "Invite people" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("canopy-panel");
    expect(document.activeElement).toBe(screen.getByLabelText("Username"));
  });

  it("closes on Escape and on the scrim, but not while busy", async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<Modal title="Delete" onClose={onClose}><button>Delete</button></Modal>);

    await userEvent.setup().keyboard("{Escape}");
    fireEvent.mouseDown(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<Modal title="Delete" onClose={onClose} busy><button>Delete</button></Modal>);
    await userEvent.setup().keyboard("{Escape}");
    fireEvent.mouseDown(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps Tab inside the dialog", async () => {
    render(<Modal title="Rename" onClose={() => {}}><input aria-label="Name" /><button>Save</button></Modal>);
    const user = userEvent.setup();

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("returns focus to whatever opened it", () => {
    render(<button>Open</button>);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    const { unmount } = render(<Modal title="Details" onClose={() => {}}><input aria-label="Note" /></Modal>);
    unmount();
    expect(document.activeElement).toBe(opener);
  });
});
