# Product: Commons

## Vision

Commons remembers why. Small software teams lose the reasoning behind their decisions across chat, issues, documents and long threads. Commons keeps the discussion, the decision it produced, the alternatives that were rejected and every later change to that decision in one place, so a newcomer or a returning teammate can understand why things are the way they are.

The first audience is small software teams.

## Core values

- **Context over volume.** A decision is only useful with the discussion and rationale behind it; Commons keeps them linked.
- **History is never rewritten.** Decisions change by superseding them, and every revision stays readable.
- **Tenant safety by default.** Every read and write is checked against workspace membership on the server; hiding a button is never authorization.
- **Honest claims.** Features are described as verified only after they are tested and observed; the product does not claim scale or delivery guarantees it has not measured.

## Constraints

- One deployable Next.js application on Vercel with PostgreSQL and Redis; no microservices.
- Background work must run on Vercel-compatible infrastructure (Vercel Queues today; a separate worker later).
- Notification delivery is at-least-once and best effort after the database write; there is no transactional outbox yet.
- Personal data stays minimal: public identities are a name and a username; AI features, when added, are opt-in per workspace.

## Out of scope

- A general-purpose Notion or GitHub clone; features are added when they strengthen decision memory.
- Real-time chat.
- Billing and pricing until there is a pricing model.

## Sources

- [Commons project handoff](../../../docs/COMMONS_PROJECT_HANDOFF.md)
- [Codebase Report & Roadmap](https://claude.ai/artifact/Lurb44ZPkQeJWumH17ykpZ) (shared document)
