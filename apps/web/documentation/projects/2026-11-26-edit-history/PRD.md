# PRD: Edit history on messages

Status: proposed 2026-11-26 · Horizon 1 · Issue #199

## Problem

Commons is meant to be the record of how a team reasoned. Today a discussion's context or a reply can be edited and the earlier wording is gone. A reply that said "B is fine, but only if we drop the favicon" can be edited to "B is fine" after a decision was made on it, and nobody can tell.

Evidence:

- The Commons vision lists "Edit history on messages" in Horizon 1: "Every edit kept and viewable, so the record stays honest."
- Decisions already keep every revision (decision records). Discussions and replies, where the reasoning happens, do not.
- The "Edited" label on replies today is a guess: it shows whenever a reply's `updatedAt` moved, and pinning a reply moves it. Pinned replies are labelled "Edited" without anyone editing them.

## Goals

1. Every edit to a discussion's title or context, or to a reply, keeps the version it replaced.
2. Anyone who can read the discussion can open the history from the "Edited" label and see each version, who made it and when, with what changed from the version before.
3. "Edited" appears only after a real edit.
4. Nothing slows down: writing a revision is one extra row in the edit's own transaction; reading history is a separate, rate-limited request.

## Non-goals

- Restoring an earlier version. Members can copy from the history; a restore button can come later.
- Removing a version from history (redaction). See Risks.
- History for decisions (already kept) and for files' contents (only file names are kept, as for decisions).
- Edit history for pages (Horizon 4); the same pattern will apply.

## Users and flows

**Flow 1: reading a reply's history**

1. Maya sees "Edited" next to Sam's reply.
2. She opens it. A dialog lists the versions, newest first: "Current", then "Edited by Sam · 2 hours ago" and so on, each with its text and file names.
3. Each older version shows what the next edit changed: removed words struck through, added words highlighted.

**Flow 2: a discussion's history**

1. On a discussion whose title or context was edited, the meta line shows "Edited 26 Nov". It opens the same dialog, with the title and context of each version.

**Flow 3: deleting**

1. When a reply or discussion is deleted, its history is deleted with it, as its replies are today.

## Requirements

| ID | Requirement |
| --- | --- |
| FR-1 | Editing a discussion stores the replaced title, context and file names as a revision, with its version number, the editor and the time, in the same transaction as the edit. An edit that changes nothing stores nothing. |
| FR-2 | Editing a reply stores the replaced text and file names the same way. |
| FR-3 | Discussions and replies return how many times they were edited; "Edited" shows only when that is more than zero. |
| FR-4 | `discussion.history` and `comment.history` return every version, newest first, starting with the current one: version number, title (discussions), text, file names, editor label and time. |
| FR-5 | History is readable by anyone who can read the discussion, and by no one else; a reply's history follows its discussion's workspace. |
| FR-6 | Deleting a discussion or a reply deletes its revisions. |
| FR-7 | The "Edited" label opens a history dialog; each older version highlights what the next one changed, word by word. |
| NFR-1 | History requests are rate limited (60 a minute per member) and capped at the 50 newest versions. |
| NFR-2 | Editing stays one transaction; history reads never touch the discussion caches. |
| NFR-3 | Accessible as everything else: the label is a real button, the dialog uses the shared Modal, changes are marked with text as well as colour (`<del>`, `<ins>`). |

## Subdomains affected

- **Discussions** and **Threaded Comments**: services, routers, the thread and the discussion page.
- **Platform**: one migration.

## Data and permissions

| Entity | Fields | Notes |
| --- | --- | --- |
| `DiscussionRevision` | `id`, `workspaceId`, `discussionId`, `version`, `title`, `body`, `fileNames`, `editedById?`, `editorLabel`, `createdAt` | Deleted with the discussion; unique on `(discussionId, version)` |
| `CommentRevision` | `id`, `workspaceId`, `discussionId`, `commentId`, `version`, `body`, `fileNames`, `editedById?`, `editorLabel`, `createdAt` | Deleted with the reply; unique on `(commentId, version)` |

A revision holds the version that an edit replaced. The current version is the discussion or reply itself, so the history is the revisions plus the current row. `editorLabel` keeps the editor's name if their account is later removed, as decisions do.

| Action | Who |
| --- | --- |
| Create a revision | The edit itself (author, admin or owner, as today) |
| Read history | Members of the discussion's workspace |

## Budget

Nothing new: two tables in the existing database. Storage grows with edits only; a revision is the size of the text it replaced.

## Risks and open questions

Each question has a proposed default for the author to confirm.

- **Removing something written by mistake (a password, a private detail).** Default: not in this project; the history keeps it, readable by the same members who saw it before the edit. Deleting the reply removes it and its history. A "redact a version" action for owners and admins can follow if teams need it.
- **Who can read history.** Default: every member who can read the discussion, matching Slack's and GitHub's visible edit history.
- **Edits before this ships.** Default: no history for them; "Edited" disappears from replies whose only change was a pin or a reply count, which is correct.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#199) | `Commons: Discussions: PRD for edit history on messages` — this document; roadmap and spec map | — |
| 2 (#200) | `Commons: Discussions: keep every edit of discussions and replies` — the two tables and migration, revisions written in the edit transaction, edit counts, `discussion.history` and `comment.history`, rate limits, real-database tests | FR-1 to FR-6, NFR-1, NFR-2 |
| 3 (#201) | `Commons: Discussions: show the edit history of discussions and replies` — "Edited" as a button, the history dialog with word-level changes, tests, screenshots | FR-3, FR-7, NFR-3 |
