import type { ReactNode } from "react";

export function MentionText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(/@[A-Za-z0-9_]{3,30}/g)) {
    const start = match.index;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<span key={start} className="font-semibold text-brand-link">{match[0]}</span>);
    cursor = start + match[0].length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
