import type { SearchInput, SearchResultType } from "@repo/validators/search";
import { Prisma } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";

// Full-text search over discussions, comments and decisions with PostgreSQL.
// Callers see only types and plain results, so a dedicated search engine can
// replace this module later without touching the router or the UI (NFR-5).

// Stored, generated tsvector columns with GIN indexes
// (prisma/migrations/20261123_search_indexes): matching uses the index and
// ranking reads the precomputed vector.
const DISCUSSION_VECTOR = Prisma.sql`d."searchVector"`;
const COMMENT_VECTOR = Prisma.sql`c."searchVector"`;
const DECISION_VECTOR = Prisma.sql`x."searchVector"`;

// Decisions first, then discussions, then comments (FR-11).
const BOOST: Record<SearchResultType, number> = { DECISION: 2, DISCUSSION: 1.4, COMMENT: 1 };

// Snippet highlight markers: control characters never typed in content.
export const HIGHLIGHT_START = "\u0002";
export const HIGHLIGHT_END = "\u0003";
const SNIPPET_LIMIT = 160;
const MAX_OFFSET = 500;

export type SearchResult = {
  type: SearchResultType;
  id: string;
  workspace: { id: string; name: string };
  // A comment's title is its discussion's title.
  title: string;
  // Matched words are wrapped in HIGHLIGHT_START and HIGHLIGHT_END.
  snippet: string;
  status: "PROPOSED" | "DECIDED" | "SUPERSEDED" | null;
  author: string;
  discussionId: string | null;
  // How many files the result has (file uploads PRD, FR-10).
  files: number;
  updatedAt: Date;
};

const termsOf = (text: string) => (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);

// Turns what a person types into a to_tsquery expression. Every term is
// reduced to letters, digits and underscores, so no input can inject tsquery
// syntax. Words must all match; "quoted phrases" match in order; -word
// excludes; the last plain word matches as a prefix while typing (FR-10).
// Returns null when nothing positive is left to search for.
export function buildTsQuery(input: string): string | null {
  const positive: string[] = [];
  const negative: string[] = [];
  let lastPlain = -1;
  for (const match of input.matchAll(/"([^"]*)"|(-?)([^\s"]+)/g)) {
    const [, phrase, minus, word] = match;
    if (phrase !== undefined) {
      const terms = termsOf(phrase);
      if (terms.length) positive.push(terms.length > 1 ? `(${terms.join(" <-> ")})` : terms[0]!);
      continue;
    }
    const terms = termsOf(word ?? "");
    if (!terms.length) continue;
    // "next.js" becomes the phrase next <-> js rather than two loose words.
    const term = terms.length > 1 ? `(${terms.join(" <-> ")})` : terms[0]!;
    if (minus) {
      negative.push(`!${term}`);
    } else {
      positive.push(term);
      lastPlain = terms.length === 1 ? positive.length - 1 : -1;
    }
  }
  if (!positive.length) return null;
  if (lastPlain === positive.length - 1) positive[lastPlain] = `${positive[lastPlain]}:*`;
  return [...positive, ...negative].join(" & ");
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset)).toString("base64url");
}
function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  const offset = Number(Buffer.from(cursor, "base64url").toString());
  return Number.isInteger(offset) && offset >= 0 && offset <= MAX_OFFSET ? offset : 0;
}

// File counts for a page of results, by result id.
async function fileCounts(rows: Array<{ type: string; id: string }>) {
  const ids = (type: string) => rows.filter((row) => row.type === type).map((row) => row.id);
  const [discussions, comments, decisions] = await Promise.all([
    prisma.attachment.groupBy({ by: ["discussionId"], where: { discussionId: { in: ids("DISCUSSION") } }, _count: true }),
    prisma.attachment.groupBy({ by: ["commentId"], where: { commentId: { in: ids("COMMENT") } }, _count: true }),
    prisma.attachment.groupBy({ by: ["decisionId"], where: { decisionId: { in: ids("DECISION") } }, _count: true }),
  ]);
  return new Map<string, number>([
    ...discussions.map((row) => [row.discussionId!, row._count] as const),
    ...comments.map((row) => [row.commentId!, row._count] as const),
    ...decisions.map((row) => [row.decisionId!, row._count] as const),
  ]);
}

// Keeps a snippet short without cutting a highlight in half.
export function trimSnippet(snippet: string, limit = SNIPPET_LIMIT): string {
  const plainLength = snippet.replaceAll(HIGHLIGHT_START, "").replaceAll(HIGHLIGHT_END, "").length;
  if (plainLength <= limit) return snippet.trim();
  let visible = 0;
  let out = "";
  let open = false;
  for (const char of snippet) {
    if (char === HIGHLIGHT_START) { open = true; out += char; continue; }
    if (char === HIGHLIGHT_END) { open = false; out += char; continue; }
    if (visible >= limit && !open) break;
    out += char;
    visible++;
  }
  if (open) out += HIGHLIGHT_END;
  return `${out.trimEnd()}…`;
}

type Row = {
  type: SearchResultType; id: string; workspace_id: string; workspace_name: string; title: string;
  snippet: string | null; status: SearchResult["status"]; author: string; discussion_id: string | null;
  updated_at: Date; rank: number;
};

export const searchService = {
  async query(userId: string, input: SearchInput): Promise<{ items: SearchResult[]; nextCursor: string | null }> {
    // Every branch of the UNION names its columns, because the first branch to
    // run sets the names and filters decide which branch comes first.
    // Too short to be useful, or nothing positive to look for: no database work (FR-15).
    if (input.query.replace(/\s+/g, "").length < 2) return { items: [], nextCursor: null };
    const tsquery = buildTsQuery(input.query);
    if (!tsquery) return { items: [], nextCursor: null };

    const offset = decodeCursor(input.cursor);
    const wanted = new Set<SearchResultType>(input.types ?? ["DECISION", "DISCUSSION", "COMMENT"]);
    // A decision status filter only applies to decisions.
    if (input.status) {
      wanted.delete("DISCUSSION");
      wanted.delete("COMMENT");
    }
    if (!wanted.size) return { items: [], nextCursor: null };

    const scope = (alias: string) =>
      Prisma.sql`JOIN "WorkspaceMember" m ON m."workspaceId" = ${Prisma.raw(`${alias}."workspaceId"`)} AND m."userId" = ${userId}
        JOIN "Workspace" w ON w."id" = ${Prisma.raw(`${alias}."workspaceId"`)}`;
    const commonFilters = (alias: string, authorColumn: string) => Prisma.join([
      Prisma.sql`TRUE`,
      input.workspaceId ? Prisma.sql`${Prisma.raw(`${alias}."workspaceId"`)} = ${input.workspaceId}` : Prisma.empty,
      input.authorId ? Prisma.sql`${Prisma.raw(`${alias}."${authorColumn}"`)} = ${input.authorId}` : Prisma.empty,
      input.updatedAfter ? Prisma.sql`${Prisma.raw(`${alias}."updatedAt"`)} >= ${input.updatedAfter}` : Prisma.empty,
    ].filter((part) => part !== Prisma.empty), " AND ");

    const parts: Prisma.Sql[] = [];
    if (wanted.has("DECISION")) {
      parts.push(Prisma.sql`
        SELECT 'DECISION'::text AS type, x."id", w."id" AS workspace_id, w."name" AS workspace_name,
          x."question" AS title,
          coalesce(nullif(concat_ws(' ', x."outcome", x."rationale", x."alternatives", x."followUp"), ''), x."question") AS snippet_source,
          x."status"::text AS status, x."createdByLabel" AS author, x."sourceDiscussionId" AS discussion_id,
          x."updatedAt" AS updated_at, ts_rank_cd(${DECISION_VECTOR}, q.query, 32) * ${BOOST.DECISION} AS rank
        FROM "Decision" x CROSS JOIN q ${scope("x")}
        WHERE x."deletedAt" IS NULL AND ${DECISION_VECTOR} @@ q.query AND ${commonFilters("x", "createdById")}
          ${input.status ? Prisma.sql`AND x."status"::text = ${input.status}` : Prisma.empty}`);
    }
    if (wanted.has("DISCUSSION")) {
      parts.push(Prisma.sql`
        SELECT 'DISCUSSION'::text AS type, d."id", w."id" AS workspace_id, w."name" AS workspace_name, d."title" AS title,
          d."body" AS snippet_source,
          NULL::text AS status, coalesce(nullif(trim(u."name"), ''), u."username") AS author, d."id" AS discussion_id,
          d."updatedAt" AS updated_at, ts_rank_cd(${DISCUSSION_VECTOR}, q.query, 32) * ${BOOST.DISCUSSION} AS rank
        FROM "Discussion" d CROSS JOIN q ${scope("d")} JOIN "User" u ON u."id" = d."authorId"
        WHERE ${DISCUSSION_VECTOR} @@ q.query AND ${commonFilters("d", "authorId")}`);
    }
    if (wanted.has("COMMENT")) {
      parts.push(Prisma.sql`
        SELECT 'COMMENT'::text AS type, c."id", w."id" AS workspace_id, w."name" AS workspace_name, pd."title" AS title,
          c."body" AS snippet_source,
          NULL::text AS status, coalesce(nullif(trim(u."name"), ''), u."username") AS author, c."discussionId" AS discussion_id,
          c."updatedAt" AS updated_at, ts_rank_cd(${COMMENT_VECTOR}, q.query, 32) * ${BOOST.COMMENT} AS rank
        FROM "Comment" c CROSS JOIN q ${scope("c")} JOIN "User" u ON u."id" = c."authorId"
          JOIN "Discussion" pd ON pd."id" = c."discussionId"
        WHERE ${COMMENT_VECTOR} @@ q.query AND ${commonFilters("c", "authorId")}`);
    }

    // Rank and paginate first, then build snippets only for the returned page:
    // ts_headline is costly, and computing it for every match made broad
    // queries slow (about 1.5 s at p95 on 10,000 items when every item matched).
    const headlineOptions = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, MaxWords=24, MinWords=10, ShortWord=1, MaxFragments=1`;
    const rows = await prisma.$queryRaw<Row[]>`
      WITH q AS (SELECT to_tsquery('simple', ${tsquery}) AS query),
      page AS (
        SELECT * FROM (${Prisma.join(parts, " UNION ALL ")}) results
        ORDER BY rank DESC, updated_at DESC, id DESC
        LIMIT ${input.take + 1} OFFSET ${offset}
      )
      SELECT page.type, page.id, page.workspace_id, page.workspace_name, page.title,
        ts_headline('simple', page.snippet_source, q.query, ${headlineOptions}) AS snippet,
        page.status, page.author, page.discussion_id, page.updated_at, page.rank
      FROM page CROSS JOIN q
      ORDER BY page.rank DESC, page.updated_at DESC, page.id DESC`;

    const page = rows.slice(0, input.take);
    const next = offset + input.take;
    const files = await fileCounts(page);
    return {
      items: page.map((row) => ({
        type: row.type,
        id: row.id,
        workspace: { id: row.workspace_id, name: row.workspace_name },
        title: row.title,
        snippet: trimSnippet(row.snippet ?? ""),
        status: row.status,
        author: row.author,
        discussionId: row.discussion_id,
        files: files.get(row.id) ?? 0,
        updatedAt: row.updated_at,
      })),
      nextCursor: rows.length > input.take && next <= MAX_OFFSET ? encodeCursor(next) : null,
    };
  },
};
