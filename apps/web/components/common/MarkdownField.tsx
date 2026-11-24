"use client";

import { useRef, useState, type ReactNode } from "react";

import { Markdown } from "@/components/common/Markdown";

const tab = "min-h-8 rounded-sm px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring";

// Write and Preview around any composer textarea (Markdown PRD, FR-4). The
// textarea stays mounted while previewing, so form registration and drafts are
// untouched; the preview reads its current text when opened.
export function MarkdownField({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const showPreview = () => setPreview(wrapper.current?.querySelector("textarea")?.value ?? "");
  const showWrite = () => {
    setPreview(null);
    requestAnimationFrame(() => wrapper.current?.querySelector("textarea")?.focus());
  };

  return <div ref={wrapper} className="min-w-0">
    <div role="group" aria-label="Editor mode" className="mb-1.5 flex flex-wrap items-center gap-1">
      <button type="button" aria-pressed={preview === null} onClick={showWrite} className={`${tab} ${preview === null ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover"}`}>Write</button>
      <button type="button" aria-pressed={preview !== null} onClick={showPreview} className={`${tab} ${preview !== null ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover"}`}>Preview</button>
      <details className="ml-auto text-xs text-text-muted">
        <summary className="cursor-pointer rounded-sm px-1.5 py-1 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">Markdown supported</summary>
        <ul className="mt-1 space-y-0.5 rounded-sm border border-border-subtle bg-surface p-2 font-mono text-[11px] leading-5 text-text-secondary">
          <li>**bold** · *italic* · ~~struck~~</li>
          <li>- list item · 1. numbered · - [ ] task</li>
          <li>[link](https://…) · `code` · &gt; quote</li>
          <li>```js on its own line for a code block</li>
          <li>| a | b | for a table</li>
        </ul>
      </details>
    </div>
    <div hidden={preview !== null}>{children}</div>
    {preview !== null ? <div aria-label="Markdown preview" role="region" className="min-h-28 rounded-sm border border-border-subtle bg-surface-subtle px-3.5 py-3 text-sm leading-6 text-text-primary">
      {preview.trim() ? <Markdown text={preview} /> : <p className="text-text-muted">Nothing to preview yet.</p>}
    </div> : null}
  </div>;
}
