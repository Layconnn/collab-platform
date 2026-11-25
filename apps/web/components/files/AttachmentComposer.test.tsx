import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/hooks/useAttachments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useAttachments")>()),
  useAttachmentConfig: () => ({ data: { enabled: mocks.enabled } }),
}));

import type { Uploader, UploadItem } from "@/hooks/useAttachments";
import { AttachmentComposer } from "./AttachmentComposer";

const item = (change: Partial<UploadItem>): UploadItem => ({
  localId: "l1", fileName: "shot.png", size: 1200, contentType: "image/png", previewUrl: "blob:x",
  status: "ready", progress: 1, attachmentId: "a1", error: null, file: null, ...change,
});
const uploader = (change: Partial<Uploader> = {}): Uploader => ({
  items: [], notice: null, add: vi.fn(), remove: vi.fn(), retry: vi.fn(), reset: vi.fn(),
  attachmentIds: [], uploading: false, failed: false, ...change,
});
const png = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });

describe("AttachmentComposer", () => {
  beforeEach(() => { mocks.enabled = true; });
  afterEach(() => cleanup());

  it("is invisible when uploads are switched off", () => {
    mocks.enabled = false;
    render(<AttachmentComposer uploader={uploader()}><textarea aria-label="Body" /></AttachmentComposer>);
    expect(screen.getByRole("textbox", { name: "Body" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull();
  });

  it("takes files from a drop and from a paste", () => {
    const up = uploader();
    render(<AttachmentComposer uploader={up}><textarea aria-label="Body" /></AttachmentComposer>);
    fireEvent.drop(screen.getByRole("textbox", { name: "Body" }), { dataTransfer: { files: [png], types: ["Files"] } });
    expect(up.add).toHaveBeenCalledWith([png]);
    fireEvent.paste(screen.getByRole("textbox", { name: "Body" }), { clipboardData: { files: [png] } });
    expect(up.add).toHaveBeenCalledTimes(2);
    fireEvent.paste(screen.getByRole("textbox", { name: "Body" }), { clipboardData: { files: [] } });
    expect(up.add).toHaveBeenCalledTimes(2);
  });

  it("lists files with progress, errors, retry and remove, and announces problems", () => {
    const up = uploader({
      notice: "setup.exe: this type of file cannot be attached.",
      items: [
        item({ localId: "l1", status: "uploading", progress: 0.4, attachmentId: null }),
        item({ localId: "l2", fileName: "spec.pdf", contentType: "application/pdf", previewUrl: null, status: "error", error: "Upload failed. Try again.", file: png }),
        item({ localId: "l3", fileName: "notes.csv", contentType: "text/csv", previewUrl: null, size: 4096 }),
      ],
    });
    render(<AttachmentComposer uploader={up}><textarea aria-label="Body" /></AttachmentComposer>);
    expect(screen.getByRole("alert").textContent).toContain("cannot be attached");
    expect(screen.getByRole("progressbar", { name: "Uploading shot.png" }).getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("Upload failed. Try again.")).toBeTruthy();
    expect(screen.getByText("Spreadsheet · 4 KB")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Uploading 1 file");
    fireEvent.click(screen.getByRole("button", { name: "Retry spec.pdf" }));
    expect(up.retry).toHaveBeenCalledWith("l2");
    fireEvent.click(screen.getByRole("button", { name: "Remove notes.csv" }));
    expect(up.remove).toHaveBeenCalledWith("l3");
  });
});
