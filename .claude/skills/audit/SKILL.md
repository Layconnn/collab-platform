---
name: audit
description: Run a security and dependency audit of Commons — production dependency advisories, committed secrets, outdated framework versions and environment hygiene. Use when the user says "audit", "security sweep", "check vulnerabilities", or before a release.
---

# Audit

## Steps

1. `pnpm audit --prod --json` from the repository root. Group critical and high advisories by package and the dependency path that brings them in (direct vs transitive, runtime vs tooling).
2. For each critical or runtime-high advisory, find the lowest patched version and whether upgrading the direct dependency resolves it.
3. Check the repository for committed secrets: `git ls-files` must contain no `.env*` (except `.env.example`), no `.tmp/`, no `*.dump`; CI runs gitleaks with `.gitleaks.toml`.
4. Compare `next`, `prisma`, `@trpc/*` and `zod` with their latest releases.

## Rules

- Read only. Propose upgrades on a `fix/<name>` branch; do not change the lockfile without approval.
- Never print secret values.

## Output

A table of findings (severity, package, path, fix), followed by the proposed upgrade branches in priority order.
