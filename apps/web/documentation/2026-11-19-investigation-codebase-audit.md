# Investigation: Codebase audit

**Date:** 2026-11-19
**Scope:** the whole monorepo (`apps/web`, `packages/*`, CI, Docker, documentation) and the Vercel production project `collab-platform-web`.

## Summary

The architecture is sound: thin tRPC routers, services that own business logic, a central permission matrix, server-side membership checks on every call and tested tenant isolation. The audit found defects in sessions, repository hygiene, dependencies, production notification delivery and CI coverage. Each finding below links to the branch that addresses it.

## Findings

| # | Finding | Evidence | Severity | Addressed in |
| --- | --- | --- | --- | --- |
| 1 | Sessions ended about 15 minutes after login: the expired access-token cookie was tried first and the valid session cookie was never consulted | `getCookieToken` returned `access_token` first; the JWT expires in 15 minutes while its cookie lived 7 days | High | `feat/decision-supersession-and-hardening` |
| 2 | Logout and password changes did not revoke access tokens | Logout deleted only the Redis session | Medium | same |
| 3 | Database snapshots containing the user table were committed | `.tmp/*.dump` | High | removed from history before push; `.tmp/` ignored |
| 4 | CSRF failures returned 500 instead of 403 | `AppError` thrown inside tRPC middleware | Medium | `feat/decision-supersession-and-hardening` |
| 5 | Next.js 16.1.6 in production carried four critical advisories, including unauthenticated remote code execution | `pnpm audit --prod` | Critical | `fix/next-security-upgrade` |
| 6 | Production never delivered notifications: Vercel cannot host the BullMQ worker and no worker ran elsewhere | Vercel project settings; no worker variables | High | `feat/vercel-queue-notifications` |
| 7 | CI skipped the decision suites, the shared validators package and schema drift | `.github/workflows/ci.yml` | Medium | `ci/complete-pipeline` |
| 8 | Discussion and comment forms sent no idempotency key; registration had no rate limit; membership changes checked the owner invariant outside a transaction | Form components, `auth.router.ts`, `workspace.service.ts` | Low | `feat/decision-supersession-and-hardening` |

## Open items

- Deleting a user cascades to the workspaces they own; the owner relation should become RESTRICT so ownership must be transferred first.
- Notification fan-out still enqueues one job per member inside the request.
- Browser end-to-end tests do not exist yet.
- Remaining high advisories sit mostly in Prisma CLI tooling and await a Prisma upgrade.
