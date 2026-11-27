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

## Notification delivery alert

Vercel Queues has no queue-depth API, so Commons tracks its own backlog (`server/queue/notification.backlog.ts`): every published notification job is added to the Redis sorted set `notifications:pending` with its publish time, and removed when it is delivered or given up on after the last attempt.

- `GET /api/health/notifications` returns `{ status, pending, oldestPendingSeconds }`: 200 with `ok`, or 503 when the oldest job has waited more than 5 minutes (`delayed`) or Redis cannot be read (`unknown`). It carries no user data.
- `.github/workflows/notification-health.yml` calls it every 15 minutes. A failed run is the alert: GitHub emails the owner about failed scheduled runs. Run it by hand from the Actions tab to check on demand.
- Each delivery logs `notification.queue.delivered` with `waitedMs`, the time between publish and delivery.
- When it fires: check the consumer's function logs on Vercel for `notification.queue.delivery_failed`, then the Vercel Queues dashboard for the `notification-delivery` topic. Entries older than 24 hours are dropped from the set, so a lost message stops alerting after a day.

## Daily digest email

The digest ([PRD](../apps/web/documentation/projects/2026-11-24-daily-digest/PRD.md)) is sent by `.github/workflows/daily-digest.yml`, which runs every hour and calls `POST /api/digest/run` until it answers `done: true`. Each run takes the members whose chosen hour it is in their own time zone (Settings → Notifications → Daily digest; 06:00 UTC for anyone who never chose). The app records one `DigestDelivery` row per member and day of their own calendar, so re-running the workflow never sends twice.

| Setting | Where | Purpose |
| --- | --- | --- |
| `DIGEST_RUN_SECRET` | GitHub Actions secret **and** Vercel (Production), same value, 32+ characters | Lets the workflow start a run; without it the workflow exits with a notice and nothing is sent |
| `RESEND_API_KEY` | Vercel (Production) | Sending; without it every digest is recorded as `HELD` |
| `DIGEST_FROM` | Vercel (Production), optional | Sender, e.g. `Commons <digest@your-domain>`; defaults to Resend's test sender |
| `DIGEST_DELIVERY` | Vercel (Production), optional | `allowlist` (default) or `all` once a domain is verified in Resend |
| `DIGEST_ALLOWLIST` | Vercel (Production) | Comma-separated addresses that receive digests while `DIGEST_DELIVERY=allowlist` |

Never print these values. To check a day's run, read the workflow log (counts of sent, skipped, held and failed per call) or query `DigestDelivery` by `digestDate` and `status` through the migration workflow's database access. `HELD` rows are expected until `DIGEST_DELIVERY=all`; `FAILED` rows carry the provider's error and are retried up to three times.

Switching on for everyone: buy a domain, verify it in Resend (SPF and DKIM), set `DIGEST_FROM` to an address on it, then set `DIGEST_DELIVERY=all` and redeploy. No code change.

## File uploads (Cloudflare R2)

Attachments ([PRD](../apps/web/documentation/projects/2026-11-25-file-uploads/PRD.md)) live in a private R2 bucket. The browser uploads straight to R2 with a signed URL valid for 10 minutes; downloads go through `GET /api/files/<id>`, which checks membership and redirects to a signed URL valid for 5 minutes. Without all four R2 settings, attaching is switched off and the app behaves as before.

| Setting | Where | Purpose |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | Vercel (Production) | The Cloudflare account id (R2 overview page, right-hand side) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Vercel (Production) | An R2 API token with **Object Read & Write** on this bucket only |
| `R2_BUCKET` | Vercel (Production) | The bucket name, e.g. `commons-files` |

One-time setup in Cloudflare:

1. **R2 → Create bucket**, e.g. `commons-files`, location automatic. Leave public access **off**.
2. Bucket **Settings → CORS policy**, so browsers may upload from the app:
   ```json
   [{ "AllowedOrigins": ["https://collab-platform-web.vercel.app"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
3. **R2 → Manage API tokens → Create API token**: permission *Object Read & Write*, applied to this bucket only. Copy the access key id and secret into Vercel; they are shown once.
4. Redeploy.

Clean-up: `.github/workflows/files-cleanup.yml` runs at 06:30 UTC with the same `DIGEST_RUN_SECRET` and calls `POST /api/files/cleanup` until `done: true`. Deleting an attachment row (removed from its post, or its post or workspace deleted) queues its key in `DeletedFile` through a database trigger; the job deletes those objects and any upload not attached within 24 hours. A key that fails to delete stays queued for the next run.

Locally and in the end-to-end job, `FILES_LOCAL_DIR=<folder>` keeps files in a folder instead, served by `app/api/files/local` with signed, expiring URLs like R2's; it is ignored on Vercel.

Limits (`packages/validators/src/files.ts`): 10 MB per file, 10 files per post, 1 GB per workspace. R2's free plan covers 10 GB stored, 1 million writes and 10 million reads a month, with free downloads.

## Two-step sign-in

Authenticator secrets are stored encrypted (AES-256-GCM) in `User.totpSecret`. The key comes from `TOTP_ENCRYPTION_KEY` (32+ characters) or, when it is unset, is derived from `JWT_SECRET`. Rotating `JWT_SECRET` without `TOTP_ENCRYPTION_KEY` set makes every stored secret unreadable, and people with two-step on could then only sign in with a recovery code. Before rotating `JWT_SECRET`, set `TOTP_ENCRYPTION_KEY` to its current value: the derived key stays the same. Recovery codes are kept only as SHA-256 hashes; sign-in challenges live in Redis (`auth:2fa-challenge:*`, five minutes, five codes).

## Changing an email address

Settings → Your account → Email sends a 6-digit code to the new address through the same Resend sender as the digest (`RESEND_API_KEY`, `DIGEST_FROM`). Codes are kept in Redis as a hash for 15 minutes (`auth:email-change:<userId>`, 5 attempts). While `DIGEST_DELIVERY=allowlist`, codes and the notice to the old address only go to addresses in `DIGEST_ALLOWLIST`, and the page says so; without `RESEND_API_KEY` changing email is switched off. Switching `DIGEST_DELIVERY` to `all` once the sending domain is verified opens it to everyone.

## Closed accounts and erasure

Closing an account (Settings → Your account → Your data) sets `User.closedAt`, ends every session and starts a 30-day grace period; signing in during it clears `closedAt`. Closed accounts get no digest email.

`.github/workflows/account-erasure.yml` runs at 04:15 UTC with `DIGEST_RUN_SECRET` and calls `POST /api/accounts/erase` until `done: true`. For each account closed more than 30 days ago it keeps the `User` row (discussions, replies and decisions reference it) but replaces the email, username and name ("Former member"), clears the password, photo and authenticator secret, sets `erasedAt`, removes memberships (recorded as leaving), and deletes sessions, the security log, preferences, saved items, follows, recovery codes, notifications and digest rows. Names copied next to content (decision, review, revision and activity labels) are rewritten to "Former member", and the photo is deleted from R2. An account that owns a workspace again is skipped and listed in the run's warning; transfer that workspace by hand. Erasing is idempotent.

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
