# PRD: Settings

Status: proposed 2026-11-27 · Horizon 1 · Issue #206

## Problem

Settings is where a person decides how Commons treats them. Today it has the layout of X's web settings (category list, search, grouped rows) but little behind it: account details you cannot change, a password form, the daily digest and a theme switch. The author called it "too scanty" after the redesign.

Evidence:

- **Profile.** Nobody can change their name, username or photo after registering. Every avatar is initials.
- **Notifications.** A member of three workspaces gets every reply, review and mention from all of them in one bell, with no way to quiet a busy workspace. The vision lists "Notification preferences: per workspace and per type" as Horizon 1.
- **Security.** Sessions live only in Redis: a person cannot see where they are signed in, sign out a lost laptop, or turn on two-step sign-in. Changing a password signs out every other device, and that is the only remote sign-out.
- **Workspaces.** There is no way to leave a workspace; an owner or admin has to remove you.
- **Your data.** There is no way to download your data or close your account. A team evaluating Commons asks both.
- **Comparison.** Slack, Notion, GitHub and X all offer the above. Their settings are the bar this redesign set.

## Goals

1. A person can change everything about how they appear: name, username, photo.
2. A person controls what notifies them: by kind of event, and per workspace (everything, only what involves me, nothing), plus when the digest arrives.
3. A person can see and end every signed-in session, read a log of security events, and turn on two-step sign-in with an authenticator app.
4. A person can leave a workspace, set a default workspace and choose the page Commons opens on.
5. Appearance follows the person across devices: theme, reduced motion and density.
6. A person can download their data and close their account, with a grace period to change their mind.
7. Every setting is findable through the settings search, and every page meets the design system and WCAG 2.2 AA.

## Non-goals

- Billing, plans and organization settings (Horizon 7).
- Sign-in with Google or GitHub, passkeys and SSO (later; two-step sign-in comes first).
- Push notifications and quiet hours (they need the installable app, Horizon 3). In this project, notifications are in-app and the digest email.
- Password reset by email for people outside the email allowlist. Email to arbitrary addresses needs the sending domain (daily digest PRD); the flows here are built so they work for everyone the day the domain exists.

## Users and flows

**Flow 1: profile.** Maya opens Settings → Your account → Profile, changes her display name, crops and uploads a photo, and saves. Her photo replaces her initials in the sidebar, threads, member lists and mentions.

**Flow 2: username.** Sam changes his username. Commons checks it is free as he types, tells him that existing @mentions of the old name stay as written, and that he can change it again in 30 days.

**Flow 3: a busy workspace.** Lee is in Platform, Marketing and Hiring. In Settings → Notifications → Workspaces he sets Hiring to "Only what involves me" (mentions, replies to him, reviews he is asked for). Under "What notifies you" he turns off "New discussions" everywhere. The bell and the digest follow both choices.

**Flow 4: digest time.** Ada moves the daily digest to 08:00 in her own time zone.

**Flow 5: a lost laptop.** Kofi opens Settings → Security → Sessions, sees "Chrome on Windows · Lagos · last active 3 days ago", and signs it out. The security log records it.

**Flow 6: two-step sign-in.** Maya turns on two-step sign-in. She scans a QR code with her authenticator app, enters a code to confirm, and saves ten recovery codes. Her next sign-in asks for a code after the password. A recovery code works once.

**Flow 7: leaving.** Sam leaves Marketing from Settings → Workspaces. An owner cannot leave until ownership is transferred.

**Flow 8: start page.** Lee sets Platform as his default workspace and "Open Commons on: my default workspace".

**Flow 9: your data.** Ada downloads a file with her profile, memberships, discussions, replies, decisions she wrote, reactions and saved items.

**Flow 10: closing an account.** Kofi closes his account. He must first transfer or delete workspaces he owns. Commons signs him out everywhere and keeps the account for 30 days; signing in during that time restores it. After 30 days his account and personal data are deleted; his discussions, replies and decisions stay in their workspaces, attributed to "Former member".

## Requirements

### Profile

| ID | Requirement |
| --- | --- |
| FR-1 | A person can change their display name (1 to 60 characters, or empty to show the username). |
| FR-2 | A person can change their username, with the existing username rules, checked for availability as they type, at most once every 30 days. Old @mentions keep their text; the old username is not reserved. |
| FR-3 | A person can upload a profile photo (PNG, JPEG or WebP, up to 5 MB), crop it to a square in the browser, and remove it. The stored image is 256×256 WebP in R2; it shows wherever an avatar shows, with initials as the fallback. |

### Notifications

| ID | Requirement |
| --- | --- |
| FR-4 | "What notifies you" turns each kind of in-app notification on or off: new discussions, replies in discussions you follow, mentions, review requests, review answers, people joining by your invite link. Mentions and review requests are on by default and say so if turned off. |
| FR-5 | Each workspace has a notification level: everything (default), only what involves me (mentions, replies to you, reviews you are asked for or that answer you), or nothing. The level and the kinds above both apply. |
| FR-6 | The daily digest gets a delivery hour and time zone (default 07:00 in the browser's time zone at first save). The digest job runs hourly and sends to each person in their hour. |
| FR-7 | The digest follows the workspace levels: a workspace set to nothing is left out, as an opted-out workspace is today. |

### Security

| ID | Requirement |
| --- | --- |
| FR-8 | Every sign-in records a session: device and browser (from the user agent), an approximate place (country from Vercel's request headers), when it started and when it was last active (updated at most every 10 minutes). |
| FR-9 | Settings → Security → Sessions lists active sessions, marks the current one, and signs out one session or every other session. |
| FR-10 | A security log lists the last 90 days of sign-ins, failed sign-ins, sign-outs of other sessions, password changes, two-step changes, recovery-code use, username and email changes, and account closing, with device and place. |
| FR-11 | Two-step sign-in with an authenticator app (TOTP, RFC 6238, 30-second codes, one step of clock drift). Turning it on needs a confirming code; turning it off needs the password and a code. |
| FR-12 | Turning on two-step sign-in shows ten single-use recovery codes once; they can be regenerated with a code. A recovery code can replace a sign-in code. |
| FR-13 | With two-step on, sign-in asks for a code after the password; the password step alone gives no session. |

### Workspaces and start

| ID | Requirement |
| --- | --- |
| FR-14 | A member or admin can leave a workspace from Settings → Workspaces; an owner is told to transfer ownership first. Leaving is recorded in the workspace's activity. |
| FR-15 | A person can choose a default workspace and where Commons opens: Home, the default workspace, or the last workspace visited. |

### Appearance

| ID | Requirement |
| --- | --- |
| FR-16 | Theme (existing), reduced motion (follow the system, always reduce, never reduce) and density (comfortable or compact) are saved to the account and follow the person to every device; the page applies them before first paint. |

### Your data

| ID | Requirement |
| --- | --- |
| FR-17 | "Download your data" produces a JSON file of the person's profile, memberships, discussions, replies, decisions they created, reactions, saved items and settings. At most one export an hour. |
| FR-18 | "Close your account" needs the password (and a code with two-step on), is refused while the person owns a workspace, signs out every session and starts a 30-day grace period. Signing in during it restores the account. |
| FR-19 | After the grace period a daily job deletes the account and its personal data (sessions, preferences, photo, security log, saved items, follows). Content in workspaces stays, attributed to "Former member". |

### Email

| ID | Requirement |
| --- | --- |
| FR-20 | A person can change their email address: Commons sends a 6-digit code to the new address, valid 15 minutes, 5 attempts; the change is confirmed by the code and the password, and the old address gets a notice. Until the sending domain exists this works only for allowlisted addresses, and the page says so. |

### Throughout

| ID | Requirement |
| --- | --- |
| FR-21 | Every new setting has an entry in the settings search. |
| NFR-1 | Every page follows the design system (Canopy, global field rules) and passes the WCAG 2.2 AA audit in light and dark; each lands on the redesign canvas in light and dark. |
| NFR-2 | Changes that affect security (username, email, two-step, sessions, closing) are rate limited and recorded in the security log. Secrets (TOTP keys, recovery codes, email codes) are stored encrypted or hashed, never logged. |
| NFR-3 | Preferences are read once per request path that needs them and cached briefly; turning a notification off takes effect on the next event. |

## Subdomains affected

- **Identity and Access:** profile, username, photo, sessions, security log, two-step sign-in, email change, closing an account.
- **Notifications:** kinds and workspace levels in the fan-out and the bell; digest time.
- **Workspaces and Membership:** leaving, default workspace.
- **Platform:** preferences, export, scheduled deletion, the design system.

## Data and permissions

| Entity | Fields | Notes |
| --- | --- | --- |
| `User` (changed) | `avatarKey?`, `usernameChangedAt?`, `closedAt?`, `totpSecret?` (encrypted), `totpEnabledAt?` | `closedAt` set starts the grace period |
| `UserPreference` | `userId` (unique), `theme`, `motion`, `density`, `startPage`, `defaultWorkspaceId?`, `digestHour`, `timeZone`, `mutedKinds` (notification kinds turned off) | One row per person, created on first save |
| `WorkspaceNotificationLevel` | `userId`, `workspaceId`, `level` (`ALL`, `INVOLVED`, `NONE`) | Unique per person and workspace; absent means `ALL`; deleted with the membership |
| `UserSession` | `id` (the session id in the access token), `userId`, `userAgent`, `device`, `country?`, `createdAt`, `lastSeenAt`, `endedAt?` | Redis stays the authority for a live session; this row describes it |
| `SecurityEvent` | `id`, `userId`, `kind`, `sessionId?`, `device?`, `country?`, `createdAt` | Kept 90 days |
| `RecoveryCode` | `userId`, `codeHash`, `usedAt?` | Ten per person |
| `EmailChange` | `userId`, `newEmail`, `codeHash`, `attempts`, `expiresAt` | One open request per person |

Every setting is the person's own: only they can read or change it. No workspace role reaches another person's settings. Leaving a workspace uses the membership rules (owners cannot leave).

## Budget

- **No new paid services.** The tables live in Neon, photos and exports in R2 (a few kilobytes each), and the hourly digest runs on GitHub Actions.
- **One small library**, a QR code renderer for two-step sign-in, checked by the dependency audit. TOTP itself is 30 lines on Node's crypto.
- **Sending domain.** Email change and password reset reach everyone only once a sending domain is bought (about $12 a year, already in the budget table).

## Risks and open questions

Each question has a proposed default for the author to confirm.

- **Username changes and mentions.** Default: mentions keep their text, so an old mention of @sam no longer links once Sam renames. Rewriting stored text is invasive; GitHub and X work the same way.
- **Closing grace period.** Default: 30 days, restored by signing in. Content stays, attributed to "Former member".
- **Two-step for everyone.** Default: optional per person. A workspace setting that requires it is Horizon 7.
- **Country from headers.** Default: country only, from `x-vercel-ip-country`; no city, no stored IP address.
- **Photo moderation.** Default: none beyond file type and size checks; photos are visible to workspace members only.
- **Hourly digest.** Default: GitHub Actions hourly (24 runs a day, well inside the free minutes); the job sends nothing in hours with no recipients.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#206) | `Commons: Identity and Access: PRD for Settings` — this document; roadmap, spec map | — |
| 2 (#207) | `Commons: Identity and Access: edit your profile and username` — name, username with availability and cool-down, the Profile page, security events for username changes start in PR 6 | FR-1, FR-2, FR-21 |
| 3 (#208) | `Commons: Identity and Access: profile photos` — crop and upload to R2, `avatarKey`, avatars everywhere with initials fallback | FR-3 |
| 4 (#209) | `Commons: Platform: preferences that follow you` — `UserPreference`, appearance saved to the account (theme, motion, density) applied before paint, start page and default workspace | FR-15, FR-16 |
| 5 (#210) | `Commons: Notifications: choose what notifies you` — kinds and workspace levels in the fan-out, the bell and the digest; hourly digest with hour and time zone | FR-4 to FR-7, NFR-3 |
| 6 (#211) | `Commons: Identity and Access: sessions and the security log` — `UserSession`, `SecurityEvent`, list and sign out sessions, the log page | FR-8 to FR-10, NFR-2 |
| 7 (#212) | `Commons: Identity and Access: two-step sign-in` — TOTP, recovery codes, the sign-in challenge | FR-11 to FR-13 |
| 8 (#213) | `Commons: Workspaces and Membership: leave a workspace` — leave from Settings → Workspaces, with per-workspace notification levels shown beside each | FR-14 |
| 9 (#214) | `Commons: Identity and Access: download your data and close your account` — export, closing with grace, the daily deletion job | FR-17 to FR-19 |
| 10 (#215) | `Commons: Identity and Access: change your email` — code to the new address, notice to the old one, allowlist until the domain | FR-20 |
