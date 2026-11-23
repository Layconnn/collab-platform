import assert from "node:assert/strict";
import test from "node:test";

import createJiti from "jiti";

// The module imports the database client, which reads these at import time.
// No test here touches the database.
process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret-123456789";

const jiti = createJiti(import.meta.url, { nativeModules: ["@prisma/client"] });
const { buildTsQuery, trimSnippet, HIGHLIGHT_START: S, HIGHLIGHT_END: E } = jiti("./search.service.ts");

test("plain words must all match; the last one matches as a prefix", () => {
  assert.equal(buildTsQuery("worker queue"), "worker & queue:*");
  assert.equal(buildTsQuery("Work"), "work:*");
});

test("quoted phrases match in order and are never prefixes", () => {
  assert.equal(buildTsQuery('"vercel queues" cost'), "(vercel <-> queues) & cost:*");
  assert.equal(buildTsQuery('cost "vercel queues"'), "cost & (vercel <-> queues)");
});

test("-word excludes, and exclusions alone search for nothing", () => {
  assert.equal(buildTsQuery("queue -redis"), "queue:* & !redis");
  assert.equal(buildTsQuery("-redis -bullmq"), null);
});

test("punctuated words become phrases instead of loose terms", () => {
  assert.equal(buildTsQuery("next.js routing"), "(next <-> js) & routing:*");
});

test("tsquery syntax and quotes in input cannot reach PostgreSQL", () => {
  for (const hostile of ["a & b | c", "x:* y", "')); DROP TABLE x; --", "!(a) <-> b", "\\ ' \" :"]) {
    const built = buildTsQuery(hostile);
    if (built === null) continue;
    assert.match(built, /^[\p{L}\p{N}_ ()<>&!:*-]+$/u, `unsafe output for ${hostile}: ${built}`);
    assert.doesNotMatch(built, /[|'"\\;]/);
  }
  assert.equal(buildTsQuery("!!! ::: &&&"), null);
});

test("non-English and mixed-case words survive", () => {
  assert.equal(buildTsQuery("Ünïcode Café"), "ünïcode & café:*");
});

test("snippets are trimmed without cutting a highlight", () => {
  const long = `${"word ".repeat(40)}${S}match${E} tail`;
  const trimmed = trimSnippet(long, 20);
  assert.ok(trimmed.endsWith("…"));
  assert.equal([...trimmed].filter((c) => c === S).length, [...trimmed].filter((c) => c === E).length);
  assert.equal(trimSnippet(`short ${S}hit${E}`), `short ${S}hit${E}`);
  const cut = trimSnippet(`${S}${"x".repeat(30)}${E}`, 10);
  assert.ok(cut.includes(E), "an open highlight is closed");
});
