---
name: check-prod
description: Check Commons production health on Vercel — latest deployments, runtime errors, notification queue delivery failures. Use when the user says "check prod", "prod health", "production errors", "is it deployed", or "are notifications delivered".
argument-hint: "[optional context, e.g. '500 on /api/trpc around 3pm']"
---

# Check Prod

Read @docs/how-to-do-devops.md for the Vercel CLI commands and what each signal means. Default window: the last 6 hours.

## Steps

1. Show the latest production deployment and its state.
2. Fetch production runtime logs for the window; group errors by route (`/api/trpc`, `/api/queues/notifications`).
3. Search for `notification.queue.delivery_failed`, `notification.enqueue.failed` and `security.alert.threshold_exceeded` events.
4. If `$ARGUMENTS` gives context, put it at the top under **Context provided** and focus the queries on it.

## Rules

- Read only. Never redeploy, promote, roll back or change environment variables without explicit approval.
- Never print environment variable values, tokens or connection strings.

## Output

A short report: deployment state, error groups with counts and one example each, notification delivery health, and suggested next steps.
