# PRD: Decision reviews

Status: approved 2026-11-24 (defaults confirmed by the author) · Horizon 1 · Issue #105

## Problem

Today a proposal goes from "proposed" to "decided" when any owner or admin clicks Finalize. Nothing records who was asked, who agreed or who objected. Teammates' views sit in the discussion's comments, if they were written down at all, and a decision page cannot answer "did the people affected agree?". A proposer also has no way to ask specific people to look; the only signal on Home is "proposal waiting for a decision", shown to every manager.

Evidence:

- The vision lists decision reviews as the Horizon 1 decision feature: "Request approval from named reviewers or a quorum before finalizing; approvals and objections are recorded." Recorded dissent, outcome reviews and the decision health view (Horizon 2) all build on it.
- Home's "Needs you" was built for this: its vision sketch leads with a "Review" item, and its providers were designed so reviews add items without changing the Home (Home PRD, FR-6).
- The data model has no place for reviewers today: `Decision` has a status and revisions, and revisions record only create, edit, finalize, supersede and delete.

## Goals

1. A proposer asks named teammates to review a proposal, and chooses whether all of them or at least a number of them must approve.
2. Each reviewer approves or objects, with a reason when objecting, and every request and response is kept on the record.
3. A proposal cannot be finalized until its review rule is met, unless a manager finalizes anyway with a written reason that is recorded.
4. Changing what a proposal says after people approved it asks them to review again, so an approval always refers to what was finalized.
5. Reviewers find their requests on Home, in the notification bell and on the decision itself; the proposer hears when someone responds.

## Non-goals

- "Disagree and commit" and dissent kept after finalizing (Horizon 2, recorded dissent). Here an objection is a response to a proposal, not a note on a final decision.
- Email for review requests. The daily digest project sends email and will include them.
- Reminders, due dates and automatic escalation for slow reviews.
- Reviews of decided or superseded decisions. Superseding a decision is reviewed by reviewing its replacement proposal.
- Line-by-line comments on a proposal. A reviewer's note is one text; longer conversation stays in the source discussion.
- Review requirements set per workspace ("every decision needs two approvals"). Rules are per proposal for now.

## Users and flows

**Flow 1: asking for review**

1. Sam writes a proposal, "Offer a free plan for teams under five", in Platform.
2. On the proposal, Sam chooses "Request review", picks Maya and Lee from the workspace's members, and keeps the default rule "Everyone must approve".
3. The proposal shows "Review · 0 of 2 approved" with both reviewers listed as waiting.
4. Maya and Lee each get a notification, and "Review requested" appears at the top of their Home "Needs you".

**Flow 2: responding**

1. Maya opens the item, reads the proposal and chooses "Approve", optionally with a note.
2. Lee chooses "Object" and must write why: "Five is too low; small agencies have six to eight people."
3. Sam gets a notification for each response. The proposal shows Maya approved and Lee objected, with Lee's reason.
4. A reviewer can change their response while the proposal is open; the change is recorded, not overwritten in the history.

**Flow 3: revising after an objection**

1. Sam edits the outcome to "teams under ten".
2. Because the outcome changed, both responses return to "waiting", and Maya and Lee are notified that the proposal changed since they reviewed it. The earlier responses stay in the review history.
3. Both approve. The proposal shows "Review · 2 of 2 approved".

**Flow 4: finalizing**

1. Maya, an admin, finalizes. Because the rule is met, Finalize works as it does today.
2. Had the rule not been met, Finalize would say who has not approved and offer "Finalize anyway" with a required reason. The reason is stored with the finalization and shown on the decision: "Finalized without Lee's approval: launch date fixed by the board."

**Flow 5: changes in the team**

1. Sam removes Lee as a reviewer, or Lee leaves the workspace. Lee's pending request is withdrawn, recorded, and no longer counts toward the rule.
2. Sam adds a third reviewer later; the new reviewer starts as waiting.

## Requirements

### Requesting and responding

| ID | Requirement |
| --- | --- |
| FR-1 | While a decision is proposed, its author or a workspace manager can request review from 1 to 10 workspace members, excluding the author. Requesting someone already asked does nothing. |
| FR-2 | The person requesting sets the review rule: everyone must approve (default), or at least N of the reviewers (1 ≤ N ≤ number of reviewers). The rule can be changed while the decision is proposed. |
| FR-3 | The author or a manager can withdraw a pending or answered request while the decision is proposed. Withdrawn requests no longer count toward the rule. |
| FR-4 | Only the requested reviewer can respond: approve (optional note) or object (note required). Notes are plain text up to 2,000 characters. A reviewer can change their response while the decision is proposed. |
| FR-5 | Every request, response, change of response, withdrawal and reset is recorded in the workspace event log with who, when and the decision version it applied to. The decision page shows this review history. |
| FR-6 | When a proposal's question, outcome, rationale or alternatives change, every answered request returns to waiting and its reviewer is notified; the previous responses remain in the history. Edits that change only the follow-up do not reset reviews. |
| FR-7 | When a member leaves the workspace or their role no longer lets them view decisions, their requests are withdrawn and recorded. |

### Finalizing

| ID | Requirement |
| --- | --- |
| FR-8 | A proposal with no review requests finalizes as today. |
| FR-9 | A proposal whose review rule is not met cannot be finalized, except by a manager who confirms "Finalize anyway" with a reason (up to 2,000 characters). The reason is stored with the finalization revision and shown on the decision. |
| FR-10 | Finalizing, superseding or deleting a proposal closes its pending requests; they stay in the history as they were. |

### Surfaces

| ID | Requirement |
| --- | --- |
| FR-11 | The decision page shows a Review section: the rule, progress ("1 of 2 approved"), each reviewer with their response, note, and whether they responded to the current version; actions to request, change the rule and withdraw for the author and managers; approve and object for the reviewer. |
| FR-12 | Decision lists show the review progress on proposals that have reviewers, and can be filtered to "Waiting for my review". |
| FR-13 | In-app notifications: the reviewer when asked and when a proposal they answered changes; the author when someone responds. Delivered through the existing notification queue. |
| FR-14 | Home "Needs you" gains a "Review requested" provider for the user's pending requests, ranked first. Items leave the list when the user responds, the request is withdrawn or the proposal is closed. |
| FR-15 | Workspace Recent activity shows review events in plain language ("Lee objected to Offer a free plan…"), filterable under Decisions. |

### Non-functional

| ID | Requirement |
| --- | --- |
| NFR-1 | Tenant isolation: reviewers must be members of the decision's workspace; no review, reviewer, note or count is visible outside it. Covered by real-database tests, including members who leave. |
| NFR-2 | Concurrency: two reviewers responding at once, a response arriving during an edit, and Finalize racing a response must leave a consistent state; responses carry the decision version they saw and are rejected with a clear message if it changed. |
| NFR-3 | Requests and responses are idempotent under retries and double clicks. |
| NFR-4 | WCAG 2.2 AA in both themes; review state is shown with text, not color alone. |
| NFR-5 | No new paid service. |

## Subdomains affected

- **Decision Records**: reviews, the review rule, finalization with a reason, version checks.
- **Workspaces and Membership**: withdrawing requests when members leave or lose access.
- **Notifications**: two new notification types through the existing queue.
- **Activity**: new review event kinds and their wording.
- **Home**: a "Review requested" provider for "Needs you".

## Data and permissions

New entity `DecisionReview`, one row per decision and reviewer:

| Field | Notes |
| --- | --- |
| `workspaceId`, `decisionId` | Composite reference to `Decision (workspaceId, id)`, so a review cannot point into another workspace |
| `reviewerId`, `reviewerLabel` | The reviewer; the label survives account deletion, like decision authors |
| `requestedById` | Who asked |
| `state` | `PENDING`, `APPROVED`, `OBJECTED`, `WITHDRAWN` |
| `note` | Required for `OBJECTED` |
| `respondedVersion` | The decision version the response applies to |
| `respondedAt`, `createdAt`, `updatedAt` | |

Unique on `(decisionId, reviewerId)`; indexed on `(reviewerId, state)` for Home and the list filter.

Changes to existing data: `Decision` gains `reviewRule` (`ALL` or `AT_LEAST`, default `ALL`) and `requiredApprovals`; the finalization revision gains an optional `overrideReason`; `NotificationType` gains `REVIEW_REQUESTED` and `REVIEW_RESPONDED`; `ActivityKind` gains `DECISION_REVIEW_REQUESTED`, `DECISION_REVIEW_RESPONDED`, `DECISION_REVIEW_WITHDRAWN` and `DECISION_REVIEWS_RESET`. One additive migration; existing decisions have no reviews and keep working unchanged.

| Action | Who |
| --- | --- |
| Request review, change the rule, withdraw | The decision's author, or an owner or admin, while proposed |
| Approve or object | The requested reviewer only, while proposed |
| Finalize with the rule met | Owners and admins (unchanged) |
| Finalize anyway, with a reason | Owners and admins |
| See reviews and history | Every member of the workspace |

## Risks and open questions

Each question had a proposed default; the author confirmed all of them on 2026-11-24.

- **Should an unmet rule block finalizing?** Decided: yes, with "Finalize anyway" for managers and a required, recorded reason. Without the block a review is advisory and easy to skip; without the override a team is stuck when a reviewer is away.
- **Should edits reset approvals?** Decided: yes, when the question, outcome, rationale or alternatives change, like dismissing stale reviews on a pull request. Follow-up changes do not reset.
- **Can the author review their own proposal?** Decided: no.
- **Who can be asked?** Decided: any member of the workspace, up to 10 per proposal.
- **The migration.** The release adds enum values and a table. It is additive, and the current code ignores the new columns, so it is safe in either deploy order; the release still asks for the approval page to be open before merging.

## Delivery plan

| # | Pull request | Requirements |
| --- | --- | --- |
| 1 (#105) | `Commons: Decision Records: PRD for decision reviews` — this document | — |
| 2 (#107) | `Commons: Decision Records: store reviewers and their responses` — `DecisionReview`, the rule, the migration, request, respond, withdraw and the version checks, with real-database tests | FR-1 to FR-5, FR-7, NFR-1 to NFR-3 |
| 3 (#108) | `Commons: Decision Records: reset reviews on edits and gate finalizing on the rule` — stale resets, the finalize check, "finalize anyway" with a reason, closing requests on finalize, supersede and delete | FR-6, FR-8 to FR-10 |
| 4 (#109) | `Commons: Decision Records: show and answer reviews on the decision page` — the Review section, request dialog with member picker, approve and object, the finalize-anyway dialog, review history | FR-11, NFR-4 |
| 5 (#110) | `Commons: Decision Records: tell reviewers and authors about reviews` — notifications, "Review requested" on Home, list progress and "Waiting for my review", activity wording | FR-12 to FR-15 |
