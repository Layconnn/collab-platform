import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { Attachments } from "./Attachments";

const files = [
  { id: "a1", fileName: "logo-a.png", contentType: "image/png", size: 52_000 },
  { id: "a2", fileName: "pricing.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 48 * 1024 },
  { id: "a3", fileName: "logo-b.png", contentType: "image/png", size: 2_400_000 },
];

describe("Attachments", () => {
  afterEach(() => cleanup());

  it("shows images as previews and other files as download chips, all through /api/files", () => {
    render(<Attachments attachments={files} />);
    const images = within(screen.getByRole("list", { name: "Images" })).getAllByRole("img");
    expect(images.map((image) => [image.getAttribute("alt"), image.getAttribute("src")])).toEqual([["logo-a.png", "/api/files/a1"], ["logo-b.png", "/api/files/a3"]]);
    const chip = within(screen.getByRole("list", { name: "Files" })).getByRole("link");
    expect(chip.getAttribute("href")).toBe("/api/files/a2");
    expect(chip.textContent).toContain("pricing.xlsx");
    expect(chip.textContent).toContain("Spreadsheet · 48 KB");
  });

  it("renders nothing without files", () => {
    const { container } = render(<Attachments attachments={undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("opens a viewer that pages through the images and closes with Escape", () => {
    render(<Attachments attachments={files} />);
    const opener = screen.getByRole("button", { name: "Open logo-a.png" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "logo-a.png" });
    expect(within(dialog).getByText("Image 1 of 2")).toBeTruthy();
    const download = within(dialog).getByRole("link", { name: /Download/ });
    expect(download.getAttribute("href")).toBe("/api/files/a1?download=1");
    expect(document.activeElement).toBe(download);
    fireEvent.keyDown(download, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: "logo-b.png" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("dialog", { name: "logo-a.png" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
