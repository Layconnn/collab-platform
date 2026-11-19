# Commons — Project Handoff for Codex

**Prepared:** 2026-10-20. **Purpose:** Reconstruct key decisions from an extended ChatGPT planning/review conversation. This is not a verbatim transcript and is not proof that every feature works in production. **Source of truth:** inspect the actual current repository, tests, and versioned docs before changing code.

## 1. Vision and immediate direction
Commons is a TypeScript full-stack, multi-tenant collaboration platform. Its current foundation comprises workspaces, memberships, discussions, nested comments/replies, mentions, notifications, and role-based actions. The user completed a substantial UI/UX phase and wants a distinctive product, not merely a well-designed CRUD demo.

**Proposed differentiated direction, NOT YET IMPLEMENTED:** a decision-and-context platform for small technical teams, open-source maintainers, and communities: capture decisions arising from discussions, preserve the rationale and alternatives, link outcomes to the original conversation, resurface unresolved questions, and let newcomers catch up without rereading entire threads. Validate this proposition with users; do not claim unique market advantage before testing it.

The user wants to publicly document engineering milestones on LinkedIn, showcase genuine mistakes and lessons, and initially target roughly 5,000–10,000 users. This is a *capacity ambition*, not measured load-test throughput, demand, or achieved adoption. The larger 10k–100k architecture ambition in PROJECT_CONTEXT is also unverified.

## 2. Confirmed architecture and conventions
- TypeScript monorepo, Next.js App Router; tRPC routers stay thin, domain service layer owns business logic, shared Zod validation, Prisma/PostgreSQL.
- React Query owns server state; Zustand owns UI-only state; URL owns active-workspace identity. React Hook Form for forms.
- Redis for sessions/cache as implemented; BullMQ for async notifications; cursor pagination as applicable.
- Backend enforces all authentication, multi-tenant membership, and RBAC. Hiding a button is not authorization.
- Tailwind CSS v4 + Chakra UI v3 coexist with Chakra **`preflight: false`**; Tailwind owns the global reset. Re-enabling Chakra preflight previously broke layout and typography.
- Design tokens in `apps/web/styles/globals.css`; canonical `--brand-primary: #192D20`, with distinct semantic action tokens for light/dark mode. Light actions can use forest with white; dark actions use accessible mint with forest foreground. Supporting cream `#EEE5D2`, restrained coral `#CD6055`, paper `#F7F7F2`. Cormorant Garamond display serif, Geist product sans, Geist Mono accents. Light/Dark/System preference persists and has pre-paint initialization.
- Marketing may be expressive/editorial; authenticated workspaces remain information-dense and calmer. Motion is modest, accessible, reduced-motion aware; hero uses server-rendered text and CSS reveal.

## 3. UI implementation history — milestones, not a substitute for git history
Prompts approximately 22–24 established shared tokens, shell, landing page, and fixed the Tailwind/Chakra reset conflict. 25: auth split-screen; 26: workspace home; 27: discussion index and inline creation; 28: threaded comments, nested reply interactions; 29: notification popover and authorization fixes; 29.1–29.4: notification worker troubleshooting, mentions, auto-complete, edit-triggered notifications and two-account testing during development. 30: workspace directory/members and username-based exact-match member addition; 31: loading/empty/error/retry states; 31.1: Windows Next.js 16.1.6 Turbopack dev 404 for nested dynamic routes, resolved locally with `next dev --webpack`; 32: responsive handling; 33–33.1: editorial colors, Light/Dark/System toggle and provider; 34: marketing/auth typography and motion, product storytelling; 34.1: canonical primary changed to `#192D20`; 35: keyboard/focus/contrast/accessibility corrections; 36: provider boundary optimization and visual consistency audit; 37: adversarial UX fixes.

Specific Prompt 37 outcomes: revoked workspace no longer remains in cached visible shell navigation; viewer role returned authoritatively from authorized `workspace.getById` rather than relying on paginated workspace list; failed sign-out now reports an error and guards duplicate in-flight submissions. Latest Codex report: 163/163 frontend tests and 49 integration/security tests passed, build/typechecks passed; eight existing backend lint warnings. User reports committed and pushed first phase; do not infer hosted beta readiness.

## 4. Important technical lessons and risks
- **Local database split:** verified populated Windows PostgreSQL, localhost port 5433 (IPv6 loopback), differs from EMPTY Docker PostgreSQL service. A Docker notification worker querying the empty instance dropped jobs. Verified local combination: Windows PostgreSQL + Docker Redis + `RUN_WORKER_IN_API=1`, with Docker postgres and notification-worker stopped. Commands documented in `docs/DEVELOPMENT.md` (use latest version; older docs differ). This embedded worker is dev-only, not a production scalability design.
- `next dev --webpack` is an intentional workaround for a Windows/Turbopack nested-route 404 in Next.js 16.1.6, not evidence production routes are absent. Revisit only after verifying updated runtime behavior.
- Mention suggestions are bounded, member-scoped and keyboard/touch usable; mentions in comments and edits notify authorized active workspace members; existing mention identities must not be trivially re-notified. Observe limits on parsing and queue retries.
- Notification enqueue after DB write remains best effort. If Redis enqueue fails after successful post, notification can be lost. A transactional outbox may be considered later if requirements warrant it; do not promise guaranteed delivery.
- Previously cached data after membership revocation can disclose metadata if not hidden promptly; maintain backend resource authorization and frontend cache hygiene.
- A Promise, unit test, typecheck, lint and build are not browser validation. Pending: manual responsive/200% zoom/a11y, actual two-account mention journey after latest changes, light/dark screenshots, real Web Vitals and performance testing. One prompt measured public JS references falling from 947,450 to 843,994 raw bytes; later build referenced 947,654 bytes again. These are raw reference totals, not page-load measurements; investigate under controlled conditions, do not claim sustained speed gain.
- Some test runs intermittently timed out under Windows worker contention; reruns with fewer Vitest workers passed. Watch for underlying flakiness without automatically blaming the environment.
- Current public pages are `/`, `/login`, and `/register`; no fake Features/About/Pricing links/pages. Marketing architecture allows meaningful future pages only.
- `docs/FRONTEND_CONTEXT.md` was reported Git-ignored; confirm whether version control should be changed; brand rules are versioned in `docs/DESIGN_SYSTEM.md`.

## 5. Working process / expectations from Codex
1. Read `AGENTS.md` and context docs. Verify repository reality; distinguish implemented, reported, tested, visually observed, and proposed.
2. For every new feature, start with a brief solution design and tradeoffs. Restrict scope; avoid speculative microservices/frameworks and schema changes. Keep the modular monolith.
3. Implement end-to-end, with migrations, Zod, service, typed tRPC, indexes, RBAC, caching invalidation and tests only as needed.
4. Protect multi-tenant boundaries, rate limits, retry/idempotency as needed; retain notification caveats.
5. Run typecheck, lint, relevant security/integration/frontend tests and production build; if no browser, explicitly request manual verification.
6. Report concrete files, limitations and next steps. One prompt at a time; stop for review, then commit. Do NOT start the next planned phase automatically.

## 6. Upcoming product hypothesis — NOT a promised implemented feature
**Decision records attached to discussions** is the first candidate flagship workflow. Team members could convert a thread into a structured decision (question, chosen outcome, rationale, alternatives, status, owner optional), link it to source discussion, and revisit/reopen it. A workspace-level decision index could make this discoverable. This is *suggested product design*, not verified user demand.

**One-week intent (2026-10-20 onward):** user wants substantial, differentiated features plus daily public build posts. Rather than implement Notion and GitHub clones in seven days, ship one complete vertical slice: decisions linked to discussions, decision index/filtering, and one additional useful workflow (e.g. unresolved questions or weekly digest) only if the slice and tests are stable. Validate with 3–5 potential early users. Avoid copying competing-product features merely for breadth.

## 7. Primary repository documents to read
- `docs/PROJECT_CONTEXT.md`
- `docs/FRONTEND_CONTEXT.md` (currently possibly ignored)
- `docs/DESIGN_SYSTEM.md`
- `docs/DEVELOPMENT.md` (current verified version)
- `docs/CODEX_PROMPT_FRAMEWORK.md`
- `docs/MARKETING_ARCHITECTURE.md`
- `docs/COMMONS_CODEX_UI_PROMPTS_25_TO_37.md` (historical phase plan)
- this file

If any listed doc is missing in git, do not invent its contents; ask for a copy or check a trusted local file.
