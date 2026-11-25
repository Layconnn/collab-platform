# Roadmap: Commons

## Horizons

The product vision (2026-11-23) organizes Commons into seven pillars (Home and navigation, Conversations, Decisions, Knowledge, Work, Intelligence, Platform) and seven horizons. A horizon ends when its gate is met, not on a date. Phase 0 (stabilize) is complete.

| Horizon | Goal | Projects | Gate |
| --- | --- | --- | --- |
| H1. Foundations and daily use | Make Commons findable and usable every day | [Event log, universal search and Cmd-K](./projects/2026-11-23-search-and-activity/PRD.md); [the new Home](./projects/2026-11-23-home/PRD.md) ("Needs you", workspace pulse, decided this week); [Markdown, reactions, follow and pin](./projects/2026-11-24-markdown-reactions-follow-pin/PRD.md); [decision reviews](./projects/2026-11-24-decision-reviews/PRD.md); [daily digest email](./projects/2026-11-24-daily-digest/PRD.md); [file uploads](./projects/2026-11-25-file-uploads/PRD.md); [invite links](./projects/2026-11-25-invite-links/PRD.md); notification preferences; [the dashboard redesign](./projects/2026-11-25-dashboard-redesign/PRD.md) (every signed-in page full width and redesigned to a Slack, Notion and GitHub level; see "Dashboard layout" in `docs/DESIGN_SYSTEM.md`) | A test team of 3 to 5 people uses Commons daily for a week without moving threads back to chat |
| H2. Signature depth | Make decisions the reason to use Commons | Promote to decision, open questions, recorded dissent, decision types and templates, options matrix, confidence, revisit dates and assumptions, outcome reviews, decision graph, timeline and health, saved views | Teams return to old decisions and use revisits; at least one decision is superseded through Commons |
| H3. Real time | Quick talk without another chat tool | Channels, direct messages, live updates, presence, polls, reminders, slash commands, installable app | Quick talk happens in Commons instead of a separate chat tool |
| H4. Knowledge | Write the specs that produce decisions | Pages, block editor (Tiptap), templates, backlinks, decision embeds, block comments, history, databases, collaborative editing, verified pages, meeting notes to decisions | Proposals are written in Commons instead of an external editor |
| H5. Work | Turn decisions into tracked work | Tasks from follow-ups, projects and boards, cycles, GitHub integration and "why is this here?", automations, ADR export | Follow-up work is tracked in Commons and links back to its decision |
| H6. Intelligence | Read the record so people do not have to | Catch me up, ask the workspace, draft a decision, contradiction and duplicate checks, smart digest, all with cited sources | People use the brief instead of scrolling back |
| H7. Enterprise | Meet a larger team's admin needs | Organizations and teams, granular permissions, guests, audit log, API and webhooks, imports, SSO and SCIM, export and retention | A team larger than 20 could adopt Commons |

## Budget

Every horizon runs on free plans at test-team scale: PostgreSQL full-text search on Neon, Resend for email, Cloudflare R2 for files, Ably or Pusher for real time, Cloudflare Workers with Durable Objects for collaborative editing, and free model tiers behind the AI SDK for intelligence. Each project's PRD checks current free limits before work starts. Paid plans begin only when a trigger is reached; the first is Vercel Pro, required as soon as Commons charges customers (Vercel Hobby is non-commercial). Planning figures: $0 a month now, about $60 to $100 a month at first paying customers, about $150 to $300 a month at a few hundred active people.

## Brand

- An official Commons logo at an enterprise, top-tier standard: a mark and wordmark that work from a 16px favicon to a landing-page hero, in light and dark themes, built on the Commons palette (forest `#192D20`, cream `#EEE5D2`, coral `#CD6055`, mint `#9FD3B4`). Delivered as SVG with usage rules, then applied to the app, the landing page, the README and social cards.

## Beyond the current milestone

- Move notification delivery to a dedicated worker (Railway) once budget allows; Vercel Queues stays as the fallback.
- A transactional outbox if notification delivery needs a guarantee.
