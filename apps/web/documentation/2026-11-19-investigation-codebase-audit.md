# Investigation: Codebase audit

**Date:** 2026-11-19
**Scope:** the whole monorepo (`apps/web`, `packages/*`, CI, Docker, documentation) and the Vercel production project `collab-platform-web`.

## Summary

The architecture is sound: thin tRPC routers, services that own business logic, a central permission matrix, server-side membership checks on every call and tested tenant isolation. The audit found defects in sessions, repository hygiene, dependencies, production notification delivery and CI coverage. Each finding below names the pull request that addressed it.

## Findings

| # | Finding | Evidence | Severity | Addressed in |
| --- | --- | --- | --- | --- |
| 1 | Sessions ended about 15 minutes after login: the expired access-token cookie was tried first and the valid session cookie was never consulted | `getCookieToken` returned `access_token` first; the JWT expires in 15 minutes while its cookie lived 7 days | High | #18 |
| 2 | Logout and password changes did not revoke access tokens | Logout deleted only the Redis session | Medium | #18 |
| 3 | Database snapshots containing the user table were committed | `.tmp/*.dump` | High | Removed from history before push; `.tmp/` ignored (#18) |
| 4 | CSRF failures returned 500 instead of 403 | `AppError` thrown inside tRPC middleware | Medium | #18 |
| 5 | Next.js 16.1.6 in production carried four critical advisories, including unauthenticated remote code execution | `pnpm audit --prod` | Critical | #23 |
| 6 | Production never delivered notifications: Vercel cannot host the BullMQ worker and no worker ran elsewhere | Vercel project settings; no worker variables | High | #20; delivery verified in production on 2026-11-19 with a two-account mention test |
| 7 | CI skipped the decision suites, the shared validators package and schema drift | `.github/workflows/ci.yml` | Medium | #19 |
| 8 | Discussion and comment forms sent no idempotency key; registration had no rate limit; membership changes checked the owner invariant outside a transaction | Form components, `auth.router.ts`, `workspace.service.ts` | Low | #18 |

## Open items

- Deleting a user cascades to the workspaces they own; the owner relation should become RESTRICT so ownership must be transferred first.
- Notification fan-out moved out of the request: one job per event, expanded by the consumer (`fix/notification-fanout`).
- Browser end-to-end tests do not exist yet.
- Intermittent frontend test failures (keys sent before menus took focus) were fixed in #24.
- Remaining high advisories sit mostly in Prisma CLI tooling and await a Prisma upgrade.
