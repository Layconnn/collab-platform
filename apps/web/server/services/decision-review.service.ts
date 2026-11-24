import type {
  DecisionByIdInput,
  RequestDecisionReviewInput,
  RespondToDecisionReviewInput,
  SetDecisionReviewRuleInput,
  WithdrawDecisionReviewInput,
} from "@repo/validators/decision";
import { MAX_DECISION_REVIEWERS } from "@repo/validators/decision";
import type { ActivityKind, DecisionReviewRule, DecisionReviewState, Prisma, WorkspaceRole } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { activityActorLabel, recordActivity } from "./activity.service";
import { notificationService } from "./notification.service";
import { canManageDecisions } from "./workspace.permissions";

// Decision reviews (decision reviews PRD): a proposal's author or a manager
// asks members to review it; each reviewer approves or objects. A review row
// keeps the latest state and every change is written to the event log, which
// is the review history.

type Tx = Prisma.TransactionClient;

export const REVIEW_EVENT_KINDS: ActivityKind[] = [
  "DECISION_REVIEW_REQUESTED",
  "DECISION_REVIEW_RESPONDED",
  "DECISION_REVIEW_WITHDRAWN",
  "DECISION_REVIEWS_RESET",
  "DECISION_REVIEW_RULE_CHANGED",
];

const ACTIVE_STATES: DecisionReviewState[] = ["PENDING", "APPROVED", "OBJECTED"];
const HISTORY_LIMIT = 50;

export type ReviewSummary = {
  rule: DecisionReviewRule;
  // The number of approvals the rule asks for, given the active reviewers.
  needed: number;
  active: number;
  approved: number;
  objected: number;
  pending: number;
  // True when there are no active reviewers, or the rule is satisfied.
  met: boolean;
};

// The rule, evaluated over the reviewers still asked. "Everyone" needs every
// active reviewer to approve; "at least N" needs N approvals, capped at the
// number of active reviewers, and is not blocked by objections.
export function summarizeReviews(
  decision: { reviewRule: DecisionReviewRule; requiredApprovals: number | null },
  reviews: Array<{ state: DecisionReviewState }>,
): ReviewSummary {
  const active = reviews.filter((review) => review.state !== "WITHDRAWN");
  const approved = active.filter((review) => review.state === "APPROVED").length;
  const objected = active.filter((review) => review.state === "OBJECTED").length;
  const needed = decision.reviewRule === "ALL"
    ? active.length
    : Math.min(decision.requiredApprovals ?? active.length, active.length);
  return {
    rule: decision.reviewRule,
    needed,
    active: active.length,
    approved,
    objected,
    pending: active.length - approved - objected,
    met: active.length === 0 || approved >= needed,
  };
}

async function requireMutationMember(tx: Tx, workspaceId: string, userId: string): Promise<WorkspaceRole> {
  // Held through commit, so a member removed meanwhile cannot commit a change.
  const rows = await tx.$queryRaw<Array<{ role: WorkspaceRole }>>`
    SELECT "role" FROM "WorkspaceMember"
    WHERE "workspaceId" = ${workspaceId} AND "userId" = ${userId}
    FOR SHARE
  `;
  if (!rows[0]) throw new AppError("NOT_FOUND", "Decision not found.");
  return rows[0].role;
}

// Locks the decision row so requests, responses, edits and finalizing are
// applied one at a time.
async function lockProposal(tx: Tx, workspaceId: string, decisionId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Decision"
    WHERE "workspaceId" = ${workspaceId} AND "id" = ${decisionId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  if (!locked[0]) throw new AppError("NOT_FOUND", "Decision not found.");
  const decision = await tx.decision.findUniqueOrThrow({
    where: { id: decisionId },
    select: { id: true, question: true, status: true, version: true, createdById: true, reviewRule: true, requiredApprovals: true },
  });
  return decision;
}

function requireOpen(decision: { status: string }) {
  if (decision.status !== "PROPOSED") throw new AppError("CONFLICT", "Reviews can change only while the decision is a proposal.");
}

function requireReviewManager(role: WorkspaceRole, decision: { createdById: string | null }, userId: string) {
  if (decision.createdById !== userId && !canManageDecisions(role)) {
    throw new AppError("FORBIDDEN", "Only the proposal's author or a workspace manager can manage its reviews.");
  }
}

async function label(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
  if (!user) throw new AppError("UNAUTHORIZED", "Authentication required.");
  return activityActorLabel(user);
}

// Keeps a stored "at least N" no larger than the reviewers still asked.
async function clampRule(tx: Tx, decision: { id: string; reviewRule: DecisionReviewRule; requiredApprovals: number | null }) {
  if (decision.reviewRule !== "AT_LEAST" || decision.requiredApprovals === null) return;
  const active = await tx.decisionReview.count({ where: { decisionId: decision.id, state: { in: ACTIVE_STATES } } });
  const clamped = active === 0 ? null : Math.min(decision.requiredApprovals, active);
  if (clamped !== decision.requiredApprovals) {
    await tx.decision.update({ where: { id: decision.id }, data: { requiredApprovals: clamped, ...(clamped === null ? { reviewRule: "ALL" } : {}) } });
  }
}

async function applyRule(
  tx: Tx,
  decision: { id: string; question: string; reviewRule: DecisionReviewRule; requiredApprovals: number | null },
  rule: { rule: DecisionReviewRule; requiredApprovals?: number },
  actor: { workspaceId: string; userId: string; label: string },
) {
  const active = await tx.decisionReview.count({ where: { decisionId: decision.id, state: { in: ACTIVE_STATES } } });
  const requiredApprovals = rule.rule === "AT_LEAST" ? rule.requiredApprovals ?? null : null;
  if (requiredApprovals !== null && requiredApprovals > active) {
    throw new AppError("BAD_REQUEST", `Only ${active} ${active === 1 ? "reviewer is" : "reviewers are"} asked, so at most ${active} approvals can be required.`);
  }
  if (rule.rule === decision.reviewRule && requiredApprovals === decision.requiredApprovals) return;
  await tx.decision.update({ where: { id: decision.id }, data: { reviewRule: rule.rule, requiredApprovals } });
  await recordActivity(tx, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    actorLabel: actor.label,
    kind: "DECISION_REVIEW_RULE_CHANGED",
    subjectType: "DECISION",
    subjectId: decision.id,
    summary: { question: decision.question, rule: rule.rule, requiredApprovals },
  });
}

// Withdraws every open request a member has in a workspace, recorded as done
// by the person who removed them. Called inside the removal's transaction.
export async function withdrawReviewsForMember(tx: Tx, workspaceId: string, memberId: string, actor: { userId: string; label: string }) {
  const reviews = await tx.decisionReview.findMany({
    where: { workspaceId, reviewerId: memberId, state: { in: ACTIVE_STATES }, decision: { status: "PROPOSED", deletedAt: null } },
    select: { id: true, reviewerLabel: true, decision: { select: { id: true, question: true, reviewRule: true, requiredApprovals: true } } },
  });
  for (const review of reviews) {
    await tx.decisionReview.update({ where: { id: review.id }, data: { state: "WITHDRAWN" } });
    await recordActivity(tx, {
      workspaceId,
      actorUserId: actor.userId,
      actorLabel: actor.label,
      kind: "DECISION_REVIEW_WITHDRAWN",
      subjectType: "DECISION",
      subjectId: review.decision.id,
      summary: { question: review.decision.question, reviewer: review.reviewerLabel, reviewerId: memberId, reason: "left the workspace" },
    });
    await clampRule(tx, review.decision);
  }
  return reviews.length;
}

// After an edit to what a proposal says, every answered request waits again;
// the earlier answers stay in the history (FR-6).
export async function resetReviewsAfterEdit(
  tx: Tx,
  input: { workspaceId: string; decision: { id: string; question: string; version: number }; actor: { userId: string; label: string } },
) {
  const answered = await tx.decisionReview.findMany({
    where: { decisionId: input.decision.id, state: { in: ["APPROVED", "OBJECTED"] } },
    select: { id: true, reviewerId: true, reviewerLabel: true },
  });
  if (!answered.length) return [];
  await tx.decisionReview.updateMany({
    where: { id: { in: answered.map((review) => review.id) } },
    data: { state: "PENDING", note: null, respondedAt: null },
  });
  await recordActivity(tx, {
    workspaceId: input.workspaceId,
    actorUserId: input.actor.userId,
    actorLabel: input.actor.label,
    kind: "DECISION_REVIEWS_RESET",
    subjectType: "DECISION",
    subjectId: input.decision.id,
    summary: { question: input.decision.question, reviewers: answered.length, version: input.decision.version },
  });
  return answered;
}

// Whether a proposal may be finalized under its review rule, and who it is
// waiting for when not.
export async function reviewGate(
  tx: Tx,
  decisionId: string,
  decision: { reviewRule: DecisionReviewRule; requiredApprovals: number | null },
) {
  const reviews = await tx.decisionReview.findMany({
    where: { decisionId },
    select: { state: true, reviewerLabel: true },
    orderBy: { createdAt: "asc" },
  });
  const summary = summarizeReviews(decision, reviews);
  const waitingFor = reviews
    .filter((review) => review.state === "PENDING" || review.state === "OBJECTED")
    .map((review) => review.reviewerLabel)
    .join(", ");
  const message = summary.met ? "" : decision.reviewRule === "ALL"
    ? `Everyone asked must approve first. Waiting for ${waitingFor}. A manager can finalize anyway with a reason.`
    : `This proposal needs ${summary.needed} ${summary.needed === 1 ? "approval" : "approvals"} and has ${summary.approved}. A manager can finalize anyway with a reason.`;
  return { met: summary.met, summary, waitingFor, message };
}

export const decisionReviewService = {
  async list(userId: string, input: DecisionByIdInput) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new AppError("NOT_FOUND", "Decision not found.");
    const decision = await prisma.decision.findFirst({
      where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null, workspace: { members: { some: { userId } } } },
      select: { id: true, status: true, version: true, createdById: true, reviewRule: true, requiredApprovals: true },
    });
    if (!decision) throw new AppError("NOT_FOUND", "Decision not found.");
    const [reviews, history] = await Promise.all([
      prisma.decisionReview.findMany({
        where: { decisionId: decision.id, workspaceId: input.workspaceId },
        select: { reviewerId: true, reviewerLabel: true, requestedByLabel: true, state: true, note: true, respondedVersion: true, respondedAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.activityEvent.findMany({
        where: { workspaceId: input.workspaceId, subjectType: "DECISION", subjectId: decision.id, kind: { in: REVIEW_EVENT_KINDS } },
        select: { id: true, kind: true, actorLabel: true, summary: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_LIMIT,
      }),
    ]);
    const mine = reviews.find((review) => review.reviewerId === userId && review.state !== "WITHDRAWN") ?? null;
    const open = decision.status === "PROPOSED";
    return {
      decisionVersion: decision.version,
      summary: summarizeReviews(decision, reviews),
      requiredApprovals: decision.requiredApprovals,
      reviews: reviews.map((review) => ({
        ...review,
        // An answer given to an earlier version of the proposal.
        stale: review.respondedVersion !== null && review.respondedVersion !== decision.version && review.state !== "PENDING",
      })),
      history,
      viewer: {
        canManage: open && (decision.createdById === userId || canManageDecisions(membership.role)),
        canRespond: open && Boolean(mine),
        review: mine ? { state: mine.state, note: mine.note } : null,
      },
    };
  },

  async request(userId: string, input: RequestDecisionReviewInput) {
    const asked = await prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      const decision = await lockProposal(tx, input.workspaceId, input.decisionId);
      requireOpen(decision);
      requireReviewManager(role, decision, userId);
      if (decision.createdById && input.reviewerIds.includes(decision.createdById)) {
        throw new AppError("BAD_REQUEST", "The author cannot review their own proposal.");
      }
      const members = await tx.workspaceMember.findMany({
        where: { workspaceId: input.workspaceId, userId: { in: input.reviewerIds } },
        select: { userId: true, user: { select: { name: true, username: true } } },
      });
      if (members.length !== input.reviewerIds.length) throw new AppError("BAD_REQUEST", "Reviewers must be members of this workspace.");

      const existing = await tx.decisionReview.findMany({
        where: { decisionId: decision.id },
        select: { id: true, reviewerId: true, state: true },
      });
      const byReviewer = new Map(existing.map((review) => [review.reviewerId, review]));
      const toAsk = members.filter((member) => {
        const review = byReviewer.get(member.userId);
        return !review || review.state === "WITHDRAWN";
      });
      const active = existing.filter((review) => review.state !== "WITHDRAWN").length;
      if (active + toAsk.length > MAX_DECISION_REVIEWERS) {
        throw new AppError("BAD_REQUEST", `A proposal can have at most ${MAX_DECISION_REVIEWERS} reviewers.`);
      }

      const actorLabel = await label(tx, userId);
      for (const member of toAsk) {
        const reviewerLabel = activityActorLabel(member.user);
        const previous = byReviewer.get(member.userId);
        const reset = { state: "PENDING" as const, note: null, respondedVersion: null, respondedAt: null, requestedById: userId, requestedByLabel: actorLabel, reviewerLabel };
        if (previous) await tx.decisionReview.update({ where: { id: previous.id }, data: reset });
        else await tx.decisionReview.create({ data: { workspaceId: input.workspaceId, decisionId: decision.id, reviewerId: member.userId, ...reset } });
        await recordActivity(tx, {
          workspaceId: input.workspaceId,
          actorUserId: userId,
          actorLabel,
          kind: "DECISION_REVIEW_REQUESTED",
          subjectType: "DECISION",
          subjectId: decision.id,
          summary: { question: decision.question, reviewer: reviewerLabel, reviewerId: member.userId },
        });
      }
      if (input.rule) await applyRule(tx, decision, input.rule, { workspaceId: input.workspaceId, userId, label: actorLabel });
      return { reviewerIds: toAsk.map((member) => member.userId), question: decision.question, actorLabel };
    });
    // After commit, best effort: the request stands even if a notice fails.
    await notificationService.enqueueDecisionReview({
      actorUserId: userId, workspaceId: input.workspaceId, decisionId: input.decisionId, question: asked.question,
      type: "REVIEW_REQUESTED", recipientUserIds: asked.reviewerIds,
      message: `${asked.actorLabel} asked you to review “${asked.question}”.`,
    });
    return this.list(userId, input);
  },

  async setRule(userId: string, input: SetDecisionReviewRuleInput) {
    await prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      const decision = await lockProposal(tx, input.workspaceId, input.decisionId);
      requireOpen(decision);
      requireReviewManager(role, decision, userId);
      await applyRule(tx, decision, input, { workspaceId: input.workspaceId, userId, label: await label(tx, userId) });
    });
    return this.list(userId, input);
  },

  async withdraw(userId: string, input: WithdrawDecisionReviewInput) {
    await prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      const decision = await lockProposal(tx, input.workspaceId, input.decisionId);
      requireOpen(decision);
      requireReviewManager(role, decision, userId);
      const review = await tx.decisionReview.findUnique({
        where: { decisionId_reviewerId: { decisionId: decision.id, reviewerId: input.reviewerId } },
        select: { id: true, state: true, reviewerLabel: true },
      });
      if (!review) throw new AppError("NOT_FOUND", "Review request not found.");
      if (review.state === "WITHDRAWN") return;
      await tx.decisionReview.update({ where: { id: review.id }, data: { state: "WITHDRAWN" } });
      await recordActivity(tx, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        actorLabel: await label(tx, userId),
        kind: "DECISION_REVIEW_WITHDRAWN",
        subjectType: "DECISION",
        subjectId: decision.id,
        summary: { question: decision.question, reviewer: review.reviewerLabel, reviewerId: input.reviewerId },
      });
      await clampRule(tx, decision);
    });
    return this.list(userId, input);
  },

  async respond(userId: string, input: RespondToDecisionReviewInput) {
    const answered = await prisma.$transaction(async (tx) => {
      await requireMutationMember(tx, input.workspaceId, userId);
      const decision = await lockProposal(tx, input.workspaceId, input.decisionId);
      const review = await tx.decisionReview.findUnique({
        where: { decisionId_reviewerId: { decisionId: decision.id, reviewerId: userId } },
        select: { id: true, state: true, note: true, respondedVersion: true },
      });
      if (!review || review.state === "WITHDRAWN") throw new AppError("NOT_FOUND", "No review was requested from you on this proposal.");
      requireOpen(decision);
      if (decision.version !== input.expectedVersion) {
        throw new AppError("CONFLICT", "The proposal changed since you opened it. Reload to review the current version.");
      }
      const note = input.note || null;
      // A repeated click or retry changes nothing and records nothing.
      if (review.state === input.response && review.note === note && review.respondedVersion === decision.version) return null;
      await tx.decisionReview.update({
        where: { id: review.id },
        data: { state: input.response, note, respondedVersion: decision.version, respondedAt: new Date() },
      });
      await recordActivity(tx, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        actorLabel: await label(tx, userId),
        kind: "DECISION_REVIEW_RESPONDED",
        subjectType: "DECISION",
        subjectId: decision.id,
        summary: { question: decision.question, response: input.response, previous: review.state, note, version: decision.version },
      });
      return { authorId: decision.createdById, question: decision.question, reviewerLabel: await label(tx, userId) };
    });
    if (answered?.authorId) {
      await notificationService.enqueueDecisionReview({
        actorUserId: userId, workspaceId: input.workspaceId, decisionId: input.decisionId, question: answered.question,
        type: "REVIEW_RESPONDED", recipientUserIds: [answered.authorId],
        message: `${answered.reviewerLabel} ${input.response === "APPROVED" ? "approved" : "objected to"} “${answered.question}”.`,
      });
    }
    return this.list(userId, input);
  },
};
