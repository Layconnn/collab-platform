---
name: ci-workflow
description: Read and diagnose GitHub Actions CI for Commons — which job failed, why, and how to reproduce it locally. Use when checks fail on a pull request or the user asks about CI.
argument-hint: "[pr-number | run-id]"
allowed-tools: Bash(gh run*), Bash(gh pr checks*), Bash(gh pr view*), Read, Grep
---

# CI Workflow

The pipeline is `.github/workflows/ci.yml`; its jobs are described in `docs/DEVELOPMENT.md` § Continuous Integration.

## Steps

1. `gh pr checks <pr>` (or `gh run list --branch <branch> --limit 5`) to find the failing run.
2. `gh run view <run-id> --log-failed` and locate the first failing step.
3. Map it to the local command:

| CI step | Local command |
|---|---|
| Lint / typecheck | `pnpm -C apps/web run lint`, `pnpm -C apps/web run check-types`, same for `packages/validators` |
| Schema drift | `pnpm -C apps/web exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` |
| Backend suites | `pnpm -C apps/web run test:<suite>` |
| Decision suites | see `docs/DEVELOPMENT.md` (needs a `_decision_test` database) |
| Frontend | `pnpm -C apps/web run test:frontend` |
| Build | `pnpm -C apps/web run build` |
| Security | `pnpm audit --prod --audit-level=critical` |

4. Explain the root cause and propose a fix; commit only with approval.
