"use client";

import { AlertCircle, FileText, Paperclip, RotateCw, X } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { ALLOWED_FILE_TYPES, allowedFileType } from "@repo/validators/files";
import { formatBytes, useAttachmentConfig, type Uploader } from "@/hooks/useAttachments";

const ACCEPT = Object.keys(ALLOWED_FILE_TYPES).map((extension) => `.${extension}`).join(",");

// File uploads PRD (FR-1, NFR-5): wraps a composer's text field so files can
// be dropped on it or pasted into it, adds an "Attach files" button, and lists
// the files with progress, errors and remove. Hidden when uploads are off.
export function AttachmentComposer({ uploader, disabled = false, children }: { uploader: Uploader; disabled?: boolean; children: ReactNode }) {
  const config = useAttachmentConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const statusId = useId();
  const enabled = config.data?.enabled === true;

  if (!enabled) return <>{children}</>;

  const filesFrom = (list: FileList | null | undefined) => Array.from(list ?? []);
  const uploadingCount = uploader.items.filter((item) => item.status === "uploading").length;

  return <div
    className={`min-w-0 rounded-sm ${dragging ? "outline-2 outline-dashed outline-brand-link outline-offset-4" : ""}`}
    onDragOver={(event) => { if (disabled || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); setDragging(true); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={(event) => {
      if (disabled || !event.dataTransfer.files.length) return;
      event.preventDefault();
      setDragging(false);
      uploader.add(filesFrom(event.dataTransfer.files));
    }}
    onPaste={(event) => {
      const files = filesFrom(event.clipboardData?.files);
      if (disabled || !files.length) return;
      event.preventDefault();
      uploader.add(files);
    }}
  >
    {children}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-sm px-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60">
        <Paperclip size={16} aria-hidden="true" /> Attach files
      </button>
      <span className="text-xs text-text-muted max-sm:hidden">or drop or paste them here · up to 10 MB each</span>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} hidden tabIndex={-1} aria-hidden="true" onChange={(event) => { uploader.add(filesFrom(event.target.files)); event.target.value = ""; }} />
    </div>
    <p id={statusId} role="status" className="sr-only">{uploadingCount ? `Uploading ${uploadingCount} ${uploadingCount === 1 ? "file" : "files"}` : ""}</p>
    {uploader.notice ? <p role="alert" className="mt-2 text-sm text-danger">{uploader.notice}</p> : null}
    {uploader.items.length ? <ul aria-label="Attached files" className="mt-2 grid gap-2 sm:grid-cols-2">
      {uploader.items.map((item) => {
        const isImage = item.contentType.startsWith("image/");
        return <li key={item.localId} className="flex min-w-0 items-center gap-3 rounded-sm border border-border-subtle bg-surface-subtle p-2">
          {isImage && item.previewUrl
            // eslint-disable-next-line @next/next/no-img-element -- local blob or signed redirect, not optimisable
            ? <img src={item.previewUrl} alt="" className="size-11 shrink-0 rounded-sm object-cover" />
            : <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-sm bg-surface-active text-text-secondary"><FileText size={18} /></span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-primary">{item.fileName}</span>
            {item.status === "error"
              ? <span className="flex items-center gap-1 text-xs text-danger"><AlertCircle size={12} aria-hidden="true" />{item.error}</span>
              : item.status === "uploading"
                ? <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-active" role="progressbar" aria-label={`Uploading ${item.fileName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
                  <span className="block h-full bg-brand-link transition-[width] motion-reduce:transition-none" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                </span>
                : <span className="text-xs text-text-muted">{allowedFileType(item.fileName)?.kind ?? "File"} · {formatBytes(item.size)}</span>}
          </span>
          {item.status === "error" && item.file ? <button type="button" onClick={() => uploader.retry(item.localId)} aria-label={`Retry ${item.fileName}`} className="grid size-9 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"><RotateCw size={15} aria-hidden="true" /></button> : null}
          <button type="button" disabled={disabled} onClick={() => uploader.remove(item.localId)} aria-label={`Remove ${item.fileName}`} className="grid size-9 shrink-0 place-items-center rounded-sm text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring disabled:opacity-60"><X size={16} aria-hidden="true" /></button>
        </li>;
      })}
    </ul> : null}
  </div>;
}
