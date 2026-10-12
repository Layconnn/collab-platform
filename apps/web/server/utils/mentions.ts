const MENTION_REGEX = /(?:^|[\s([{,;:!?])@([a-zA-Z0-9_]{3,30})(?![a-zA-Z0-9_@])/g;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function extractMentions(text: string): string[] {
  if (!text) {
    return [];
  }

  const matches = [...text.matchAll(MENTION_REGEX)].map((match) =>
    normalizeUsername(match[1] ?? ""),
  );
  const unique = new Set(matches.filter(Boolean));
  return Array.from(unique);
}
