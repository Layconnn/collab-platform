# PRD: File uploads

Status: draft for approval · Horizon 1 · Issue #143

## Problem

Decisions rest on artefacts: the screenshot of the bug, the mock-up being chosen, the spreadsheet with the numbers, the vendor's PDF. Commons cannot hold any of them. Today a member pastes a link to a file somewhere else, or, more often, drops the file in chat and the discussion moves there with it. That is the habit Horizon 1 is meant to replace.

Evidence:

- The Horizon 1 gate is a test team using Commons daily for a week "without moving threads back to chat". Sharing a screenshot is the most common reason a thread moves.
- The roadmap lists file uploads for Horizon 1, stored in Cloudflare R2 on the free plan.
- The Markdown renderer deliberately strips `img` (Markdown PRD), so there is no way today to show an image at all.

## Goals

1. A member attaches files and images to a new discussion, a reply or a decision, by choosing, dragging or pasting them.
2. Images show inline as previews that open full size; other files show as a named chip with type and size that downloads.
3. Files are private to the workspace: only current members can open them, and a link copied out of Commons stops working within minutes.
4. Uploads are fast and do not pass through our functions: the browser sends the file straight to storage.
5. It runs at $0 at test-team scale, with limits that keep it there, and switches on with configuration only.

## Non-goals

- Previews of PDFs, documents or video inside Commons (they download). Video playback, audio, image editing.
- A workspace "Files" browser listing every upload. Files live on the post they were attached to; search by file name comes later.
- Images inside the Markdown text itself (`![]()`); attachments show below the text.
- Virus scanning. We restrict types and serve every non-image file as a download (see risks).
- Attachments on direct messages or anywhere outside discussions, replies and decisions.

## Users and flows

**Flow 1: a screenshot in a reply**

1. Maya copies a screenshot and presses Ctrl V in the reply box (or drags the file onto it, or clicks the paperclip).
2. A thumbnail appears under the text with a progress bar; she can remove it before posting.
3. She posts. Everyone in the thread sees the image under her reply; clicking it opens it full size, with a download button.

**Flow 2: the spreadsheet a decision rests on**

1. Lee writes a decision proposal and attaches `pricing-options.xlsx` and a PDF.
2. The decision page shows them as chips ("pricing-options.xlsx · Spreadsheet · 48 KB"). Clicking one downloads it.
3. The files stay with the decision through edits; its revision history records which files were added or removed.

**Flow 3: a file someone should not see**

1. Sam leaves the workspace. A file link he copied earlier no longer opens, and opening it from Commons shows "You no longer have access".
2. A link pasted into a public chat expires within 5 minutes; opening it later shows an error page from storage, not the file.

**Flow 4: too big or not allowed**

1. Maya drags in a 40 MB video. The composer says "Files can be up to 10 MB" before anything uploads.
2. She drags in a `.exe`. It says "This type of file cannot be attached" and lists what can.

**Flow 5: removing a file**

1. The author edits their reply, removes the attachment and saves. The file disappears from the reply and is deleted from storage within a day.
2. A deleted discussion, reply or decision takes its files with it.

## Requirements

### Uploading

| ID | Requirement |
| --- | --- |
| FR-1 | The discussion composer, the reply composer (new and edit) and the decision form accept attachments by file picker, drag and drop, and paste. Each shows a preview or chip with progress, an error state with retry, and a remove button. |
| FR-2 | The browser uploads directly to storage with a signed upload URL issued by the server for one object, one content type and one exact size, valid for 10 minutes. The server records the upload as pending. |
| FR-3 | When the post is saved, the server checks each pending upload exists in storage with the declared size and type, belongs to the same uploader and workspace, and links it to the post in the same transaction as the post. Anything else is rejected and the post is not saved. |
| FR-4 | Limits, enforced on the server and shown in the composer before uploading: 10 MB per file, 10 files per post, and 1 GB per workspace in total. |
| FR-5 | Allowed types: images (PNG, JPEG, GIF, WebP), PDF, plain text and CSV, Markdown, JSON, ZIP, and Office/OpenDocument documents, spreadsheets and presentations. The type is checked by file name extension and by declared content type, and the first bytes of images are checked after upload. SVG and HTML are not allowed. |
| FR-6 | A reply may consist of attachments only, with no text. A discussion still needs a title and text; a decision still needs its question. |

### Viewing and downloading

| ID | Requirement |
| --- | --- |
| FR-7 | Attachments show below the post's text, in upload order: images as previews in a grid (one image shows larger), other files as chips with an icon, name, kind and size. |
| FR-8 | Opening a file goes through Commons: the server checks the member can read the post, then redirects to a signed download URL valid for 5 minutes. Non-images are always served as downloads with their original file name. |
| FR-9 | Clicking an image opens a viewer with the full-size image, its name, a download button, and next and previous for the post's other images; Escape closes it and focus returns to the image. |
| FR-10 | Attachments are shown on Home, search results and the digest only as a count ("2 files"), never as content. |

### Changing and deleting

| ID | Requirement |
| --- | --- |
| FR-11 | Whoever may edit a post may add and remove its attachments. Adding and removing files on a decision creates a revision entry like any other edit and follows the decision's edit rules (no changes once final). |
| FR-12 | Removing an attachment, or deleting its post or workspace, deletes the file from storage. Pending uploads never attached within 24 hours are deleted. A daily clean-up job does both and reports what it removed. |
| FR-13 | Attachments added to or removed from a post are recorded in the event log. |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | Tenant isolation: a member can never see, link or download a file from a workspace they do not belong to, including by guessing or reusing IDs; covered by real-database tests. Object keys are random and contain no names. |
| NFR-2 | The storage bucket is private. Files are reachable only through signed URLs that expire (10 minutes to upload, 5 to download). Downloads send `Content-Disposition: attachment` for non-images and `X-Content-Type-Options: nosniff`. |
| NFR-3 | File names are stored as given for display but never used in keys or headers without encoding; display is escaped. |
| NFR-4 | Uploads do not pass through Vercel functions. A 10 MB upload over a 10 Mbit/s connection completes in under 15 seconds. |
| NFR-5 | Accessible: the drop zone and attach button work by keyboard, upload progress and errors are announced, images need alt text (the file name by default, editable later), and the viewer traps focus. |
| NFR-6 | When storage is not configured, attaching is hidden and nothing else changes; existing tests and e2e run without storage credentials. |
| NFR-7 | $0: within R2's free limits at test-team scale (see the budget). |

## Subdomains affected

- **Files** (new): the storage adapter, upload and download, attachments, limits and clean-up. Added to `ARCHITECTURE-commons.md`.
- **Discussions**, **Threaded Comments**, **Decision Records**: composers, displays and saving with attachments.
- **Activity**: attachment events.
- **Workspaces and Membership**: per-workspace usage.

## Data and permissions

| Entity | Fields | Notes |
| --- | --- | --- |
| `Attachment` | `id`, `workspaceId`, `uploaderId`, `key` (unique), `fileName`, `contentType`, `size`, `status` (`PENDING`, `ATTACHED`, `DELETING`), `discussionId?`, `commentId?`, `decisionId?`, `position`, `createdAt`, `attachedAt?` | At most one of the three post ids is set (CHECK constraint); every post id is scoped with `workspaceId` (composite foreign keys); `DELETING` rows are removed by the clean-up job after the object is deleted |

Workspace usage is the sum of `size` over its non-deleting attachments, checked under a lock on the workspace when issuing an upload URL.

| Action | Who |
| --- | --- |
| Get an upload URL | Any member of the workspace (the same people who can post) |
| Attach to a post | The uploader, when saving a post they may create or edit |
| Open or download | Any current member who can read the post |
| Remove from a post | Whoever may edit the post (author; owners and admins as for the post itself) |
| Run the clean-up | The scheduler only (a secret header) |

## Budget

| Item | $0 path | When it costs money |
| --- | --- | --- |
| Storage: Cloudflare R2 | Free each month: 10 GB stored, 1 million writes, 10 million reads, free downloads | Beyond 10 GB: about $0.015 per GB a month. Our 1 GB per workspace limit keeps a test team far below it |
| Account | A Cloudflare account with a payment method on file (required to create the first bucket; not charged within free limits) | — |
| Clean-up job | GitHub Actions, like the digest | Never at this scale |

## Risks and open questions

Each question has a proposed default for the author to confirm.

- **Storage provider.** Decided by the author on 2026-11-25: Cloudflare R2, private bucket, signed URLs. Vercel Blob was the alternative (no card, but 1 GB and a 30-day lock-out when a Hobby limit is hit).
- **Malicious files.** Without scanning, a member could upload a harmful document. Default: restrict types (FR-5), never render anything but images inline, serve the rest as downloads with `nosniff`, and leave scanning to a paid horizon. Only workspace members can upload, and only to their own workspace.
- **Library.** Default: sign requests with `aws4fetch` (about 3 KB, uses `fetch`) instead of the AWS SDK, behind a small storage adapter, so tests use an in-memory fake and need no network.
- **Image sizes.** Default: show the original image scaled by the browser; no thumbnails generated. At 10 MB per file this is acceptable for a test team; thumbnails come with the paid image-resizing option later.
- **File-only replies.** Default: allowed (FR-6), as in chat. A file-only reply shows its file names in notifications and search.
- **Limits.** Default: 10 MB per file, 10 per post, 1 GB per workspace. These keep a hundred workspaces inside the free 10 GB only if most stay small; usage per workspace is shown on its settings page so we notice early.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#143) | `Commons: Discussions: PRD for file uploads` — this document | — |
| 2 | `Commons: Files: store files privately in R2` — `Attachment` model and migration, the storage adapter with an in-memory fake, upload URLs with limits and type checks, the download route, the clean-up job and its workflow, setup steps in the devops guide | FR-2, FR-4, FR-5, FR-8, FR-12, NFR-1 to NFR-3, NFR-6, NFR-7 |
| 3 | `Commons: Discussions: attach files to discussions and replies` — composer attach, drag and drop, paste and progress; saving with attachments; display, the image viewer; file-only replies; activity events | FR-1, FR-3, FR-6, FR-7, FR-9, FR-11, FR-13, NFR-4, NFR-5 |
| 4 | `Commons: Decision Records: attach files to decisions` — the decision form and page, revision entries, counts on Home, search and the digest, workspace usage on settings | FR-1, FR-3, FR-10, FR-11 |
