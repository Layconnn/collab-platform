# PRD: The dashboard redesign ("Canopy")

Status: draft for approval · Horizon 1 · Issue #164

## Problem

Commons works, but it does not look like a product people choose. Every signed-in page is one narrow centred column (most at `max-w-[52rem]`), with plain lists, little hierarchy and no sense of place. The author's words: it is "really minimalistic and won't give users something to reminisce about". Teams compare Commons with Slack, Notion and GitHub every day; next to them it reads as a prototype.

Evidence:

- 10 page containers are capped at `max-w-[52rem]`, more at `max-w-2xl` to `max-w-6xl`; half the screen is empty on a laptop.
- The Horizon 1 gate is a test team using Commons daily for a week. First impressions decide whether the second day happens.
- The author approved a direction on 2026-11-25: the "Canopy" design canvas (Home, a discussion, the decisions list), kept privately by the author. It is the reference for this PRD; the docs rule "Dashboard layout" in `docs/DESIGN_SYSTEM.md` records the full-width decision.

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
| Home (`/workspace`) | Stacked sections in a column | Serif greeting with today's summary chips; Needs you as a filterable queue with kind icons and Done; Decided this week as cards; right panel with each workspace's pulse and recent activity; first-run guide in the same language |
| Workspace overview | Navigation cards | Workspace header with members and pulse; recent discussions and decisions side by side; activity feed in the panel |
| Discussions list | Rows in a column | Full-width list with unread dots, reply counts, files, last activity and author; filters; the new-discussion composer as a sheet |
| Discussion | Single column thread | Serif title, body, files and reactions; threaded replies with hover states and pinned markers; a floating glass composer; right panel for the decision (or "propose one"), people, files and pinned replies |
| Decisions list | Rows in a column | Status tabs with counts, filter box, a table (question, source, status pill, review progress, updated), a preview panel with the record and Approve or Object |
| Decision | Long column | Record layout: status, question and outcome up top; rationale, alternatives and files; reviews and the finalize flow in the panel; revision history as a timeline; replacement chain |
| Members | Directory and side forms | Member table with roles and joined dates; invite links and adding by username in the panel |
| Search | Results list | Full-width results with type filters and highlighted snippets; a preview panel |
| Saved | List | Grouped list with type icons and workspace, quick unsave |
| Settings → Email | Single column | A settings layout (section navigation on the left, ready for more settings), the digest switches and the preview |
| Overlays | Various | Command palette, notifications, account menu, create-workspace and other dialogs, menus and toasts in one glass style |
| States | Mixed | Skeletons that match each layout, empty states with one clear action, error states with retry, in the same language |

## Requirements

| ID | Requirement |
| --- | --- |
| FR-1 | Design tokens for Canopy (surfaces, sidebar, text, borders, status, glass, radii, shadows, motion) in `styles/globals.css` for light and dark, used through Tailwind; no hard-coded colours in components. |
| FR-2 | Shared primitives used by every page: button variants, status pill, count badge, segmented control, card and panel, data table, avatar and avatar stack, keyboard hint, section label, page title, empty, loading and error states. |
| FR-3 | The shell of the table above, replacing the current one, with the same navigation, keyboard shortcuts and accessibility. |
| FR-4 | Every page and overlay in the table above redesigned, with no page-level width cap (`docs/DESIGN_SYSTEM.md`, "Dashboard layout"). |
| FR-5 | Context panels stack below the main content under 1100 px; the sidebar becomes a drawer under 768 px; nothing scrolls sideways at 390 px except wide tables inside their own box. |
| FR-6 | Light and dark are designed together; every screen in the delivery plan is reviewed in both, on desktop and phone. |
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

Each question has a proposed default for the author to confirm.

- **Forest sidebar in light and dark.** Decided by the author on 2026-11-25 (approved with the canvas).
- **Serif page titles.** Decided by the author on 2026-11-25 (approved with the canvas). Instrument Serif is added through `next/font`.
- **Inbox in the sidebar.** The canvas shows Inbox with a count. Default: it opens the existing notifications panel; a full Inbox page is a later project.
- **Order of work.** Default: tokens and primitives first, then the shell, so every page after it is built on the new frame; then pages by daily use (Home, discussions, decisions, then the rest).
- **Chakra components** (menus) stay for behaviour and are restyled; replacing them is out of scope.
- **Risk: a long-lived mixed look.** Between the shell and the last page, some pages will look newer than others. Default: ship each page to `dev` as it is ready and release in two batches (shell plus Home and discussions; then the rest), so production never shows the half-way state for long.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#164) | `Platform: Design System: PRD for the dashboard redesign` — this document | — |
| 2 | `Platform: Design System: Canopy tokens, motion, glass and primitives` — tokens light and dark, Instrument Serif, motion and glass utilities with reduced-motion and fallback, the shared primitives with tests, `docs/DESIGN_SYSTEM.md` updated | FR-1, FR-2, NFR-2, NFR-3 |
| 3 | `Platform: Design System: the Canopy shell` — forest sidebar, glass top bar, full-width frame with context panel, phone drawer | FR-3, FR-5, FR-6, NFR-1 |
| 4 | `Platform: Design System: overlays in Canopy` — command palette, notifications, account menu, dialogs, menus, toasts | FR-4, NFR-2 |
| 5 | `Commons: Home: redesign Home` | FR-4, FR-6 |
| 6 | `Commons: Discussions: redesign the discussions list and composer` | FR-4, FR-6 |
| 7 | `Commons: Discussions: redesign the discussion page` — thread, floating composer, context panel | FR-4, FR-5, FR-6 |
| 8 | `Commons: Decision Records: redesign the decisions list` — tabs, table, preview panel | FR-4, FR-6 |
| 9 | `Commons: Decision Records: redesign the decision page` — record, reviews, history, replacements | FR-4, FR-6 |
| 10 | `Commons: Workspaces and Membership: redesign the workspace overview and members` | FR-4, FR-6 |
| 11 | `Commons: Search: redesign search and saved` | FR-4, FR-6 |
| 12 | `Commons: Notifications: redesign email settings in a settings layout` | FR-4, FR-6 |
| 13 | `Platform: Design System: states, accessibility and motion audit` — skeletons, empty and error states everywhere, an accessibility and reduced-motion pass, final screenshots | NFR-1, NFR-2, NFR-4 |
