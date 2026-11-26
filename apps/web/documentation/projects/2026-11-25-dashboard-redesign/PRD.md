# PRD: The dashboard redesign ("Canopy")

Status: approved 2026-11-25 (direction, round 2 and defaults confirmed by the author) · Horizon 1 · Issue #164

## Problem

Commons works, but it does not look like a product people choose. Every signed-in page is one narrow centred column (most at `max-w-[52rem]`), with plain lists, little hierarchy and no sense of place. The author's words: it is "really minimalistic and won't give users something to reminisce about". Teams compare Commons with Slack, Notion and GitHub every day; next to them it reads as a prototype.

Evidence:

- 10 page containers are capped at `max-w-[52rem]`, more at `max-w-2xl` to `max-w-6xl`; half the screen is empty on a laptop.
- The Horizon 1 gate is a test team using Commons daily for a week. First impressions decide whether the second day happens.
- The author approved a direction on 2026-11-25: the "Canopy" design canvas, kept privately by the author. After a first round (Home, a discussion, the decisions list), the author kept the discussion page and asked for Home and Decisions to be redone in its style; round 2 ("Home v2" and "Decisions v2" on the canvas) was approved with no changes. The canvas is the visual reference for this PRD; the docs rule "Dashboard layout" in `docs/DESIGN_SYSTEM.md` records the full-width decision.

## Goals

1. Every signed-in page and overlay is redesigned to one coherent design language, at the level of Slack, Notion and GitHub, and recognisably Commons rather than a copy of any of them.
2. Pages use the full width: lists and content beside context panels, tables where data is tabular, no page-level width caps.
3. Motion and glass are subtle and purposeful: they make the product feel alive and precise, never playful.
4. Nothing regresses: the same features, permissions, accessibility, test coverage and performance, in light and dark, from a phone to a wide monitor.

## Non-goals

- New features. The redesign shows what exists today (plus layout affordances such as preview panels built from data the app already loads). Inbox as its own page, presence, real time and the like stay in their horizons.
- Marketing and authentication pages (landing, sign-in, registration, join, unsubscribe). They keep the editorial forest stage.
- Replacing Tailwind or Chakra, or adding an animation or component library. Motion is CSS; components are ours.
- Custom themes, density settings or per-user layouts.

## The design language

Named "Canopy". These rules are the source of truth for every pull request in this project; they move into `docs/DESIGN_SYSTEM.md` with the tokens (PR 2).

**Approved references**
- The discussion page (canvas "Discussion · dark"), "Home v2" and "Decisions v2" are the approved designs. Round 1's Home and Decisions are superseded.
- The sidebar is final as designed and stays the same on every page.
- **The discussion's header is the standard for every page**: the glass top bar (breadcrumb left, page actions right) and the page header below it (a small Geist Mono uppercase label, the Instrument Serif title, one plain meta line of facts), followed by small mono uppercase section labels and, where a page has one, a right context panel set off by a hairline. Every page in this project uses exactly this header pattern, type and spacing.

**Structure**
- A deep forest sidebar (`#13231A` light, `#10201A` dark) on every theme: workspace switcher, search and jump (Ctrl K), primary navigation (Home, Inbox, Saved), the current workspace's pages with counts, the member's workspaces with activity dots, and the account card. It is the strongest Commons signature.
- A glass top bar over the content: breadcrumb, page actions on the right, frosted so content blurs as it scrolls beneath.
- Content fills the width beside the sidebar. Pages pair a main column with a context panel (people, files, pins, previews, pulse) that stacks below on narrow screens.

**Surfaces and colour**
- Calm neutral work surfaces: warm grey canvas (`#F3F3EF` light, `#0C110E` dark), white or near-black panels with hairline borders and a barely-there shadow.
- Forest for primary actions and selection; mint for the selected state and live indicators on dark; coral only where something needs the member (unread badge, waiting for you, objections). Status colours are tinted pills (proposal amber, decided forest, replaced violet).
- Contrast meets WCAG AA for all text, including 11–12 px labels.

**Typography**
- Geist for the interface (13–15 px body), Geist Mono for small uppercase labels, metadata and keyboard hints.
- Instrument Serif for page titles only (greeting, discussion and decision titles, section pages). Nowhere else.

**Glass (sparingly)**
- Only floating layers: the top bar, the reply composer that floats over a thread, the command palette, menus, popovers and toasts. `backdrop-filter: blur(18–20px) saturate(1.3–1.4)` over a translucent surface, a hairline border and an inner highlight. Cards, lists and panels stay solid.
- A solid fallback where `backdrop-filter` is unsupported or reduced transparency is preferred.

**Motion**
- Durations 120–340 ms, ease-out (`cubic-bezier(.2,.7,.2,1)`), transform and opacity only.
- Content rises 4 px and fades in on load, in a short stagger (40 ms steps, at most 6 steps); rows and buttons ease their hover colour; cards lift 1 px on hover; image previews scale 1.5%; live dots pulse slowly; progress bars grow into place.
- Nothing bounces, slides across the screen or loops except the live dot. Everything is off under `prefers-reduced-motion: reduce`.

## Pages and overlays

Each redesigned page keeps its current features, tests and accessibility, and follows the language above.

| Area | Today | Redesign |
| --- | --- | --- |
| Shell | Light sidebar, plain header, capped content | Forest sidebar with counts and workspace dots, glass top bar with breadcrumb and actions, full-width frame with an optional context panel, phone drawer |
| Home (`/workspace`) | Stacked sections in a column | "Home v2": a briefing you act on in place. Needs you as rich cards (a review request shows the outcome and reasoning with Approve and Object; a mention shows the quote with a one-line reply; a waiting proposal offers Ask for review and Finalize); Pick up where you left off; right panel with This week (a timeline of decisions, replacements and joins) and each workspace's 7-day activity; first-run guide in the same language |
| Workspace overview | Navigation cards | Workspace header with members and pulse; recent discussions and decisions side by side; activity feed in the panel |
| Discussions list | Rows in a column | Full-width list with unread dots, reply counts, files, last activity and author; filters; the new-discussion composer as a sheet |
| Discussion | Single column thread | Serif title, body, files and reactions; threaded replies with hover states and pinned markers; a floating glass composer; right panel for the decision (or "propose one"), people, files and pinned replies |
| Decisions | Rows in a column, and a separate long record page | "Decisions v2": the list and the record side by side. The list (grouped Waiting on you, Proposals, Decided, Replaced, with a filter) on the left; the selected record on the right: status and version, serif title, the outcome in a callout, rationale and alternatives side by side, files, the review with progress and reviewer cards, history; a floating glass action bar when the member's review is due. The record also has its own URL for direct links |
| Decision (direct link) | Long column | The same record as in Decisions v2, opened with the list beside it on wide screens and alone on narrow ones; edit, finalize, supersede and delete flows in the same language; the full revision history and replacement chain |
| Members | Directory and side forms | Member table with roles and joined dates; invite links and adding by username in the panel |
| Search | Results list | Full-width results with type filters and highlighted snippets; a preview panel |
| Saved | List | Grouped list with type icons and workspace, quick unsave |
| Settings (`/settings/**`) | Email only, single column | The X-style settings area below |
| Overlays | Various | Command palette, notifications, account menu, create-workspace and other dialogs, menus and toasts in one glass style |
| States | Mixed | Skeletons that match each layout, empty states with one clear action, error states with retry, in the same language |

## Settings, in the pattern of X

Decided by the author on 2026-11-25: Commons gets a full settings area with the same pattern as X's (formerly Twitter) web settings, with room for many settings.

- **Layout**: the Commons sidebar stays; the content area becomes two columns. Left, a settings column with a serif "Settings" title, a search field ("Search settings") and the list of categories, each a row with an icon, a name and a one-line description, the open one highlighted. Right, the selected category: its title, an intro line, and its settings as grouped rows (a label, a short description, the current value or a switch, and a chevron for a deeper page). Deeper pages slide in within the right column with a back arrow. On phones the category list is a page of its own and each category opens full width, as on X.
- **Categories** (names may be refined in the settings PRD):
  - **Your account**: name, username, email, password, and signing out of other sessions.
  - **Notifications**: in-app notifications by type and by workspace, the daily digest (today's Settings → Email), quiet hours.
  - **Workspaces**: default workspace on sign-in, leaving a workspace, per-workspace notification overrides.
  - **Appearance**: theme (light, dark, system), reduced motion, start page.
  - **Privacy and security**: active sessions and devices, sign out everywhere, recent security events for the account.
  - **Data**: download your data; delete your account.
  - **About**: version, terms, privacy, keyboard shortcuts.
- **In this project**: the settings layout, navigation, search across setting names, and every setting that exists today moved into it: the daily digest and its workspaces (Notifications), theme (Appearance, today in the account menu), password change (Your account). Categories whose settings are not built yet do not appear until they have at least one working setting.
- **After this project**: a separate settings PRD adds the remaining settings (it absorbs Horizon 1's "notification preferences"), each needing its own data and permissions.

## Requirements

| ID | Requirement |
| --- | --- |
| FR-1 | Design tokens for Canopy (surfaces, sidebar, text, borders, status, glass, radii, shadows, motion) in `styles/globals.css` for light and dark, used through Tailwind; no hard-coded colours in components. |
| FR-2 | Shared primitives used by every page: button variants, status pill, count badge, segmented control, card and panel, data table, avatar and avatar stack, keyboard hint, section label, page title, empty, loading and error states. |
| FR-3 | The shell of the table above, replacing the current one, with the same navigation, keyboard shortcuts and accessibility. |
| FR-4 | Every page and overlay in the table above redesigned, with no page-level width cap (`docs/DESIGN_SYSTEM.md`, "Dashboard layout"). |
| FR-5 | Context panels stack below the main content under 1100 px; the sidebar becomes a drawer under 768 px; nothing scrolls sideways at 390 px except wide tables inside their own box. |
| FR-6 | Light and dark are designed together; every screen in the delivery plan is reviewed in both, on desktop and phone. |
| FR-7 | Every page uses the discussion's header pattern (glass top bar with breadcrumb and actions; mono label, serif title and meta line; mono section labels) and the final sidebar. |
| FR-8 | Settings follow the X pattern above: category list with search and descriptions, grouped setting rows, deeper pages within the detail column, one column on phones; every existing setting lives there. |
| NFR-1 | Accessibility: WCAG 2.2 AA contrast, visible focus on every control, landmarks and headings per page, real buttons and links, no information by colour alone. Existing accessibility tests keep passing. |
| NFR-2 | Motion: only transform and opacity, 340 ms at most, none under reduced motion; glass has a solid fallback. |
| NFR-3 | Performance: no layout shift from animations or fonts (font `display: swap` with metric fallbacks); client JavaScript per route does not grow by more than 5 kB gzipped from this project. |
| NFR-4 | Tests: every changed component keeps or gains tests; the end-to-end journey passes after every pull request; each pull request carries light and dark, desktop and phone screenshots. |

## Subdomains affected

- **Design System**: tokens, primitives, motion and glass, the docs.
- Every product subdomain's components (Home, Discussions, Threaded Comments, Decision Records, Workspaces and Membership, Search, Notifications), restyled without behaviour changes.

## Data and permissions

None. No schema, API or permission changes. Preview panels use data the pages already load or existing queries.

## Risks and open questions

The author confirmed every default on 2026-11-25.

- **Forest sidebar in light and dark.** Decided by the author on 2026-11-25 (approved with the canvas).
- **Serif page titles.** Decided by the author on 2026-11-25 (approved with the canvas). Instrument Serif is added through `next/font`.
- **Inbox in the sidebar.** Decided (author, 2026-11-25): it opens the existing notifications panel; a full Inbox page is a later project.
- **Order of work.** Decided (author, 2026-11-25): tokens and primitives first, then the shell, so every page after it is built on the new frame; then pages by daily use (Home, discussions, decisions, then the rest).
- **Chakra components** (menus) stay for behaviour and are restyled; replacing them is out of scope.
- **Risk: a long-lived mixed look.** Decided (author, 2026-11-25): ship each page to `dev` as it is ready and release in two batches (shell plus Home and discussions; then the rest), so production never shows the half-way state for long.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#164) | `Platform: Design System: PRD for the dashboard redesign` — this document | — |
| 2 (#166) | `Platform: Design System: Canopy tokens, motion, glass and primitives` — tokens light and dark, Instrument Serif, motion and glass utilities with reduced-motion and fallback, the shared primitives with tests, `docs/DESIGN_SYSTEM.md` updated | FR-1, FR-2, NFR-2, NFR-3 |
| 3 (#167) | `Platform: Design System: the Canopy shell` — forest sidebar, glass top bar, full-width frame with context panel, phone drawer | FR-3, FR-5, FR-6, NFR-1 |
| 4 (#168) | `Platform: Design System: overlays in Canopy` — command palette, notifications, account menu, dialogs, menus, toasts | FR-4, NFR-2 |
| 5 (#169) | `Commons: Home: redesign Home as a briefing` — Home v2: greeting and summary line, rich "Needs you" cards (the words of a mention, a proposal's outcome, reasoning and reviews), pick up where you left off, the week and each workspace in the rail | FR-4, FR-6, FR-7 |
| 5b (#181) | `Commons: Home: approve, object and reply from Home` — the canvas's inline actions on Home's cards, using the existing review and comment endpoints | FR-4, FR-6 |
| 6 (#170) | `Commons: Discussions: redesign the discussions list and composer` | FR-4, FR-6 |
| 7 (#171) | `Commons: Discussions: redesign the discussion page` — thread, floating composer, context panel | FR-4, FR-5, FR-6 |
| 8 (#172) | `Commons: Decision Records: redesign decisions as a list beside the record` — Decisions v2: grouped list, the record, review and history, floating action bar | FR-4, FR-6, FR-7 |
| 9 (#173) | `Commons: Decision Records: redesign the decision flows` — direct-link record, edit, finalize, supersede and delete, full history and replacement chain | FR-4, FR-6, FR-7 |
| 10 (#174) | `Commons: Workspaces and Membership: redesign the workspace overview and members` | FR-4, FR-6 |
| 11 (#175) | `Commons: Search: redesign search and saved` | FR-4, FR-6 |
| 12 (#176) | `Platform: Design System: settings in the pattern of X` — the settings layout, category list with search, grouped rows and deeper pages; the digest, theme and password moved in | FR-6, FR-8 |
| 13 (#177) | `Platform: Design System: states, accessibility and motion audit` — skeletons, empty and error states everywhere, an accessibility and reduced-motion pass, final screenshots | NFR-1, NFR-2, NFR-4 |
