# Roadmap: Commons

## Milestones and projects

| Phase | Goal | Projects | Gate to the next phase |
| --- | --- | --- | --- |
| 0. Stabilize | Make what exists correct and safe | Session refresh and revocation, CSRF status, idempotent creates, transactional membership changes, Next.js security upgrade, Vercel Queue notifications, complete CI | Sessions last a full day; all suites, including the decision suites, pass in CI; production delivers notifications |
| 1. Daily-use basics | Make Commons usable every day | Search and a Cmd-K palette, Markdown and reactions, real-time updates instead of polling, email digests, file uploads, a Yjs-ready editor (Tiptap) | A test team uses Commons daily for a week without moving threads back to chat |
| 2. The signature | Make decisions the reason to use Commons | Decision reviews (approvals before finalizing), open questions, catch-me-up briefs, revisit dates, the decision timeline, GitHub pull-request links | 3–5 small software teams record real decisions and return to read them |
| 3. The document layer | Write the specs that produce decisions | Block-editor pages, templates (RFC, ADR), backlinks, table and board views, then collaborative editing on a self-hosted Hocuspocus server | Teams write proposals in Commons instead of an external editor |
| 4. The work layer | Turn decisions into tracked work | Issues created from decision follow-ups, boards, deeper GitHub sync, ADR export, an API | Follow-up work is tracked in Commons and links back to its decision |

## Brand

- An official Commons logo at an enterprise, top-tier standard: a mark and wordmark that work from a 16px favicon to a landing-page hero, in light and dark themes, built on the Commons palette (forest `#192D20`, cream `#EEE5D2`, coral `#CD6055`, mint `#9FD3B4`). Delivered as SVG with usage rules, then applied to the app, the landing page, the README and social cards.

## Beyond the current milestone

- Move notification delivery to a dedicated worker (Railway) once budget allows; Vercel Queues stays as the fallback.
- A transactional outbox if notification delivery needs a guarantee.
- Invite links and guest access for contributors outside the team.
