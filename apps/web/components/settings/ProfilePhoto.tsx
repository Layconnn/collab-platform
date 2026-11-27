"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Modal } from "@/components/common/Modal";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Button } from "@/components/ui/Button";
import { trpc } from "@/lib/trpc/api-client";

// The profile photo (settings PRD, FR-3). The picked image is cropped to a
// square in the browser and saved as a 256×256 WebP (JPEG where the browser
// can't encode WebP), so only a small file is uploaded.

const SOURCE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_BYTES = 200_000;
const OUTPUT = 256;
const VIEW = 240;

type Crop = { x: number; y: number; zoom: number };

// The image's size in the crop window at a zoom, and the crop kept inside it.
export function cropBounds(image: { width: number; height: number }, zoom: number) {
  const scale = (VIEW / Math.min(image.width, image.height)) * zoom;
  return { scale, width: image.width * scale, height: image.height * scale };
}

export function clampCrop(image: { width: number; height: number }, crop: Crop): Crop {
  const { width, height } = cropBounds(image, crop.zoom);
  return { zoom: crop.zoom, x: Math.min(0, Math.max(VIEW - width, crop.x)), y: Math.min(0, Math.max(VIEW - height, crop.y)) };
}

function centered(image: { width: number; height: number }, zoom = 1): Crop {
  const { width, height } = cropBounds(image, zoom);
  return { zoom, x: (VIEW - width) / 2, y: (VIEW - height) / 2 };
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function renderPhoto(image: HTMLImageElement, crop: Crop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  const { scale } = cropBounds(image, crop.zoom);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, -crop.x / scale, -crop.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUTPUT, OUTPUT);
  for (const quality of [0.9, 0.75, 0.6]) {
    let blob = await encode(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality);
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
  }
  throw new Error("too large");
}

export function ProfilePhoto({ name, photo }: { name: string; photo: string | null }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const remove = trpc.profile.removePhoto.useMutation({ onSuccess: () => utils.auth.me.invalidate() });

  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url); }, [picked]);

  const choose = (file: File | undefined) => {
    setProblem(null); setDone(null);
    if (!file) return;
    if (!SOURCE_TYPES.includes(file.type)) return setProblem("Choose a PNG, JPEG or WebP image.");
    if (file.size > MAX_SOURCE_BYTES) return setProblem("Choose an image of 5 MB or less.");
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setPicked({ url, image });
    image.onerror = () => { URL.revokeObjectURL(url); setProblem("That image couldn't be opened. Try another one."); };
    image.src = url;
  };

  const removeError = remove.error ? "Could not remove your photo. Try again." : null;
  const shown = problem ?? removeError;

  return <section aria-labelledby={`${inputId}-title`} className="mt-7 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6">
    <div className="flex flex-wrap items-center gap-5">
      <UserAvatar name={name} photo={photo} className="size-20 text-xl" />
      <div className="min-w-0 flex-1">
        <h2 id={`${inputId}-title`} className="m-0 text-base font-semibold text-text-primary">Photo</h2>
        <p className="mt-1 text-xs leading-5 text-text-muted">Shown beside your name to people in your workspaces. PNG, JPEG or WebP, up to 5 MB.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={inputRef} id={inputId} type="file" accept={SOURCE_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label="Choose a photo" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
          <Button type="button" variant="secondary" size="sm" icon={<ImagePlus size={15} aria-hidden="true" />} onClick={() => inputRef.current?.click()}>{photo ? "Change photo" : "Upload photo"}</Button>
          {photo ? <Button type="button" variant="ghost" size="sm" icon={<Trash2 size={15} aria-hidden="true" />} disabled={remove.isPending}
            onClick={() => { setDone(null); remove.mutate(undefined, { onSuccess: () => setDone("Photo removed. Teammates see your initials.") }); }}>{remove.isPending ? "Removing..." : "Remove photo"}</Button> : null}
        </div>
      </div>
    </div>
    {shown ? <p role="alert" className="mt-4 rounded-[10px] border-l-2 border-danger bg-surface-subtle px-3 py-2 text-sm text-danger">{shown}</p> : null}
    {done && !shown ? <p role="status" className="mt-4 rounded-[10px] border-l-2 border-success bg-callout px-3 py-2 text-sm text-text-primary">{done}</p> : null}
    {picked ? <CropDialog image={picked.image} src={picked.url} onClose={() => setPicked(null)} onSaved={() => { setPicked(null); setDone("Photo saved."); }} /> : null}
  </section>;
}

function CropDialog({ image, src, onClose, onSaved }: { image: HTMLImageElement; src: string; onClose: () => void; onSaved: () => void }) {
  const zoomId = useId();
  const [crop, setCrop] = useState<Crop>(() => centered(image));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const utils = trpc.useUtils();
  const upload = trpc.profile.photoUpload.useMutation();
  const setPhoto = trpc.profile.setPhoto.useMutation();
  const { width, height } = cropBounds(image, crop.zoom);

  const zoomTo = (zoom: number) => setCrop((current) => {
    // Keep the middle of the window where it is.
    const before = cropBounds(image, current.zoom).scale;
    const after = cropBounds(image, zoom).scale;
    const middle = VIEW / 2;
    return clampCrop(image, { zoom, x: middle - ((middle - current.x) / before) * after, y: middle - ((middle - current.y) / before) * after });
  });
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, crop };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const start = drag.current;
    setCrop(clampCrop(image, { zoom: start.crop.zoom, x: start.crop.x + event.clientX - start.x, y: start.crop.y + event.clientY - start.y }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setCrop((current) => clampCrop(image, { zoom: current.zoom, x: current.x + move[0], y: current.y + move[1] }));
  };

  const save = async () => {
    setSaving(true); setProblem(null);
    try {
      const blob = await renderPhoto(image, crop);
      const contentType = blob.type === "image/webp" ? "image/webp" as const : "image/jpeg" as const;
      const target = await upload.mutateAsync({ contentType, size: blob.size });
      const response = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: blob });
      if (!response.ok) throw new Error("upload");
      await setPhoto.mutateAsync({ key: target.key });
      await utils.auth.me.invalidate();
      onSaved();
    } catch (error) {
      const code = typeof error === "object" && error && "data" in error ? (error as { data?: { code?: string } }).data?.code : undefined;
      setProblem(code === "TOO_MANY_REQUESTS" ? "Too many changes. Wait a minute and try again."
        : code === "BAD_REQUEST" && error instanceof Error ? error.message
          : "Could not save your photo. Try again.");
      setSaving(false);
    }
  };

  return <Modal title="Crop your photo" description="Drag the image or use the arrow keys to position it, and zoom to fit." onClose={onClose} busy={saving} initialFocus="[data-crop-window]">
    <div className="mt-5 grid justify-items-center gap-5">
      <div
        data-crop-window
        tabIndex={0}
        role="img"
        aria-label="Photo crop. Use the arrow keys to move the image."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={onKeyDown}
        className="relative cursor-grab touch-none overflow-hidden rounded-xl bg-surface-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:cursor-grabbing"
        style={{ width: VIEW, height: VIEW }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file */}
        <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{ left: crop.x, top: crop.y, width, height }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.45)]" />
      </div>
      <div className="w-full max-w-[17rem]">
        <label htmlFor={zoomId} className="text-sm font-medium text-text-primary">Zoom</label>
        <input id={zoomId} type="range" min={1} max={3} step={0.01} value={crop.zoom} onChange={(event) => zoomTo(Number(event.target.value))} className="mt-2 w-full accent-[var(--color-brand-action)]" />
      </div>
      {problem ? <p role="alert" className="w-full rounded-[10px] border-l-2 border-danger bg-surface-subtle px-3 py-2 text-sm text-danger">{problem}</p> : null}
      <div className="flex w-full justify-end gap-2 border-t border-border-subtle pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="button" variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save photo"}</Button>
      </div>
    </div>
  </Modal>;
}
