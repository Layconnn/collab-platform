// Word-level differences between two versions of a message, for the edit
// history dialog (edit history PRD, FR-7). Words and the spaces between them
// are compared as tokens, so a changed word is shown removed and added while
// the text around it stays plain.

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

// Above this many token pairs the comparison is skipped and the whole text is
// shown as replaced, so a very long message cannot stall the page.
const MAX_CELLS = 400_000;

function tokens(text: string) {
  return text.split(/(\s+)/).filter(Boolean);
}

function push(parts: DiffPart[], kind: DiffPart["kind"], text: string) {
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

export function wordDiff(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  const a = tokens(before);
  const b = tokens(after);

  // Keep the shared start and end out of the table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const parts: DiffPart[] = [];
  if (start) push(parts, "same", a.slice(0, start).join(""));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  if (midA.length * midB.length > MAX_CELLS) {
    if (midA.length) push(parts, "removed", midA.join(""));
    if (midB.length) push(parts, "added", midB.join(""));
  } else {
    // Longest common subsequence, filled from the end so the walk runs forward.
    const width = midB.length + 1;
    const table = new Uint32Array((midA.length + 1) * width);
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        table[i * width + j] = midA[i] === midB[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) { push(parts, "same", midA[i]!); i++; j++; }
      else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) { push(parts, "removed", midA[i]!); i++; }
      else { push(parts, "added", midB[j]!); j++; }
    }
    while (i < midA.length) push(parts, "removed", midA[i++]!);
    while (j < midB.length) push(parts, "added", midB[j++]!);
  }

  if (endA < a.length) push(parts, "same", a.slice(endA).join(""));
  return readable(parts);
}

type Segment = { same: string } | { removed: string; added: string };

// A rewritten sentence shares small words with the old one ("if", "the",
// spaces), and marking each of them separately reads as fragments. A shared
// stretch no longer than the changes on both sides of it is folded into them,
// so each change reads as one removed passage followed by one added passage.
function readable(parts: DiffPart[]): DiffPart[] {
  const segments: Segment[] = [];
  for (const part of parts) {
    const last = segments[segments.length - 1];
    if (part.kind === "same") segments.push({ same: part.text });
    else if (last && !("same" in last)) last[part.kind] += part.text;
    else segments.push(part.kind === "removed" ? { removed: part.text, added: "" } : { removed: "", added: part.text });
  }
  const size = (change: { removed: string; added: string }) => Math.max(change.removed.length, change.added.length);
  for (let i = 1; i < segments.length - 1; i++) {
    const left = segments[i - 1]!;
    const middle = segments[i]!;
    const right = segments[i + 1]!;
    if (!("same" in middle) || "same" in left || "same" in right) continue;
    if (middle.same.length > size(left) || middle.same.length > size(right)) continue;
    segments.splice(i - 1, 3, {
      removed: left.removed + middle.same + right.removed,
      added: left.added + middle.same + right.added,
    });
    i = 0;
  }
  return segments.flatMap((segment): DiffPart[] => "same" in segment
    ? [{ kind: "same", text: segment.same }]
    : [
      ...(segment.removed ? [{ kind: "removed" as const, text: segment.removed }] : []),
      ...(segment.added ? [{ kind: "added" as const, text: segment.added }] : []),
    ]);
}

// Which file names an edit removed and added, keeping their order.
export function fileChanges(before: string[], after: string[]) {
  const remaining = [...after];
  const removed: string[] = [];
  for (const name of before) {
    const index = remaining.indexOf(name);
    if (index === -1) removed.push(name);
    else remaining.splice(index, 1);
  }
  return { removed, added: remaining };
}
