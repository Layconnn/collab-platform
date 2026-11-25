// Where to go after signing in or registering. Only same-site paths are
// followed, so these pages cannot be used as an open redirect.
export function safeNextPath(search: string, fallback = "/workspace"): string {
  const next = new URLSearchParams(search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// A link to another auth page that keeps the same `next` (invite links PRD, FR-7).
export function withNext(path: string, search: string): string {
  const next = safeNextPath(search, "");
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
