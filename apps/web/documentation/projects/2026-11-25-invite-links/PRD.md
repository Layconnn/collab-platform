# PRD: Invite links

Status: draft for approval · Horizon 1 · Issue #152

## Problem

Getting a team into Commons is the first thing a new workspace owner does, and today it is the hardest. A manager can only add someone who already has an account, by typing their exact username on the Members page. So the owner has to ask each teammate to register first, collect their usernames in chat, and come back to add them one by one. Most teams will stop there.

Evidence:

- The Horizon 1 gate is "a test team of 3 to 5 people uses Commons daily for a week". The team has to get in first. The guided start on Home (Home PRD, FR-13) already tells a new member to "copy your username for a teammate". That is the workaround, not the flow.
- The roadmap lists invite links for Horizon 1.
- Slack, Notion and Linear all onboard a team with a link that works whether or not the person has an account yet.

## Goals

1. A workspace owner or admin creates a link in a few seconds and shares it anywhere: chat, email, a meeting.
2. Whoever opens it sees which workspace they are joining and who invited them. They join with one click when signed in, or after signing in or creating an account, without losing the link along the way.
3. Managers stay in control: each link has a role, an expiry and an optional use limit, and can be revoked at any time.
4. A leaked or guessed link is not a way in: tokens are unguessable, stored only as hashes, rate limited, and every join is recorded.

## Non-goals

- Sending invitations by email from Commons. Email delivery to arbitrary addresses needs the sending domain (daily digest PRD); until then the link is shared by the manager. Email invites can build on these links later.
- Requests to join that a manager approves, domain-based auto-join ("anyone with @acme.com"), SSO and SCIM. Horizon 3 and later.
- Guest or read-only roles. Links grant the existing roles.

## Users and flows

**Flow 1: creating a link**

1. Maya, the owner, opens Members and clicks **Invite people**.
2. She keeps the defaults (role Member, expires in 7 days, no use limit) or changes them, optionally names the link ("Design team"), and clicks **Create link**.
3. The link appears with **Copy**. She pastes it into the team chat.

**Flow 2: a teammate without an account**

1. Lee opens the link. The page says "Maya invited you to join **Platform** on Commons", with the role, and offers **Create account** and **Sign in**.
2. He creates an account. Commons brings him straight back to the invitation, he clicks **Join Platform**, and he lands in the workspace.

**Flow 3: a teammate who is signed in**

1. Sam opens the link while signed in. He sees the same page with **Join Platform** and joins with one click.
2. If he is already a member, the page says so and links to the workspace.

**Flow 4: a link that no longer works**

1. A link that expired, was revoked or reached its use limit shows "This invite link no longer works" and suggests asking the person who shared it for a new one. It does not reveal the workspace's name.

**Flow 5: managing links**

1. On Members, Maya sees each active link: its name, role, who created it, uses ("3 of 5" or "3 joined"), and when it expires.
2. She revokes one. Opening it afterwards shows Flow 4.
3. Each member who joined by link shows "Joined by invite link" in the event log, and the creator of the link gets a notification.

## Requirements

### Creating and managing

| ID | Requirement |
| --- | --- |
| FR-1 | Owners and admins (ADD_MEMBER) create invite links with a role, an expiry (1 day, 7 days or 30 days; default 7), an optional use limit (1 to 100; default none) and an optional name of up to 60 characters. Admins can create links for the roles they may assign today (Member and Admin, not Owner); no link grants Owner. |
| FR-2 | The link's token is 32 random bytes, shown in full only in the response that creates it. The server stores only its SHA-256 hash. |
| FR-3 | Members lists active links (not expired, revoked or used up) with name, role, creator, uses and expiry, newest first. Expired and used-up links stay listed for 7 days, marked as such, then drop off the list. |
| FR-4 | Owners and admins revoke any link in their workspace. Revoking is immediate and cannot be undone. |
| FR-5 | A workspace has at most 20 active links. |

### Opening and joining

| ID | Requirement |
| --- | --- |
| FR-6 | `/join/<token>` is a public page. For a working link it shows the workspace name, the inviter's name and the role, and for a link that does not work, one generic message (FR-11). |
| FR-7 | Signed out, the page offers **Create account** and **Sign in**. Both return to the invitation afterwards: registration and sign-in accept a same-site `next` path. |
| FR-8 | Signed in, **Join <workspace>** adds the member with the link's role, counts a use, records the event, and opens the workspace. Joining checks the link again under a lock, so a link with one use left admits one person even when two click at once. |
| FR-9 | Someone already in the workspace is told so and sent to it, without using up the link or changing their role. |
| FR-10 | The link's creator is notified when someone joins with it (a new notification type). If the creator has left the workspace, nobody is. |
| FR-11 | An unknown, expired, revoked or used-up link shows "This invite link no longer works. Ask the person who shared it for a new one." and nothing about the workspace. |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | Tenant isolation and permissions are covered by real-database tests: members cannot create, list or revoke links; managers only see and revoke their own workspace's links; a token for one workspace never admits anyone to another. |
| NFR-2 | Opening and joining are rate limited per IP and per user (looking up a token: 30 a minute per IP; joining: 10 a minute per user), and failed lookups are recorded as security events. |
| NFR-3 | Tokens never appear in logs, the event log, notifications or analytics; the page's URL carries `Referrer-Policy: no-referrer`. |
| NFR-4 | The join page is accessible and works on a phone: clear headings, one primary action, focus on the result, and light and dark themes. |
| NFR-5 | $0: no new services. |

## Subdomains affected

- **Workspaces and Membership**: invite links, joining, the Members page.
- **Identity and Access**: `next` on registration and sign-in, the public join page, rate limits.
- **Notifications**: "joined with your link".
- **Activity**: joins recorded with how they happened.

## Data and permissions

| Entity | Fields | Notes |
| --- | --- | --- |
| `WorkspaceInvite` | `id`, `workspaceId`, `createdById` (nullable), `tokenHash` (unique), `role` (`MEMBER` or `ADMIN`), `name?`, `maxUses?`, `uses`, `expiresAt`, `revokedAt?`, `createdAt` | Deleted with the workspace; CHECK constraints on role, `uses <= maxUses` and `maxUses` 1 to 100 |
| `WorkspaceInviteUse` | `inviteId`, `userId`, `createdAt` | Unique on `(inviteId, userId)`; who joined with which link, for the Members list and audits |

| Action | Who |
| --- | --- |
| Create, list, revoke links | Owners and admins of the workspace |
| See an invitation | Anyone with a working link (rate limited) |
| Join | Any signed-in user with a working link |

## Budget

Nothing new: tables in the existing database, pages in the existing app.

## Risks and open questions

Each question has a proposed default for the author to confirm.

- **Showing a link again.** Default: no. Only the hash is stored, so a link is shown once, at creation, with Copy; to share it again, a manager creates a new one. The alternative, storing tokens so they can be copied any time (as Slack does), is simpler for managers but means a database leak exposes working links.
- **Who may create links.** Default: owners and admins, matching who may add members today. Letting every member invite is common in chat tools; it can be a workspace setting later.
- **Default expiry and limit.** Default: 7 days, no use limit. Long-lived unlimited links are the usual way into a workspace for strangers; 30 days is the maximum.
- **Role on a link.** Default: Member unless the manager picks Admin. Admin links are allowed but marked clearly in the list.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#152) | `Commons: Workspaces and Membership: PRD for invite links` — this document; also marks file uploads delivered in the spec map | — |
| 2 | `Commons: Workspaces and Membership: create, revoke and redeem invite links` — the two tables and migration, the service and router (create, list, revoke, describe, join), rate limits, the notification and event, real-database tests | FR-1 to FR-5, FR-8 to FR-11, NFR-1 to NFR-3 |
| 3 | `Commons: Workspaces and Membership: invite people from the Members page` — the Invite people dialog, copy once, the list with uses and expiry, revoke | FR-1, FR-3, FR-4 |
| 4 | `Commons: Identity and Access: join a workspace from an invite link` — the public join page, `next` on registration and sign-in, already-a-member and not-working states, the end-to-end journey with a second user | FR-6, FR-7, FR-9, FR-11, NFR-4 |
