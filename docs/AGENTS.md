# Commons — Instructions for Codex

Before planning code changes, read `docs/COMMONS_PROJECT_HANDOFF.md` and, where available, `docs/PROJECT_CONTEXT.md`, `docs/FRONTEND_CONTEXT.md`, `docs/DESIGN_SYSTEM.md`, `docs/DEVELOPMENT.md`, `docs/CODEX_PROMPT_FRAMEWORK.md`, and `docs/MARKETING_ARCHITECTURE.md`.

**Repository source code and tests are authoritative.** The handoff is a summary of earlier discussions, not a claim that pending features exist or have passed live acceptance.

## Boundaries
- Next.js App Router + TypeScript monorepo, tRPC thin routers/services, Prisma/PostgreSQL, shared Zod validators, Redis, BullMQ.
- React Query = server state. Zustand = UI-only state. URL = active workspace. React Hook Form + Zod for forms.
- Preserve tenant isolation, server-side RBAC, safe errors, scoped queries, validation and tested idempotency.
- Tailwind v4 handles reset; Chakra v3 uses `preflight: false`. Preserve theme architecture and `#192D20` canonical brand with accessible theme-aware action variants.
- Do not reintroduce development Turbopack until the Windows nested-route problem has been checked; local `next dev --webpack` is deliberate.
- Do not run Docker PostgreSQL or separate Docker notification-worker against the populated Windows dev database; follow current `docs/DEVELOPMENT.md`.
- Do not claim scale, production readiness, guaranteed notification delivery, visual acceptance, or market demand without verification.
- Do not install frameworks, build microservices, change auth/session architecture, or perform destructive database operations without approval.

## Every feature task
1. Examine existing code and tests; briefly summarize design/tradeoffs and exact files affected.
2. Confirm current requirements and boundaries. Make the smallest complete, useful vertical slice.
3. Implement safe auth/RBAC, typed validation, state/error/loading/accessibility, and focused tests.
4. Verify typecheck, lint, tests/build; distinguish tested from untested browser/live operations.
5. Explain migration/rollout risks, note unresolved issues, and stop. Never auto-start another phase.

**Upcoming direction (proposal, not shipped):** position Commons around durable team decisions and the context behind them. Begin with a decision record linked to a discussion and a workspace decision index; validate value before adding broad Notion/GitHub-style capabilities.
