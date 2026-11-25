"use client";

import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { useState } from "react";

import { allowedFileType } from "@repo/validators/files";
import { Modal } from "@/components/common/Modal";
import { formatBytes, type PublicAttachment } from "@/hooks/useAttachments";

const fileUrl = (id: string) => `/api/files/${id}`;

// File uploads PRD (FR-7, FR-9): a post's files below its text. Images as
// previews (one image larger) that open a viewer; other files as chips that
// download. Every link goes through /api/files, which checks access.
export function Attachments({ attachments }: { attachments: PublicAttachment[] | undefined }) {
  const [open, setOpen] = useState<number | null>(null);
  const files = attachments ?? [];
  if (!files.length) return null;
  const images = files.filter((file) => file.contentType.startsWith("image/"));
  const others = files.filter((file) => !file.contentType.startsWith("image/"));

  return <div className="mt-3 min-w-0 space-y-2">
    {images.length ? <ul aria-label="Images" className={images.length === 1 ? "max-w-md" : "grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3"}>
      {images.map((image, index) => <li key={image.id} className="min-w-0">
        <button type="button" onClick={() => setOpen(index)} aria-label={`Open ${image.fileName}`} className="block w-full overflow-hidden rounded-sm border border-border-subtle bg-surface-subtle focus-visible:outline-2 focus-visible:outline-focus-ring">
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived redirect; not optimisable */}
          <img src={fileUrl(image.id)} alt={image.fileName} loading="lazy" className={images.length === 1 ? "max-h-80 w-auto max-w-full object-contain" : "aspect-[4/3] w-full object-cover"} />
        </button>
      </li>)}
    </ul> : null}
    {others.length ? <ul aria-label="Files" className="flex flex-wrap gap-2">
      {others.map((file) => <li key={file.id} className="min-w-0 max-w-full">
        <a href={fileUrl(file.id)} className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-sm border border-border-subtle bg-surface px-3 py-1.5 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">
          <FileText size={18} aria-hidden="true" className="shrink-0 text-text-secondary" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-text-primary">{file.fileName}</span>
            <span className="block text-xs text-text-muted">{allowedFileType(file.fileName)?.kind ?? "File"} · {formatBytes(file.size)}</span>
          </span>
          <Download size={15} aria-hidden="true" className="ml-1 shrink-0 text-text-muted" />
        </a>
      </li>)}
    </ul> : null}
    {open !== null && images[open] ? <ImageViewer images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
  </div>;
}

function ImageViewer({ images, index, onIndex, onClose }: { images: PublicAttachment[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const image = images[index]!;
  const many = images.length > 1;
  const go = (step: number) => onIndex((index + step + images.length) % images.length);
  return <Modal title={image.fileName} description={many ? `Image ${index + 1} of ${images.length}` : undefined} onClose={onClose} size="wide" initialFocus="[data-viewer-download]">
    <div onKeyDown={(event) => {
      if (!many) return;
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived redirect; not optimisable */}
      <img src={fileUrl(image.id)} alt={image.fileName} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-sm object-contain" />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {many ? <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="grid size-10 place-items-center rounded-sm border border-border hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => go(1)} aria-label="Next image" className="grid size-10 place-items-center rounded-sm border border-border hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring"><ChevronRight size={18} aria-hidden="true" /></button>
        </> : null}
        <a data-viewer-download href={`${fileUrl(image.id)}?download=1`} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus-ring">
          <Download size={15} aria-hidden="true" /> Download · {formatBytes(image.size)}
        </a>
      </div>
    </div>
  </Modal>;
}
