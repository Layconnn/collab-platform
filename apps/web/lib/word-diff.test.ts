import { describe, expect, it } from "vitest";

import { fileChanges, wordDiff } from "./word-diff";

describe("wordDiff", () => {
  it("marks a removed clause and keeps the rest plain", () => {
    expect(wordDiff("B is fine, but only if we drop the favicon", "B is fine")).toEqual([
      { kind: "same", text: "B is " },
      { kind: "removed", text: "fine, but only if we drop the favicon" },
      { kind: "added", text: "fine" },
    ]);
  });

  it("shows a changed word in the middle as removed then added", () => {
    expect(wordDiff("Use Postgres for storage", "Use SQLite for storage")).toEqual([
      { kind: "same", text: "Use " },
      { kind: "removed", text: "Postgres" },
      { kind: "added", text: "SQLite" },
      { kind: "same", text: " for storage" },
    ]);
  });

  it("handles added lines, identical text and empty text", () => {
    expect(wordDiff("One", "One\nTwo")).toEqual([
      { kind: "same", text: "One" },
      { kind: "added", text: "\nTwo" },
    ]);
    expect(wordDiff("Same", "Same")).toEqual([{ kind: "same", text: "Same" }]);
    expect(wordDiff("", "")).toEqual([]);
    expect(wordDiff("", "New")).toEqual([{ kind: "added", text: "New" }]);
  });

  it("reads a rewritten passage as one removal and one addition", () => {
    expect(wordDiff(
      "Vercel Queues is fine, but only if we drop the Railway worker this week.",
      "Vercel Queues is fine for now. We can revisit if retries get expensive.",
    )).toEqual([
      { kind: "same", text: "Vercel Queues is " },
      { kind: "removed", text: "fine, but only if we drop the Railway worker this week." },
      { kind: "added", text: "fine for now. We can revisit if retries get expensive." },
    ]);
    expect(wordDiff("Options: BullMQ, or a Railway worker.", "Options: BullMQ, or Vercel Queues. Decide by Friday.")).toEqual([
      { kind: "same", text: "Options: BullMQ, or " },
      { kind: "removed", text: "a Railway worker." },
      { kind: "added", text: "Vercel Queues. Decide by Friday." },
    ]);
  });

  it("keeps a long shared passage between two separate changes", () => {
    expect(wordDiff("Ship on Friday after the security review with Maya", "Ship on Monday after the security review with Lee")).toEqual([
      { kind: "same", text: "Ship on " },
      { kind: "removed", text: "Friday" },
      { kind: "added", text: "Monday" },
      { kind: "same", text: " after the security review with " },
      { kind: "removed", text: "Maya" },
      { kind: "added", text: "Lee" },
    ]);
  });

  it("rebuilds both versions from its parts", () => {
    const before = "We agreed to ship on Friday after the review with Maya";
    const after = "We agreed to ship on Monday after a second review with Maya and Lee";
    const parts = wordDiff(before, after);
    expect(parts.filter((p) => p.kind !== "added").map((p) => p.text).join("")).toBe(before);
    expect(parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("")).toBe(after);
  });

  it("falls back to a whole replacement for very long changes", () => {
    const before = Array.from({ length: 800 }, (_, i) => `a${i}`).join(" ");
    const after = Array.from({ length: 800 }, (_, i) => `b${i}`).join(" ");
    expect(wordDiff(before, after)).toEqual([{ kind: "removed", text: before }, { kind: "added", text: after }]);
  });
});

describe("fileChanges", () => {
  it("lists removed and added file names", () => {
    expect(fileChanges(["plan.pdf", "logo.png"], ["logo.png", "plan-v2.pdf"])).toEqual({ removed: ["plan.pdf"], added: ["plan-v2.pdf"] });
    expect(fileChanges([], [])).toEqual({ removed: [], added: [] });
  });
});
