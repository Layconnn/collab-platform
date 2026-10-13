export type ActiveMention = { start: number; end: number; query: string };

export function activeMentionAt(value: string, selectionStart: number, selectionEnd: number): ActiveMention | null {
  if (selectionStart !== selectionEnd) return null;
  const before = value.slice(0, selectionStart);
  const match = /(?:^|[\s([{,;:!?])@([A-Za-z0-9_]{0,30})$/.exec(before);
  if (!match) return null;
  const start = selectionStart - (match[0].length - match[0].lastIndexOf("@"));
  let end = selectionStart;
  while (end < value.length && /[A-Za-z0-9_]/.test(value[end]) && end - start <= 30) end += 1;
  if (end - start > 31) return null;
  if (value[end] === "@") return null;
  return { start, end, query: match[1] };
}

export function insertMention(value: string, mention: ActiveMention, username: string) {
  const before = value.slice(0, mention.start);
  const after = value.slice(mention.end);
  const mentionText = `@${username}`;
  const separator = after && !/^\s|^[.,!?;:)}\]]/.test(after) ? " " : "";
  return { value: `${before}${mentionText}${separator}${after}`, caret: before.length + mentionText.length + separator.length };
}
