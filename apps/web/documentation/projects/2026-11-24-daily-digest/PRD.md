# PRD: The daily digest email

Status: draft 2026-11-24 · Horizon 1 · Issue #134

## Problem

Commons only helps people who open it. Everything we have built so far (Needs you, review requests, decisions this week, follows) waits on a member to come and look. A member who did not open Commons yesterday does not know that a review is waiting on them or that a decision they care about was finalized, and in practice they find out in chat. That is the habit Horizon 1 is meant to replace.

Evidence:

- The Horizon 1 gate is a test team using Commons daily for a week. A daily nudge with real content is the cheapest way to make the second and third day happen.
- The vision lists the daily digest for Horizon 1: "One email a day: what changed, what needs you, decisions finalized. Unsubscribe per workspace."
- Commons sends no email today. Notifications are in-app only.

## Goals

1. Once a day, each member gets one email summarising what needs them, what was decided in the last day and what changed in their workspaces, with a link for every item.
2. No email when there is nothing to say.
3. A member can turn the digest off for one workspace or entirely, from a link in the email without signing in, or from a settings page.
4. Sending is reliable and safe: never twice for the same day, never content from a workspace the member left, and never to someone who unsubscribed.
5. It runs at $0 until a sending domain is bought, and switches on for everyone with configuration only.

## Non-goals

- Instant email for each notification. The digest is the only email for now; per-type email preferences belong to the notification preferences project.
- Choosing the send time per member. One send a day at a fixed time first (see the risks).
- Rich personalisation or ranking by an AI model (Horizon 6, smart digest).
- Marketing or product-update email.

## Users and flows

**Flow 1: the morning email**

1. At 06:00 UTC, Maya gets "Commons: 3 things need you, 2 decisions".
2. The email lists: **Needs you** (the same items as Home: a review request, a mention, a proposal waiting), **Decided yesterday** across her workspaces, and **In your workspaces** with a line per active workspace ("Platform: 4 replies, 1 new discussion").
3. Every item links to Commons. One button opens Home.

**Flow 2: nothing to say**

1. Nothing happened in Lee's workspaces and nothing needs him. He gets no email that day.

**Flow 3: turning it down**

1. Sam does not want the Marketing workspace in his digest. He clicks "Stop digests for Marketing" at the bottom of the email; a page confirms it without asking him to sign in.
2. Later, on Settings → Email, he turns Marketing back on, or turns the digest off entirely.
3. His mail app's own unsubscribe button turns the digest off entirely (one-click unsubscribe).

**Flow 4: before a domain exists**

1. Until a sending domain is configured, digests are built and logged every day but only delivered to the addresses on an allow list (the owner's own address), so the team can see real digests at $0.
2. On Settings → Email, any member can open "Preview today's digest" and see exactly what would be sent.

## Requirements

### Content

| ID | Requirement |
| --- | --- |
| FR-1 | The digest for a member contains: Needs you (the Home providers, at most 5 items with "and N more"), Decided in the last 24 hours across their workspaces, and per-workspace activity counts for the last 24 hours (discussions started, replies, decisions finalized), each with links. Workspaces with no activity are left out. |
| FR-2 | Only workspaces the member belongs to at send time, and not ones they turned off, contribute. Items from a workspace they left are never included. |
| FR-3 | No email is sent when Needs you is empty and nothing happened in the member's workspaces. |
| FR-4 | The subject summarises the content ("3 things need you, 2 decisions"). The email has an HTML part that works in common clients in light and dark mode and a plain-text part. |

### Sending

| ID | Requirement |
| --- | --- |
| FR-5 | A scheduled job runs once a day, builds each member's digest and sends it through the email provider. |
| FR-6 | Each member gets at most one digest per day: a delivery record per member and date makes retries and overlapping runs safe. |
| FR-7 | Failed sends are retried with backoff and recorded; a run reports how many were sent, skipped (empty, turned off) and failed. |
| FR-8 | Until a sending domain is configured, delivery is limited to an allow list of addresses; everyone else's digest is built and counted but not sent. |

### Preferences and unsubscribe

| ID | Requirement |
| --- | --- |
| FR-9 | The digest is on by default for every member. A member can turn it off entirely or for a single workspace. |
| FR-10 | Every email has a link to stop digests for each included workspace and one to stop them entirely. The links work without signing in (signed, expiring tokens) and show a confirmation page with a way to undo. |
| FR-11 | Emails carry `List-Unsubscribe` and `List-Unsubscribe-Post` headers so mail apps offer one-click unsubscribe. |
| FR-12 | Settings → Email shows the digest switch, per-workspace switches and "Preview today's digest". |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | Tenant isolation: a digest never contains anything from a workspace the member does not belong to; covered by real-database tests. |
| NFR-2 | Unsubscribe tokens are signed with a server secret, scoped to one member and one action, and expire after 60 days; tampered or expired tokens change nothing. |
| NFR-3 | A run for 1,000 members finishes within the scheduled function's time limit; members are processed in batches and the run can resume. |
| NFR-4 | Emails pass basic accessibility: real text (no images of text), a sensible reading order, sufficient contrast. |
| NFR-5 | $0 until the domain is bought; within the email provider's free limits at test-team scale. |

## Subdomains affected

- **Notifications**: the digest builder, sending, delivery records, preferences and unsubscribe.
- **Home**: the Needs you providers and recent decisions are reused, not duplicated.
- **Activity**: per-workspace counts come from the event log.
- **Identity and Access**: signed unsubscribe tokens; a settings page.

## Data and permissions

| Entity | Fields | Notes |
| --- | --- | --- |
| `DigestPreference` | `userId` (unique), `enabled`, `updatedAt` | Missing row means on (FR-9) |
| `DigestWorkspaceOptOut` | `userId`, `workspaceId`, `createdAt` | Unique on `(userId, workspaceId)`; deleted with the user or workspace |
| `DigestDelivery` | `userId`, `digestDate` (date), `status` (`SENT`, `SKIPPED_EMPTY`, `SKIPPED_OFF`, `HELD`, `FAILED`), `providerId`, `attempts`, `error`, timestamps | Unique on `(userId, digestDate)` for at-most-once (FR-6); `HELD` is a digest built but not sent because of the allow list (FR-8) |

| Action | Who |
| --- | --- |
| Change digest preferences, preview own digest | The member, signed in |
| Stop digests from an email link | Anyone holding a valid token for that member and action |
| Run the daily job | The scheduler only (a secret header) |

## Budget

| Item | $0 path | When it costs money |
| --- | --- | --- |
| Email provider: Resend | Free plan: about 100 emails a day, 3,000 a month | More than about 100 members receiving a digest daily: Resend Pro, about $20 a month |
| Sending domain | None: deliver only to the allow list (FR-8) | To email anyone else: a domain, about $12 a year, verified in Resend (SPF, DKIM) |
| Scheduling | Vercel cron (Hobby allows one daily run), or GitHub Actions | Never at this scale |

## Risks and open questions

Each question has a proposed default; the author confirms or changes it before work starts.

- **The sending domain (needs a decision).** Resend, like every reputable provider, only delivers to arbitrary addresses from a domain you control. Default: build and run everything now at $0 with the allow list (the owner's address), and switch on for everyone when a domain is bought and verified; no code change is needed then, only settings. The alternative is Brevo's free plan with a single verified sender address, which avoids the domain cost but lands in spam far more often.
- **Send time.** Default: 06:00 UTC for everyone (07:00 in Lagos and Central Europe). Per-member time zones come with the notification preferences project.
- **On by default.** Default: yes, with one-click unsubscribe in every email and no email on empty days. Off by default would mean almost nobody gets it.
- **Provider SDK.** Default: call Resend's HTTP API with `fetch`, behind a small adapter, so the provider can change and tests do not need a network.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 | `Commons: Notifications: PRD for the daily digest email` — this document | — |
| 2 | `Commons: Notifications: build each member's daily digest` — the digest builder from Home providers, decisions and the event log; HTML and text templates; "Preview today's digest" | FR-1 to FR-4, NFR-1, NFR-4 |
| 3 | `Commons: Notifications: send the daily digest once a day` — email adapter, scheduled run, delivery records, retries, the allow list | FR-5 to FR-8, NFR-3, NFR-5 |
| 4 | `Commons: Notifications: let members stop digests from the email or settings` — preferences, per-workspace opt-outs, signed links, one-click headers, Settings → Email | FR-9 to FR-12, NFR-2 |
