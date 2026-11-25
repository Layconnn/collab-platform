"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { allowedFileType, FILE_LIMITS } from "@repo/validators/files";
import { trpc } from "@/lib/trpc/api-client";

// File uploads PRD (FR-1, FR-2): the composer's attachments. Each file is
// checked here first, then uploaded straight to storage with a signed URL;
// the post is saved with the ids of the files that finished.

export type PublicAttachment = { id: string; fileName: string; contentType: string; size: number };

export type UploadItem = {
  localId: string;
  fileName: string;
  size: number;
  contentType: string;
  // A local preview for new images, or the stored file for existing ones.
  previewUrl: string | null;
  status: "uploading" | "ready" | "error";
  progress: number;
  attachmentId: string | null;
  error: string | null;
  file: File | null;
};

export function useAttachmentConfig() {
  return trpc.attachment.config.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_LIST = "images (PNG, JPEG, GIF, WebP), PDF, text, CSV, Markdown, JSON, ZIP and Office or OpenDocument files";

function putFile(url: string, headers: Record<string, string>, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status}).`)));
    request.onerror = () => reject(new Error("Upload failed."));
    request.send(file);
  });
}

const fromExisting = (attachment: PublicAttachment): UploadItem => ({
  localId: attachment.id, fileName: attachment.fileName, size: attachment.size, contentType: attachment.contentType,
  previewUrl: attachment.contentType.startsWith("image/") ? `/api/files/${attachment.id}` : null,
  status: "ready", progress: 1, attachmentId: attachment.id, error: null, file: null,
});

export function useUploader(workspaceId: string) {
  const createUpload = trpc.attachment.createUpload.useMutation();
  const [items, setItems] = useState<UploadItem[]>([]);
  // A short message for files that were not added (too big, wrong type).
  const [notice, setNotice] = useState<string | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const patch = useCallback((localId: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...change } : item)));
  }, []);

  const start = useCallback(async (item: UploadItem) => {
    if (!item.file) return;
    patch(item.localId, { status: "uploading", progress: 0, error: null });
    try {
      const upload = await createUpload.mutateAsync({ workspaceId, fileName: item.fileName, size: item.size });
      await putFile(upload.uploadUrl, upload.headers, item.file, (progress) => patch(item.localId, { progress }));
      patch(item.localId, { status: "ready", progress: 1, attachmentId: upload.attachmentId });
    } catch (error) {
      const message = error instanceof Error && /1 GB|cannot be attached|not switched on/.test(error.message) ? error.message : "Upload failed. Try again.";
      patch(item.localId, { status: "error", error: message });
    }
  }, [createUpload, patch, workspaceId]);

  const add = useCallback((files: File[]) => {
    const rejected: string[] = [];
    const room = FILE_LIMITS.maxFilesPerPost - itemsRef.current.length;
    const accepted: UploadItem[] = [];
    for (const file of files) {
      const type = allowedFileType(file.name || "pasted-image.png");
      if (!type) { rejected.push(`${file.name || "That file"}: this type of file cannot be attached. You can attach ${ALLOWED_LIST}.`); continue; }
      if (file.size > FILE_LIMITS.maxFileBytes) { rejected.push(`${file.name}: files can be up to 10 MB.`); continue; }
      if (file.size === 0) { rejected.push(`${file.name}: the file is empty.`); continue; }
      if (accepted.length >= room) { rejected.push(`A post can have up to ${FILE_LIMITS.maxFilesPerPost} files.`); break; }
      const fileName = file.name || `pasted-image-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      accepted.push({
        localId: crypto.randomUUID(), fileName, size: file.size, contentType: type.contentType,
        previewUrl: type.contentType.startsWith("image/") ? URL.createObjectURL(file) : null,
        status: "uploading", progress: 0, attachmentId: null, error: null, file,
      });
    }
    setNotice(rejected.length ? rejected.join(" ") : null);
    if (!accepted.length) return;
    setItems((current) => [...current, ...accepted]);
    for (const item of accepted) void start(item);
  }, [start]);

  const remove = useCallback((localId: string) => {
    setItems((current) => {
      const item = current.find((candidate) => candidate.localId === localId);
      if (item?.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((candidate) => candidate.localId !== localId);
    });
    setNotice(null);
  }, []);

  const retry = useCallback((localId: string) => {
    const item = itemsRef.current.find((candidate) => candidate.localId === localId);
    if (item) void start(item);
  }, [start]);

  // Starts over, empty or with a post's current files (when editing).
  const reset = useCallback((existing: PublicAttachment[] = []) => {
    for (const item of itemsRef.current) if (item.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setItems(existing.map(fromExisting));
    setNotice(null);
  }, []);

  useEffect(() => () => {
    for (const item of itemsRef.current) if (item.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }, []);

  return {
    items,
    notice,
    add,
    remove,
    retry,
    reset,
    attachmentIds: items.flatMap((item) => (item.status === "ready" && item.attachmentId ? [item.attachmentId] : [])),
    uploading: items.some((item) => item.status === "uploading"),
    failed: items.some((item) => item.status === "error"),
  };
}

export type Uploader = ReturnType<typeof useUploader>;

// Why a post cannot be saved yet because of its files, if it cannot.
export function uploadBlocker(uploader: Pick<Uploader, "uploading" | "failed">) {
  if (uploader.uploading) return "Wait for your files to finish uploading.";
  if (uploader.failed) return "Remove or retry the files that did not upload.";
  return null;
}
