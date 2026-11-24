# PRD: Markdown, reactions, follow and pin

Status: approved 2026-11-24 (defaults confirmed by the author) · Horizon 1 · Issue #117

## Problem

Conversations in Commons are plain text. A proposal cannot show a list, a table of options or a code snippet, so people paste screenshots or write around the format. Agreement takes a reply ("+1", "agreed"), which buries the replies that matter. Every new reply notifies every member of the workspace, whether or not they care about that discussion, and nobody can turn a noisy thread down. In a long thread, the reply that settled the question is as hard to find as any other, and there is no way to keep something for later.

Evidence:

- The vision lists all four for Horizon 1 under Conversations: Markdown and code blocks, reactions, follow, mute and bookmark, and pinned items. Its gate is a test team using Commons daily for a week without moving threads back to chat; chat tools have all four.
- Reply notifications fan out to all members today (`planNotificationDeliveries`, `comment_created`). With a team of five that is already most of the bell.
- Discussion, reply and decision text is rendered with `whitespace-pre-wrap` and only mentions are highlighted (`MentionText`).

## Goals

1. Discussions, replies and decision fields support Markdown, rendered safely, with a preview while writing.
2. Members react to discussions and replies with a small set of emoji and see who reacted, instead of writing "+1".
3. Reply notifications go to the people following a discussion, and anyone can mute a discussion.
4. A discussion's author or a manager pins up to three replies to the top of the discussion, such as the reply that answered the question.
5. Each member can save discussions, replies and decisions to a personal Saved list.

## Non-goals

- A rich-text or block editor (Horizon 4). Text stays Markdown typed in a textarea; the editor comes with pages.
- Converting stored content to structured documents. Content stays as written; only rendering changes.
- Custom emoji, emoji search or reactions on decisions.
- Notification preferences per workspace or by email (a separate Horizon 1 project). Follow and mute are per discussion.
- Edit history on messages (a separate Horizon 1 item).
- Pins in channels (Horizon 3) and shared workspace bookmarks.

## Users and flows

**Flow 1: writing with Markdown**

1. Sam starts a discussion "Which queue?" and writes a short list of options, a table comparing cost and limits, and a code block with a config snippet.
2. He switches to Preview to check it, then publishes. Everyone sees the list, table and code block formatted; `@maya` is still a mention.
3. Replies and a decision's outcome and rationale support the same syntax.

**Flow 2: reacting**

1. Maya agrees with Lee's reply and adds 👍 instead of replying. Two others add 👍 and one adds 👀.
2. The reply shows "👍 3 · 👀 1". Hovering or focusing 👍 shows "Maya, Kim and Lee".
3. Maya clicks 👍 again to remove hers.

**Flow 3: following and muting**

1. Sam started "Which queue?", so he follows it. Lee replies, so Lee follows it now too.
2. A new reply notifies Sam and Lee, not the other members. Anyone mentioned is notified whether or not they follow.
3. Kim, who is not following, clicks Follow to hear about new replies. Lee finds the thread noisy and clicks Mute: he stops hearing about replies but still hears when mentioned.

**Flow 4: pinning**

1. Lee's reply settles the question. Sam, the author, pins it.
2. It appears in a "Pinned" strip at the top of the discussion with a link to its place in the thread, and the pin is recorded in the activity log.
3. An admin can unpin it later; up to three replies can be pinned at once.

**Flow 5: saving for later**

1. Maya saves Lee's reply and the decision it led to.
2. "Saved" in the sidebar and in Ctrl K lists them, newest first, across her workspaces. She removes one when she is done.

## Requirements

### Markdown

| ID | Requirement |
| --- | --- |
| FR-1 | Discussion bodies, replies, review notes and decision outcome, rationale, alternatives and follow-up render GitHub-flavoured Markdown: paragraphs, emphasis, headings (shown at most at the size of a section heading), lists and task lists (read only), links, block quotes, inline code, fenced code blocks with syntax highlighting, tables and strikethrough. |
| FR-2 | Rendering is safe: raw HTML is not rendered, links allow only `http`, `https` and `mailto` and open with `rel="noopener noreferrer nofollow ugc"`, and images are not loaded from Markdown in this project. |
| FR-3 | `@username` mentions keep working and keep their styling inside Markdown, but not inside code. |
| FR-4 | Every composer and edit form has Write and Preview, and a short "Markdown supported" help with the common syntax. |
| FR-5 | Existing content keeps its line breaks: a single newline still shows as a line break. |

### Reactions

| ID | Requirement |
| --- | --- |
| FR-6 | Members react to discussions and replies with one of eight emoji (👍 ❤️ 🎉 😄 🤔 👀 🚀 ✅); clicking a reaction toggles the member's own. |
| FR-7 | Each item shows its reactions with counts, the viewer's own highlighted, and who reacted on hover and focus (names, then "and N others"). |
| FR-8 | Reactions load with the discussion and its replies without one request per item, and update immediately for the person reacting. |

### Follow and mute

| ID | Requirement |
| --- | --- |
| FR-9 | A member follows a discussion automatically when they start it or reply to it, and can follow or unfollow it explicitly. |
| FR-10 | New replies notify the discussion's followers instead of every member. Mentions notify the mentioned member whether or not they follow. New discussions still notify every member. |
| FR-11 | A member can mute a discussion: no reply notifications, and replying does not follow it again; mentions still notify. Unmuting restores following. |
| FR-12 | The discussion page shows Follow, Following or Muted with a short explanation, and existing discussions start with their author and repliers as followers. |

### Pins

| ID | Requirement |
| --- | --- |
| FR-13 | The discussion's author or an owner or admin pins or unpins a reply; at most three replies are pinned per discussion. |
| FR-14 | Pinned replies appear at the top of the discussion with their author, an excerpt and a link to their place in the thread, and are marked in the thread. Pins and unpins are recorded in the event log. |
| FR-15 | Deleting a pinned reply removes its pin. |

### Saved

| ID | Requirement |
| --- | --- |
| FR-16 | A member saves or unsaves a discussion, reply or decision; saved items are private to them. |
| FR-17 | A Saved page lists the member's saved items across workspaces, newest first, with type, title or excerpt, workspace and a link; items they can no longer open (left the workspace, deleted) are shown as unavailable or hidden. |
| FR-18 | Saved is reachable from the sidebar and from Ctrl K. |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | Security: Markdown rendering has tests for script injection, `javascript:` links, raw HTML and event-handler attributes. |
| NFR-2 | Tenant isolation: reactions, follows, pins and saved items only for members of the item's workspace, checked in the same query; covered by real-database tests. |
| NFR-3 | Performance: the Markdown renderer adds at most 60 kB gzipped to discussion pages; syntax highlighting loads only when a code block is present. |
| NFR-4 | WCAG 2.2 AA in both themes: reactions are buttons with names ("👍 3, you reacted"), state is not shown by color alone, and rendered Markdown keeps a sensible heading order. |
| NFR-5 | Idempotent toggles: double clicks and retries leave one reaction, one follow, one pin and one saved item. |
| NFR-6 | No new paid service. |

## Subdomains affected

- **Discussions** and **Threaded Comments**: Markdown rendering and composers, reactions, follow state, pinned replies.
- **Decision Records**: Markdown in decision fields and review notes; saving decisions.
- **Notifications**: reply fan-out to followers instead of all members.
- **Activity**: pin and unpin events.
- **Home** and the **command palette**: Saved.
- **Design System**: Markdown typography in both themes.

## Data and permissions

| Entity | Fields | Notes |
| --- | --- | --- |
| `Reaction` | `workspaceId`, `subjectType` (`DISCUSSION` or `COMMENT`), `subjectId`, `userId`, `emoji`, `createdAt` | Unique on `(subjectType, subjectId, userId, emoji)`; indexed on `(workspaceId, subjectType, subjectId)` |
| `DiscussionFollow` | `workspaceId`, `discussionId`, `userId`, `state` (`FOLLOWING` or `MUTED`), timestamps | Unique on `(discussionId, userId)`; composite reference to `Discussion (workspaceId, id)`; backfilled from discussion authors and comment authors |
| `Comment` | gains `pinnedAt`, `pinnedById` | A partial index on pinned comments per discussion |
| `SavedItem` | `userId`, `workspaceId`, `subjectType` (`DISCUSSION`, `COMMENT`, `DECISION`), `subjectId`, `createdAt` | Unique on `(userId, subjectType, subjectId)` |
| `ActivityKind` | gains `COMMENT_PINNED`, `COMMENT_UNPINNED` | |

Emoji are validated against the fixed set on the server. Each feature adds a small additive migration; a release applies them together.

| Action | Who |
| --- | --- |
| React, follow, mute, save | Any member of the workspace, for themselves only |
| Pin and unpin a reply | The discussion's author, or an owner or admin |
| See reactions and pins | Every member of the workspace |
| See saved items | Only the member who saved them |

## Risks and open questions

Each question had a proposed default; the author confirmed all of them on 2026-11-24.

- **Changing who hears about replies.** Decided: followers only (FR-10), with authors and repliers following automatically and existing threads backfilled. Members who were relying on hearing about every reply will hear less; following is one click.
- **Existing text that looks like Markdown.** A line starting with `#` or `-`, or words wrapped in `*`, will now be formatted. Decided: accept it; content stays as written and single newlines are kept (FR-5), so most text looks the same.
- **Library and bundle size.** Decided: `react-markdown` with `remark-gfm`, `remark-breaks` and `rehype-sanitize`, and a highlighter loaded on demand; checked against NFR-3 in the first pull request.
- **Search snippets** show raw Markdown syntax (`**`, `#`). Decided: accept for now; stripping syntax from snippets is a small follow-up.
- **Reaction set.** Decided: the eight emoji in FR-6; a picker with more comes later if people ask.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#117) | `Commons: Discussions: PRD for Markdown, reactions, follow and pin` — this document | — |
| 2 (#119) | `Commons: Discussions: render Markdown in discussions, replies and decisions` — safe renderer, mentions, code highlighting on demand, Write and Preview in every composer | FR-1 to FR-5, NFR-1, NFR-3 |
| 3 (#120) | `Commons: Discussions: react to discussions and replies` — `Reaction`, toggle API, loading with the thread, reaction bar | FR-6 to FR-8, NFR-2, NFR-4, NFR-5 |
| 4 (#121) | `Commons: Notifications: notify followers of replies and let members mute` — `DiscussionFollow` with backfill, automatic follows, fan-out change, Follow and Mute controls | FR-9 to FR-12, NFR-2 |
| 5 (#122) | `Commons: Threaded Comments: pin replies to the top of a discussion` — pin fields, API, pinned strip, events | FR-13 to FR-15 |
| 6 (#123) | `Commons: Home: save discussions, replies and decisions for later` — `SavedItem`, save controls, Saved page, sidebar and Ctrl K | FR-16 to FR-18 |
