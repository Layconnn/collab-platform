# Commons Spec Map

Where to find each document about Commons. Product and architecture documents live here, next to the app; repository-wide how-tos live in [`docs/`](../../../docs).

## Product

- [PRODUCT-commons.md](./PRODUCT-commons.md) — vision, core values, constraints, out of scope
- [ROADMAP-commons.md](./ROADMAP-commons.md) — phases, projects and gates

## Architecture

- [ARCHITECTURE-commons.md](./ARCHITECTURE-commons.md) — system boundary and the subdomains used in pull request titles

## Investigations and issues

Dated documents named `YYYY-MM-DD-<investigation|issue|incident>-<topic>.md`:

- [2026-11-19-investigation-codebase-audit.md](./2026-11-19-investigation-codebase-audit.md)

## Projects

Multi-pull-request work lives in `projects/YYYY-MM-DD-<name>/` with a `PRD.md` (requirements with stable IDs such as `FR-1`, `NFR-1`) and an optional `planning/` folder.

- [2026-11-23 Event log, universal search and Cmd-K](./projects/2026-11-23-search-and-activity/PRD.md) — Horizon 1, delivered: event log #78, recent activity #79, search index #80, search page #81, Cmd-K palette #82, live palette results (this project's last pull request); released in #116.
- [2026-11-24 Markdown, reactions, follow and pin](./projects/2026-11-24-markdown-reactions-follow-pin/PRD.md) — Horizon 1, delivered: PRD #118, Markdown #124, reactions #125, follow and mute #126, pinned replies #127, saved items #129; released in #130.
- [2026-11-24 The daily digest email](./projects/2026-11-24-daily-digest/PRD.md) — Horizon 1, delivered: PRD #135, builder and preview #139, daily sending #140, preferences and unsubscribe (this project's last pull request).
- [2026-11-23 The new Home](./projects/2026-11-23-home/PRD.md) — Horizon 1, delivered: needs you #93, pulse #94, decided this week #95, Home page #96, pulse time-zone fix #98, workspace cards #99, first run and create dialog #100; released in #101.
- [2026-11-25 File uploads](./projects/2026-11-25-file-uploads/PRD.md) — Horizon 1, delivered: PRD #144, private storage in R2 #148, discussions and replies #149, decisions and counts #150; released in #151.
- [2026-11-25 Invite links](./projects/2026-11-25-invite-links/PRD.md) — Horizon 1, delivered: PRD #154, service and tests #158, Members page #159, join page (this project's last pull request).
- [2026-11-25 The dashboard redesign ("Canopy")](./projects/2026-11-25-dashboard-redesign/PRD.md) — Horizon 1, planned: PRD #164.
- [2026-11-24 Decision reviews](./projects/2026-11-24-decision-reviews/PRD.md) — Horizon 1, delivered: PRD #106, reviewers and answers #111 (the migration), resets and the finalize gate #112, Review section #113, notifications, Home, lists and activity (this project's last pull request).

## Operations

- [Development setup, CI and notification delivery](../../../docs/DEVELOPMENT.md)
- [Deployment](../../../docs/DEPLOYMENT.md)
- [How to work with Git & GitHub](../../../docs/how-to-work-with-git-github.md)
- [How to finish a pull request](../../../docs/how-to-finish-pr.md)
- [How to do DevOps on Vercel](../../../docs/how-to-do-devops.md)
- [How to add an entity](../../../docs/how-to-add-an-entity.md)
- Agent skills, commands and hooks: [`CLAUDE.md`](../../../CLAUDE.md) and `.claude/`

## Design

- [Design system](../../../docs/DESIGN_SYSTEM.md)
- [Marketing architecture](../../../docs/MARKETING_ARCHITECTURE.md)
