# PRD: The new Home

Status: approved 2026-11-23 · Horizon 1 · Issue #85

## Problem

After signing in, every member lands on "Your workspaces": a directory and a create form. It answers "where can I go?" but not the questions people open a team tool with: what needs me, what changed, and what did we decide? To find out, a member opens each workspace in turn and scrolls. Mentions sit behind the notification bell, proposals waiting for a decision are found only by visiting each decision list, and nothing shows whether a workspace is busy or quiet.

Evidence:

- The vision's gate for Horizon 1 is a test team using Commons daily for a week. A first screen with nothing to act on gives no reason to come back daily.
- The owner described the current dashboard as too scanty and unimpressive.
- The data to do better already exists: unread notifications, open proposals and, since #78, a per-workspace event log.

## Goals

1. In one glance, a member sees everything waiting on them across all workspaces, most urgent first, and can act on or dismiss each item without leaving Home.
2. Each workspace shows its pulse for the last seven days, so a member sees where activity is and where decisions are piling up.
3. The decisions made across a member's workspaces this week are visible on Home, the signature of Commons.
4. A new member with no workspace is guided to create or join one, instead of seeing an empty directory.
5. "Needs you" is built as a list of item providers, so later features (decision reviews, revisit dates, open questions) add items without changing the Home.

## Non-goals

- Decision reviews, revisit dates and open questions themselves. They are separate projects that will add providers to "Needs you".
- A server-side "recently viewed" history. Home reuses the palette's per-browser recents for now.
- Email digests. They reuse the same providers later.
- Customizable or rearrangeable Home layouts.

## Users and flows

**Flow 1: morning check**

1. Maya signs in and lands on Home: "Good morning, Maya" with today's date.
2. "Needs you · 4" lists: a mention by Sam in "Pricing for small teams"; two replies to her discussion "Which queue?"; a proposal in Platform waiting 3 days for a decision (Maya is an admin there).
3. She opens the mention; it opens the discussion and the item leaves the list. She marks the two replies as done without opening them.
4. "You're all caught up" replaces the list when nothing is left.

**Flow 2: where is the work?**

1. Under "Your workspaces", each workspace is a card: name, Maya's role, last activity, and the seven-day pulse (decisions finalized, open proposals, discussions started, replies, active people) with a small daily activity chart.
2. Cards are ordered by recent activity; the busiest workspace is first.
3. Clicking a card opens that workspace's overview.

**Flow 3: what did we decide?**

1. "Decided this week" lists decisions finalized or superseded in the last seven days across Maya's workspaces, newest first, each with its workspace and who finalized it.
2. Clicking one opens the decision.

**Flow 4: first visit**

1. Ada has just registered and belongs to no workspace.
2. Home shows a short guided start: create a workspace (the existing form), or ask a teammate to add her by her username, which is shown with a copy button.
3. Once she has a workspace, Home switches to the normal layout.

## Requirements

### Needs you

| ID | Requirement |
| --- | --- |
| FR-1 | `home.needsYou` returns the items waiting on the user across all their workspaces, from these providers: unread mentions; unread replies in discussions the user started; proposals waiting for a decision in workspaces where the user can finalize (owners and admins); the user's own proposals that are still open. |
| FR-2 | Each item has a type, workspace, title, the person involved, a link target, a reason line ("Mentioned you", "Waiting 3 days for a decision") and a time. Items are ordered by urgency, then age: mentions, proposals waiting more than two days, replies, the user's own proposals. |
| FR-3 | Notification-based items can be marked done one at a time or all at once (marks the notification read). Proposal items leave the list only when the decision is finalized or deleted. |
| FR-4 | Opening a notification-based item marks it done. |
| FR-5 | The list shows at most 20 items with a total count; "Show all" reveals the rest. "You're all caught up" appears when it is empty. |
| FR-6 | Providers are separate functions behind one interface, so a new provider adds items without changing the endpoint or the Home UI. |

### Workspace pulse

| ID | Requirement |
| --- | --- |
| FR-7 | `home.pulse` returns, for each of the user's workspaces, the last seven days from the event log: decisions finalized, discussions started, replies, distinct active people, the current count of open proposals, the time of the last event, and events per day for a daily chart. |
| FR-8 | Workspace cards show the name, the user's role, last activity ("2 hours ago"), the pulse figures and a seven-day bar chart, and are ordered by last activity. |
| FR-9 | A workspace with no events in seven days says "Quiet this week" instead of a row of zeros. |

### Decided this week

| ID | Requirement |
| --- | --- |
| FR-10 | `home.recentDecisions` returns decisions finalized or superseded in the last seven days across the user's workspaces, newest first, at most 10, with workspace, question, who acted and when; deleted decisions are excluded. |
| FR-11 | Home shows them under "Decided this week", or "No decisions this week" with a link to the decision lists. |

### Layout and first run

| ID | Requirement |
| --- | --- |
| FR-12 | `/workspace` becomes Home: a greeting with the user's name and today's date, "Needs you", "Decided this week", "Your workspaces", and "Jump back in" (the palette's per-browser recents). The sidebar item is renamed "Home". |
| FR-13 | "New workspace" opens the existing create form in a dialog from Home; the palette's "New workspace" action opens it too. |
| FR-14 | A user with no workspace sees a guided start: create a workspace, or share their username (with a copy button) so a teammate can add them. |
| FR-15 | Every section has its own loading, empty and error state; one failing section does not hide the others. |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | For a user in 20 workspaces with 10,000 events each, each Home endpoint answers in under 300 ms at p95 (measured on seeded data). |
| NFR-2 | Tenant isolation: no item, figure or decision from a workspace the user does not belong to, and manager-only proposal items only where the user is an owner or admin. Covered by real-database tests. |
| NFR-3 | WCAG 2.2 AA in both themes; the daily chart has a text equivalent. |
| NFR-4 | The layout works from 360 px wide to large desktops: one column on phones, two on desktop. |
| NFR-5 | No new paid service. |

## Subdomains affected

- **Home** (new): the home service and router, and the Home page.
- **Notifications**: marking items done reuses notification read state.
- **Decision Records**: open proposals and recent decisions are read for Home.
- **Activity**: the pulse aggregates the event log.
- **Workspaces and Membership**: the create form moves into a dialog.

## Data and permissions

No new tables. Home reads existing data:

| Source | Used for |
| --- | --- |
| `Notification` (unread, type MENTION or COMMENT_CREATED, recipient = user) | Mentions and replies |
| `Decision` (status PROPOSED, not deleted) joined to `WorkspaceMember` | Proposals waiting (OWNER or ADMIN only) and the user's own open proposals |
| `ActivityEvent` (last seven days) | Pulse figures, daily series, last activity, decisions this week |

Every query joins `WorkspaceMember` on the user in the same statement. Possible index: `ActivityEvent (workspaceId, kind, createdAt)` if the pulse needs it to meet NFR-1; to be decided after measuring.

## Risks and open questions

- **Events start at the release of #78.** Pulse and "Decided this week" are empty for older activity. Decided: no backfill; data accumulates from 2026-11-23.
- **Notification types are coarse.** "Replies in discussions you started" relies on COMMENT_CREATED notifications going to the discussion author, as the fan-out does today.
- **Urgency order is a first guess.** Decided: keep FR-2's order; revisit after the test team uses it.
- **Renaming "Workspaces" to "Home"** changes a label people know. Decided: rename; the breadcrumb and the palette keep "All workspaces".

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 | `Commons: Home: list what needs the user across workspaces` — provider interface, the four providers, `home.needsYou`, mark done one or all, real-database tests | FR-1 to FR-4, FR-6, NFR-2 |
| 2 | `Commons: Home: summarize each workspace's last seven days` — `home.pulse` from the event log, measured on seeded data | FR-7, NFR-1 |
| 3 | `Commons: Home: list decisions made this week` — `home.recentDecisions` | FR-10 |
| 4 | `Commons: Home: replace the workspace directory with the new Home` — greeting, Needs you, Decided this week, Jump back in, sidebar rename, section states | FR-5, FR-11, FR-12, FR-15, NFR-3, NFR-4 |
| 5 | `Commons: Home: show workspace cards with their pulse` — cards, seven-day chart with a text equivalent, quiet state, ordering | FR-8, FR-9, NFR-3 |
| 6 | `Commons: Home: guide new members and create workspaces from a dialog` — first-run guide, username copy, create dialog from Home and the palette | FR-13, FR-14 |
