-- Full-text search columns (PRD 2026-11-23 search and activity, FR-8 to FR-11).
-- Each searchable table gets a stored, generated tsvector, so ranking reads a
-- precomputed vector instead of re-parsing text for every match, plus a GIN
-- index for matching. Prisma declares the columns as Unsupported("tsvector")
-- with a database-generated default, so its drift check accepts them.
-- The 'simple' configuration matches words as typed (names, code terms, any
-- language); weights rank titles and questions (A) above bodies (B, C).
-- Adding a stored generated column rewrites each table once.

ALTER TABLE "Discussion" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("body", '')), 'B')
) STORED;

ALTER TABLE "Comment" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("body", '')), 'B')
) STORED;

ALTER TABLE "Decision" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("question", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("outcome", '') || ' ' || coalesce("rationale", '')), 'B') ||
  setweight(to_tsvector('simple', coalesce("alternatives", '') || ' ' || coalesce("followUp", '')), 'C')
) STORED;

CREATE INDEX "Discussion_searchVector_idx" ON "Discussion" USING GIN ("searchVector");
CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");
CREATE INDEX "Decision_searchVector_idx" ON "Decision" USING GIN ("searchVector");
