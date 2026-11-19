---
name: review-commons
description: Review a Commons pull request, diff, branch or set of files against the house rules — tenant isolation, permissions, idempotency, cache invalidation, safe errors, tests and documentation. Use for "review this PR", "review my changes", or before marking a pull request ready.
argument-hint: "[pr-number | branch | paths]"
allowed-tools: Read, Grep, Glob, Bash(gh pr diff*), Bash(gh pr view*), Bash(git diff*), Bash(git log*)
---

# Review Commons

Review the target in `$ARGUMENTS`: a pull request number (`gh pr diff <n>`), a branch (`git diff dev...<branch>`), or paths. With no argument, review `git diff dev...HEAD`.

Read [`apps/web/documentation/ARCHITECTURE-commons.md`](../../../apps/web/documentation/ARCHITECTURE-commons.md) first to place each change in its subdomain.

## Checklist

Report a finding only when the diff actually violates a rule; cite `file:line`.

1. **Tenant isolation.** Every service read and write is scoped by `workspaceId` and checked with `requireWorkspaceAction` (or the decision service's locked membership check). Foreign-tenant resources return `NOT_FOUND` where the subdomain already does so; no response reveals whether another workspace's record exists.
2. **Permissions.** Role decisions go through `server/services/workspace.permissions.ts`; no new hard-coded role strings in services. The UI may hide actions, but the server must enforce them.
3. **Validation.** Inputs come from a Zod schema in `packages/validators`; string fields are trimmed and bounded.
4. **Idempotency and concurrency.** Creates that a client may retry accept an idempotency key; multi-row changes run in one transaction; versioned records use optimistic version checks.
5. **Caching.** Every write that changes cached data invalidates the matching Redis keys (`workspace:*`, `discussion:*`, `comment:*`, `user:*:workspaces:*`); cached reads re-check membership.
6. **Errors.** Services throw `AppError`; routers wrap calls with `execute`; no internal details reach the client.
7. **Rate limits.** New mutating procedures have a `createRateLimitGuard` (or a by-key guard for unauthenticated routes).
8. **Notifications.** Enqueue failures never fail the user's write; jobs carry a stable dedupe key.
9. **Migrations.** Schema changes ship with a migration whose SQL matches `schema.prisma`; constraints Prisma cannot express are written in SQL and commented.
10. **Tests.** Behavior changes have tests in the matching suite (`server/**/*.test.mjs`, `components/**/*.test.tsx`); security rules have a negative test.
11. **Documentation.** New subdomains, environment variables or operational steps are reflected in `apps/web/documentation/` or `docs/`.

## Output

A numbered list of findings, most consequential first, each with severity (`blocker`, `should-fix`, `nit`), `file:line`, the rule broken, and a concrete fix. End with "No consequential findings" when there are none.
