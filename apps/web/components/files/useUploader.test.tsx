import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), puts: [] as Array<{ url: string; headers: Record<string, string>; fail: boolean }>, failNext: false }));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: { attachment: { createUpload: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) }, config: { useQuery: () => ({ data: { enabled: true } }) } } },
}));

// A stand-in for the browser's upload: reports progress, then succeeds or fails.
class FakeXhr {
  url = ""; headers: Record<string, string> = {};
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; status = 0;
  open(_method: string, url: string) { this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send() {
    const fail = mocks.failNext; mocks.failNext = false;
    mocks.puts.push({ url: this.url, headers: this.headers, fail });
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      if (fail) this.onerror?.(); else { this.status = 200; this.onload?.(); }
    });
  }
}

import { uploadBlocker, useUploader } from "@/hooks/useAttachments";

const file = (name: string, size = 10) => new File([new Uint8Array(size)], name);

describe("useUploader", () => {
  beforeEach(() => {
    mocks.puts = []; mocks.failNext = false; mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockImplementation(async (input: { fileName: string }) => ({ attachmentId: `id-${input.fileName}`, uploadUrl: `https://r2/${input.fileName}`, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("checks files first, uploads the rest straight to storage, and collects their ids", async () => {
    const { result } = renderHook(() => useUploader("w1"));
    act(() => result.current.add([file("shot.png"), file("setup.exe"), file("huge.pdf", 10 * 1024 * 1024 + 1)]));
    expect(result.current.notice).toMatch(/setup\.exe: this type of file cannot be attached/);
    expect(result.current.notice).toMatch(/huge\.pdf: files can be up to 10 MB/);
    expect(result.current.items.map((item) => item.fileName)).toEqual(["shot.png"]);
    expect(uploadBlocker(result.current)).toBe("Wait for your files to finish uploading.");
    await waitFor(() => expect(result.current.attachmentIds).toEqual(["id-shot.png"]));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ workspaceId: "w1", fileName: "shot.png", size: 10 });
    expect(mocks.puts[0]).toMatchObject({ url: "https://r2/shot.png", headers: { "content-type": "image/png" } });
    expect(result.current.items[0]).toMatchObject({ status: "ready", previewUrl: "blob:preview" });
    expect(uploadBlocker(result.current)).toBeNull();
  });

  it("marks a failed upload, retries it, and removes files", async () => {
    mocks.failNext = true;
    const { result } = renderHook(() => useUploader("w1"));
    act(() => result.current.add([file("spec.pdf")]));
    await waitFor(() => expect(result.current.items[0]?.status).toBe("error"));
    expect(uploadBlocker(result.current)).toBe("Remove or retry the files that did not upload.");
    act(() => result.current.retry(result.current.items[0]!.localId));
    await waitFor(() => expect(result.current.items[0]?.status).toBe("ready"));
    act(() => result.current.remove(result.current.items[0]!.localId));
    expect(result.current.items).toEqual([]);
  });

  it("starts from a post's current files when editing, and stops at 10 files", () => {
    const { result } = renderHook(() => useUploader("w1"));
    act(() => result.current.reset([{ id: "a1", fileName: "logo.png", contentType: "image/png", size: 5 }]));
    expect(result.current.attachmentIds).toEqual(["a1"]);
    expect(result.current.items[0]?.previewUrl).toBe("/api/files/a1");
    act(() => result.current.add(Array.from({ length: 10 }, (_, i) => file(`f${i}.txt`))));
    expect(result.current.items).toHaveLength(10);
    expect(result.current.notice).toMatch(/up to 10 files/);
  });
});
