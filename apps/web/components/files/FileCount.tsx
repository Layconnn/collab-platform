import { Paperclip } from "lucide-react";

// "2 files" on list rows, Home and search (file uploads PRD, FR-10): a count,
// never the files themselves.
export function FileCount({ count }: { count: number | undefined }) {
  if (!count) return null;
  return <span className="inline-flex items-center gap-1"><Paperclip size={12} aria-hidden="true" />{count} {count === 1 ? "file" : "files"}</span>;
}
