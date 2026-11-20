# How to Do DevOps

Commons runs on Vercel (project `collab-platform-web`, root directory `apps/web`, Node 24). Production deploys from `main`; every pushed branch gets a preview deployment.

## Setup

```bash
npx vercel login                                   # once per machine
cd apps/web && npx vercel link --yes --project collab-platform-web
```

Linking writes `apps/web/.vercel/` and `apps/web/.env.local` (an expiring OIDC token for Vercel Queues); both are git-ignored.

## Read-only commands

| Question | Command |
|---|---|
| Latest deployments and their state | `npx vercel ls collab-platform-web` |
| Build output of one deployment | `npx vercel inspect <deployment-url> --logs` |
| Production errors in the last 6 hours | `npx vercel logs --since 6h --query "level:error AND environment:production"` |
| Logs for one request | `npx vercel logs --since 1h --query "requestId:<id>"` |
| JSON for scripting | add `--json` |
| Environment variable names | `npx vercel env ls` (names only; never pull or print values in shared output) |

## Signals to look for

| Event in logs | Meaning |
|---|---|
| `notification.queue.delivery_failed` | The Vercel Queue consumer threw; it retries with backoff and gives up after six deliveries. |
| `notification.enqueue.failed` | A write succeeded but its notification job was not published (best effort, no outbox). |
| `notification.operation` with `drop_non_member` | The recipient left the workspace before delivery; expected. |
| `security.alert.threshold_exceeded` | Repeated auth failures, permission denials or rate-limit hits for one user or route. |
| `security.metrics.failure` | Redis was unreachable for metrics; requests still succeed. |

## Production database migrations

Migrations reach production through `.github/workflows/migrate-production.yml`, never from a laptop.

- It runs when a push to `main` changes `apps/web/prisma/migrations/**`, or by hand from the Actions tab ("Run workflow").
- The job uses the `production-migrations` GitHub environment. That environment holds the `PRODUCTION_DATABASE_URL` secret (Neon direct connection, not pooled) and requires the repository owner to approve each run.
- It prints `prisma migrate status`, applies pending migrations with `prisma migrate deploy`, then prints the status again.
- Vercel deploys `main` independently and may go live before the migration is approved. Write migrations that the currently deployed code tolerates (add first, remove in a later release), so either order is safe.
- Check a run with `gh run list --workflow migrate-production.yml` and `gh run view <id> --log`.
- Do not apply migrations to production from a local shell, and do not move the secret into Vercel's build: Preview deployments share the production database until Preview has its own Neon branch.

## Changes that need approval

Redeploying, promoting, rolling back, and adding or removing environment variables change production. Propose them; do not run them without the author's explicit go-ahead.
