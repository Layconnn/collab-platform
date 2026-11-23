# PRD: Event log, universal search and Cmd-K

Status: approved 2026-11-23 · Horizon 1 · Issue #70

## Problem

Commons is meant to be the place a team's reasoning lives, but today nothing in it can be found except by scrolling. A member who remembers "we decided something about the worker last month" has to open each discussion and decision list by hand. There is also no shared record of what happened in a workspace: notifications, audit events and lists each read their own tables, so every later feature that needs "what changed" (the Home feed, the daily digest, real-time updates, the decision graph) would have to invent its own.

Evidence:

- The product's value depends on finding old decisions; there is no search at all.
- Navigation is mouse-only: there are no keyboard shortcuts and no way to jump between workspaces, discussions and decisions without the sidebar.
- The vision's Home ("Needs you", workspace pulse), the daily digest and real time all need one event stream.

## Goals

1. Any member finds a discussion, comment or decision they can access in seconds, by words they remember, with decisions ranked first.
2. Anything in Commons is reachable and the most common actions are runnable from the keyboard with Cmd-K (Ctrl-K on Windows and Linux).
3. Every change to discussions, comments, decisions and membership is recorded once, in one append-only event log, that later features read.
4. Nothing leaks across workspaces: search, the palette and the event log never return anything from a workspace the user is not a member of.

## Non-goals

- The Home redesign, the daily digest and real-time updates. They are separate Horizon 1 projects that read this event log.
- Pages, tasks and files in search: they do not exist yet. The search design must accept them later without a rewrite.
- A dedicated search engine (Meilisearch, Typesense). PostgreSQL full-text search on Neon is enough at current scale and costs nothing.
- Search inside deleted content. Deleted decisions stay out of results, as they are everywhere else.

## Users and flows

**Flow 1: find a decision**

1. Anywhere in the app, the user presses Cmd-K.
2. The palette opens with the cursor in its input, showing recent items and suggested actions.
3. The user types "worker queue". Results appear as they type, grouped as Decisions, Discussions, Comments; each shows its workspace, status and a highlighted snippet.
4. Arrow keys move the selection; Enter opens the decision. Escape closes the palette and returns focus to where it was.

**Flow 2: full search with filters**

1. In the palette the user chooses "See all results", or opens `/search?q=...`.
2. The search page shows all matches with filters for type, workspace, decision status, author and date, and loads more on request.
3. The URL keeps the query and filters, so the search can be shared with a teammate who has the same access.

**Flow 3: run an action**

1. The user presses Cmd-K and types "new disc".
2. The action "New discussion in Platform" is first; Enter opens the composer in that workspace.
3. Other actions: switch workspace, new workspace, open decisions or members of the current workspace, switch theme, show keyboard shortcuts, sign out.

**Flow 4: see what changed**

1. On a workspace's overview, the user sees "Recent activity": who did what, newest first, each linking to its subject.
2. They filter it by kind (discussions, comments, decisions, members) and load older entries.

## Requirements

### Event log

| ID | Requirement |
| --- | --- |
| FR-1 | Every create, edit and delete of a discussion or comment; every decision create, edit, finalize, supersede and delete; and every member add, role change, removal and ownership transfer writes one event. |
| FR-2 | An event records workspace, actor (with a display-name snapshot, kept if the user is deleted), kind, subject type and id, a small JSON summary (for example a title), and time. It never stores full bodies. |
| FR-3 | The event is written in the same database transaction as the change, so a change without its event (or an event without its change) cannot be committed. |
| FR-4 | Events are append-only: no API edits or deletes them. They are removed only when their workspace is deleted. |
| FR-5 | `activity.listByWorkspace` returns a workspace's events newest first with cursor pagination, filterable by kind, for members only; non-members get NOT_FOUND. |
| FR-6 | Events whose subject was later deleted still list, with the subject shown as unavailable and no link. |
| FR-7 | The workspace overview shows "Recent activity" with kind filters and "Load more". |

### Search

| ID | Requirement |
| --- | --- |
| FR-8 | `search.query` searches discussion titles and bodies, comment bodies, and decision questions, outcomes, rationales, alternatives and follow-ups across every workspace the user belongs to, or one workspace when given. |
| FR-9 | Results include only content in the user's workspaces at query time and exclude soft-deleted decisions; membership is checked in the same query that reads the results. |
| FR-10 | Matching supports several words, quoted phrases, `-excluded` words and prefix matching on the last word while typing ("work" matches "worker"). |
| FR-11 | Ranking weights titles and decision questions above bodies, and boosts decisions over discussions over comments; ties go to the most recently updated. |
| FR-12 | Each result returns type, id, workspace, title (for a comment, its discussion's title), a highlighted snippet of at most about 160 characters with matched words marked, status for decisions, author and update time. |
| FR-13 | Filters: type, workspace, decision status, author and updated-after date. Results paginate with a cursor, 20 per page by default. |
| FR-14 | The `/search` page shows results with the filters of FR-13, keeps query and filters in the URL, and shows empty, loading, error and no-access states. |
| FR-15 | Search is rate-limited per user, and queries shorter than 2 characters return no results without hitting the database. |

### Cmd-K palette

| ID | Requirement |
| --- | --- |
| FR-16 | Cmd-K or Ctrl-K opens the palette from any signed-in page; the same shortcut or Escape closes it and returns focus to the element that had it. |
| FR-17 | With an empty input, the palette shows recently opened items (kept per browser) and suggested actions for the current workspace. |
| FR-18 | Typing shows live search results (FR-8) grouped by type, debounced so a fast typist sends at most one request per 150 ms, alongside matching actions and workspaces. |
| FR-19 | Actions: open a workspace; new workspace; new discussion; open discussions, decisions, members or overview of the current workspace; switch theme; keyboard shortcuts; sign out. Actions a user's role cannot perform are not shown. |
| FR-20 | Arrow keys, Home and End move the selection, Enter opens it, and the selection is announced to screen readers (combobox and listbox pattern). |
| FR-21 | "See all results" opens `/search` with the current query. |
| FR-22 | `?` (outside text inputs) opens a keyboard shortcuts sheet listing Cmd-K and the palette's keys. |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | Search returns in under 300 ms at the 95th percentile on a workspace with 10,000 discussions, comments and decisions (measured on a seeded test database). |
| NFR-2 | Writing an event adds no extra round trip outside the change's transaction, and adds less than 10 ms to a mutation. |
| NFR-3 | Tenant isolation is covered by tests: a user outside a workspace never receives its search results, events or palette entries, including through filters naming that workspace. |
| NFR-4 | The palette and search page meet WCAG 2.2 AA: keyboard operable, visible focus, announced results and states, both themes. |
| NFR-5 | The search interface (service and router) does not expose PostgreSQL specifics, so a dedicated engine can replace it later. |
| NFR-6 | No new paid service: PostgreSQL full-text search on the existing Neon database, Redis for rate limits. |

## Subdomains affected

- **Search** (new): the search service, router, page and palette.
- **Activity** (new): the event log, its read API and the Recent activity panel.
- **Discussions**, **Threaded Comments**, **Decision Records**, **Workspaces and Membership**: their services write events (FR-1).
- **Design System**: the palette and shortcuts sheet.

`ARCHITECTURE-commons.md` gains the two new subdomains and the event log in the system diagram.

## Data and permissions

**`ActivityEvent`** (new table)

| Field | Notes |
| --- | --- |
| `id` | cuid |
| `workspaceId` | required; cascades with the workspace |
| `actorUserId`, `actorLabel` | actor id nullable (set null when the user is deleted); label snapshot always kept |
| `kind` | enum, for example `DISCUSSION_CREATED`, `COMMENT_DELETED`, `DECISION_FINALIZED`, `MEMBER_ROLE_CHANGED` |
| `subjectType`, `subjectId` | the thing that changed |
| `summary` | small JSON: a title or question snapshot, old and new role; never full bodies |
| `createdAt` | indexed with `workspaceId` for the feed |

Indexes: `(workspaceId, createdAt desc, id)` for the feed, `(subjectType, subjectId)` to resolve and mark unavailable subjects.

**Search columns:** generated `tsvector` columns on `Discussion`, `Comment` and `Decision` with weighted fields (A: title or question; B: body, outcome, rationale; C: alternatives, follow-up), each with a GIN index, added by a raw SQL migration and declared in Prisma as `Unsupported("tsvector")`. The `simple` text configuration is used so that names, code words and non-English text match as typed; stemming can be revisited later.

**Permissions:** every read joins `WorkspaceMember` on the requesting user; the workspace filter in FR-13 narrows but never widens. Events and search results are visible to every member of the workspace, matching today's rule that all members can read all discussions and decisions. Actions in the palette follow the permission matrix (`WORKSPACE_ACTIONS`).

**Tenant scoping:** all three tables already carry `workspaceId`; queries filter by it inside the same SQL statement as the membership join.

## Risks and open questions

- **Migration size:** generated columns rewrite the three tables once. At today's data size this takes seconds; the production migration runs through the approval-gated workflow.
- **`simple` versus `english` configuration:** `simple` will not match "decide" to "decided". Decided: `simple` for v1; add a stemmed column later if users miss matches.
- **Hard-deleted discussions and comments:** their events keep the title snapshot but lose the link (FR-6). Should deleting a discussion also hide its title from the activity feed for privacy? Decided: keep the title, since all members could already read it.
- **Recent items per browser:** kept in local storage, so they do not follow the user across devices. A server-side "recently viewed" comes with the Home project.
- **Ranking quality:** weights are a first guess; anonymous result-position clicks (no query text) could tune ranking. Decided: not in v1; revisit after the test team uses search.

## Delivery plan

Each pull request starts from its own issue and merges into `dev` one at a time.

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 | `Commons: Activity: record workspace events in one append-only log` — model, migration, kinds, the write helper and events from discussion, comment, decision and membership services, with tests that each mutation writes exactly one event in its transaction | FR-1 to FR-4, NFR-2 |
| 2 | `Commons: Activity: show recent activity on the workspace overview` — `activity.listByWorkspace`, the Recent activity panel with filters and pagination, tenant tests | FR-5 to FR-7, NFR-3 |
| 3 | `Commons: Search: index discussions, comments and decisions for full-text search` — generated columns, GIN indexes, the search service and `search.query` with ranking, snippets, filters, rate limit, and tenant and ranking tests on the real test database | FR-8 to FR-13, FR-15, NFR-1, NFR-3, NFR-5, NFR-6 |
| 4 | `Commons: Search: add the search page with filters` | FR-14, NFR-4 |
| 5 | `Commons: Search: open a Cmd-K palette for navigation and actions` — shortcut, recent items, actions, keyboard and screen-reader behaviour | FR-16, FR-17, FR-19, FR-20, FR-22, NFR-4 |
| 6 | `Commons: Search: show live search results in the Cmd-K palette` | FR-18, FR-21 |

Pull requests 1 and 3 each include a migration, applied to production through the migrate-production workflow after release.
