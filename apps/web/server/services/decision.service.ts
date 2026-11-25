import { createHash } from "node:crypto";

import type {
  CreateDecisionInput,
  DecisionByIdInput,
  DecisionRevisionsInput,
  DeleteDecisionInput,
  EditDecisionInput,
  FinalizeDecisionInput,
  ListDecisionsInput,
  ReplacementCandidatesInput,
  SupersedeDecisionInput,
} from "@repo/validators/decision";
import { Prisma, type WorkspaceRole } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { toPaginatedResult } from "../../src/common/utils/pagination";
import { recordActivity } from "./activity.service";
import { attachmentService, attachmentsSelect, newUploadIds } from "./files/attachment.service";
import { resetReviewsAfterEdit, reviewGate, summarizeReviews } from "./decision-review.service";
import { notificationService } from "./notification.service";
import { assertCanDeleteDecision, assertCanEditDecision, canManageDecisions } from "./workspace.permissions";

const decisionSelect = {
  id: true,
  workspaceId: true,
  sourceDiscussionId: true,
  sourceDiscussionTitle: true,
  createdById: true,
  createdByLabel: true,
  question: true,
  outcome: true,
  rationale: true,
  alternatives: true,
  followUp: true,
  attachments: attachmentsSelect,
  status: true,
  version: true,
  decidedAt: true,
  supersededAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const revisionSelect = {
  id: true,
  decisionId: true,
  version: true,
  action: true,
  actorUserId: true,
  actorLabel: true,
  reason: true,
  question: true,
  outcome: true,
  rationale: true,
  alternatives: true,
  followUp: true,
  status: true,
  overrideReason: true,
  fileNames: true,
  createdAt: true,
} as const;

const linkedDecisionSelect = { id: true, question: true, status: true, version: true, deletedAt: true } as const;

type Tx = Prisma.TransactionClient;

// The decision's file names now, for its revision snapshot (FR-11).
async function fileNames(tx: Tx, decisionId: string) {
  const files = await tx.attachment.findMany({ where: { decisionId }, orderBy: { position: "asc" }, select: { fileName: true } });
  return files.map((file) => file.fileName);
}

async function requireMember(db: Tx | typeof prisma, workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!member) throw new AppError("NOT_FOUND", "Decision not found.");
  return member.role;
}

// Orders a content change or finalization against review requests and
// answers, which lock the same row.
async function lockDecision(tx: Tx, workspaceId: string, decisionId: string) {
  await tx.$queryRaw`
    SELECT "id" FROM "Decision"
    WHERE "workspaceId" = ${workspaceId} AND "id" = ${decisionId} AND "deletedAt" IS NULL
    FOR UPDATE
  `;
}

async function requireMutationMember(tx: Tx, workspaceId: string, userId: string): Promise<WorkspaceRole> {
  // Hold the membership row through commit so removal and a decision mutation
  // have a clear order; an already removed member cannot commit a mutation.
  const rows = await tx.$queryRaw<Array<{ role: WorkspaceRole }>>`
    SELECT "role" FROM "WorkspaceMember"
    WHERE "workspaceId" = ${workspaceId} AND "userId" = ${userId}
    FOR SHARE
  `;
  if (!rows[0]) throw new AppError("NOT_FOUND", "Decision not found.");
  return rows[0].role;
}

function hash(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function creationFingerprint(input: CreateDecisionInput) {
  return hash([
    input.workspaceId,
    input.sourceDiscussionId,
    input.question,
    input.outcome ?? null,
    input.rationale ?? null,
    input.alternatives ?? null,
    input.followUp ?? null,
  ]);
}

function actorLabel(user: { name: string | null; username: string }) {
  return user.name?.trim() || user.username;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export const decisionService = {
  async create(userId: string, input: CreateDecisionInput) {
    await requireMember(prisma, input.workspaceId, userId);
    const storedKey = hash([input.workspaceId, userId, input.idempotencyKey]);
    const fingerprint = creationFingerprint(input);

    const replay = async () => {
      const existing = await prisma.decision.findFirst({
        where: {
          idempotencyKey: storedKey,
          workspaceId: input.workspaceId,
          workspace: { members: { some: { userId } } },
        },
        select: { ...decisionSelect, creationPayloadHash: true, deletedAt: true },
      });
      if (!existing) return null;
      if (existing.workspaceId !== input.workspaceId || existing.createdById !== userId || existing.deletedAt) {
        throw new AppError("CONFLICT", "Creation key is already in use.");
      }
      if (existing.creationPayloadHash !== fingerprint) {
        throw new AppError("CONFLICT", "Creation key was used with different content.");
      }
      const { creationPayloadHash: _fingerprint, deletedAt: _deletedAt, ...result } = existing;
      void _fingerprint;
      void _deletedAt;
      return result;
    };

    const existing = await replay();
    if (existing) return existing;
    const attachmentIds = await attachmentService.verifyUploads(userId, input.workspaceId, input.attachmentIds ?? []);

    try {
      return await prisma.$transaction(async (tx) => {
        await requireMutationMember(tx, input.workspaceId, userId);
        const [source, user] = await Promise.all([
          tx.discussion.findFirst({
            where: { id: input.sourceDiscussionId, workspaceId: input.workspaceId },
            select: { title: true },
          }),
          tx.user.findUnique({ where: { id: userId }, select: { name: true, username: true } }),
        ]);
        if (!source) throw new AppError("NOT_FOUND", "Discussion not found.");
        if (!user) throw new AppError("UNAUTHORIZED", "Authentication required.");
        const created = await tx.decision.create({
          data: {
            workspaceId: input.workspaceId,
            sourceWorkspaceId: input.workspaceId,
            sourceDiscussionId: input.sourceDiscussionId,
            sourceDiscussionTitle: source.title,
            createdById: userId,
            createdByLabel: actorLabel(user),
            question: input.question,
            outcome: input.outcome,
            rationale: input.rationale,
            alternatives: input.alternatives,
            followUp: input.followUp,
            idempotencyKey: storedKey,
            creationPayloadHash: fingerprint,
          },
          select: decisionSelect,
        });
        if (attachmentIds.length) {
          await attachmentService.attach(tx, { userId, workspaceId: input.workspaceId, attachmentIds, target: { decisionId: created.id } });
          created.attachments = await tx.attachment.findMany({ where: { decisionId: created.id }, ...attachmentsSelect });
        }
        await tx.decisionRevision.create({
          data: {
            decisionId: created.id,
            version: created.version,
            action: "CREATE",
            actorUserId: userId,
            actorLabel: actorLabel(user),
            question: created.question,
            outcome: created.outcome,
            rationale: created.rationale,
            alternatives: created.alternatives,
            followUp: created.followUp,
            fileNames: await fileNames(tx, created.id),
            status: created.status,
          },
        });
        await recordActivity(tx, {
          workspaceId: input.workspaceId,
          actorUserId: userId,
          actorLabel: actorLabel(user),
          kind: "DECISION_PROPOSED",
          subjectType: "DECISION",
          subjectId: created.id,
          summary: { question: created.question, status: created.status },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const duplicate = await replay();
        if (duplicate) return duplicate;
        throw new AppError("CONFLICT", "Decision creation conflicted.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025"].includes(error.code)) {
        throw new AppError("NOT_FOUND", "Discussion not found.");
      }
      throw error;
    }
  },

  async getById(userId: string, input: DecisionByIdInput) {
    const decision = await prisma.decision.findFirst({
      where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null, workspace: { members: { some: { userId } } } },
      select: {
        ...decisionSelect,
        predecessorLink: { select: { previousDecision: { select: linkedDecisionSelect } } },
        replacementLink: { select: { reason: true, authorizedByLabel: true, createdAt: true, replacementDecision: { select: linkedDecisionSelect } } },
      },
    });
    if (!decision) throw new AppError("NOT_FOUND", "Decision not found.");
    const { predecessorLink, replacementLink, ...record } = decision;
    return {
      ...record,
      previousDecision: predecessorLink?.previousDecision.deletedAt ? null : predecessorLink?.previousDecision ?? null,
      replacementDecision: replacementLink?.replacementDecision.deletedAt ? null : replacementLink?.replacementDecision ?? null,
      supersession: replacementLink ? {
        reason: replacementLink.reason,
        authorizedByLabel: replacementLink.authorizedByLabel,
        createdAt: replacementLink.createdAt,
      } : null,
    };
  },

  async replacementCandidates(userId: string, input: ReplacementCandidatesInput) {
    const role = await requireMember(prisma, input.workspaceId, userId);
    if (!canManageDecisions(role)) throw new AppError("FORBIDDEN", "Only workspace managers can replace decisions.");
    const old = await prisma.decision.findFirst({
      where: { id: input.oldDecisionId, workspaceId: input.workspaceId, deletedAt: null, workspace: { members: { some: { userId, role: { in: ["OWNER", "ADMIN"] } } } } },
      select: { id: true, status: true, replacementLink: { select: { id: true } } },
    });
    if (!old) throw new AppError("NOT_FOUND", "Decision not found.");
    if (old.status !== "DECIDED" || old.replacementLink) throw new AppError("CONFLICT", "Only a current finalized decision can be replaced.");
    const rows = await prisma.decision.findMany({
      where: {
        workspaceId: input.workspaceId, deletedAt: null, status: "DECIDED",
        id: { not: input.oldDecisionId, ...(input.cursor ? { lt: input.cursor } : {}) },
        predecessorLink: null, replacementLink: null,
        workspace: { members: { some: { userId, role: { in: ["OWNER", "ADMIN"] } } } },
      },
      select: { id: true, question: true, outcome: true, sourceDiscussionTitle: true, version: true, decidedAt: true },
      orderBy: { id: "desc" },
      take: input.take + 1,
    });
    return toPaginatedResult(rows, input.take);
  },

  async replacementHistory(userId: string, input: DecisionByIdInput) {
    await this.getById(userId, input);
    const maxNodes = 20;
    const seen = new Set<string>([input.decisionId]);
    const before: string[] = [];
    const after: string[] = [];
    let cursor = input.decisionId;
    let cycleDetected = false;
    while (before.length < maxNodes - 1) {
      const link = await prisma.decisionSupersession.findUnique({
        where: { workspaceId_replacementDecisionId: { workspaceId: input.workspaceId, replacementDecisionId: cursor } },
        select: { previousDecisionId: true },
      });
      if (!link) break;
      if (seen.has(link.previousDecisionId)) { cycleDetected = true; break; }
      before.push(link.previousDecisionId); seen.add(link.previousDecisionId); cursor = link.previousDecisionId;
    }
    cursor = input.decisionId;
    while (before.length + after.length < maxNodes - 1) {
      const link = await prisma.decisionSupersession.findUnique({
        where: { workspaceId_previousDecisionId: { workspaceId: input.workspaceId, previousDecisionId: cursor } },
        select: { replacementDecisionId: true },
      });
      if (!link) break;
      if (seen.has(link.replacementDecisionId)) { cycleDetected = true; break; }
      after.push(link.replacementDecisionId); seen.add(link.replacementDecisionId); cursor = link.replacementDecisionId;
    }
    const ids = [...before.reverse(), input.decisionId, ...after];
    const [decisions, links] = await Promise.all([
      prisma.decision.findMany({ where: { id: { in: ids }, workspaceId: input.workspaceId, deletedAt: null, workspace: { members: { some: { userId } } } }, select: { id: true, question: true, status: true } }),
      prisma.decisionSupersession.findMany({ where: { workspaceId: input.workspaceId, previousDecisionId: { in: ids } }, select: { previousDecisionId: true, replacementDecisionId: true, reason: true, authorizedByLabel: true, createdAt: true } }),
    ]);
    const byId = new Map(decisions.map((item) => [item.id, item]));
    if (!byId.has(input.decisionId)) throw new AppError("NOT_FOUND", "Decision not found.");
    const byPrevious = new Map(links.map((link) => [link.previousDecisionId, link]));
    const items = ids.flatMap((id) => {
      const record = byId.get(id);
      if (!record) return [];
      const link = byPrevious.get(id);
      return [{ ...record, replacement: link && byId.has(link.replacementDecisionId) ? link : null }];
    });
    const last = items.at(-1);
    const hasMoreAfter = Boolean(last && byPrevious.get(last.id));
    const moreBefore = ids.length === maxNodes ? await prisma.decisionSupersession.findUnique({
      where: { workspaceId_replacementDecisionId: { workspaceId: input.workspaceId, replacementDecisionId: ids[0] } },
      select: { id: true },
    }) : null;
    const truncated = cycleDetected || Boolean(moreBefore) || hasMoreAfter;
    return { items, truncated, effectiveDecisionId: !truncated && last?.status === "DECIDED" ? last.id : null };
  },

  async listByWorkspace(userId: string, input: ListDecisionsInput) {
    await requireMember(prisma, input.workspaceId, userId);
    const rows = await prisma.decision.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: null,
        workspace: { members: { some: { userId } } },
        status: input.status,
        id: input.cursor ? { lt: input.cursor } : undefined,
        ...(input.waitingForMe ? { status: "PROPOSED" as const, reviews: { some: { reviewerId: userId, state: "PENDING" as const } } } : {}),
      },
      select: { ...decisionSelect, reviewRule: true, requiredApprovals: true, reviews: { select: { state: true, reviewerId: true } } },
      orderBy: { id: "desc" },
      take: input.take + 1,
    });
    // Each item carries its review progress, when it has reviewers.
    const items = rows.map(({ reviewRule, requiredApprovals, reviews, ...decision }) => ({
      ...decision,
      review: reviews.length ? {
        ...summarizeReviews({ reviewRule, requiredApprovals }, reviews),
        waitingForMe: reviews.some((review) => review.reviewerId === userId && review.state === "PENDING"),
      } : null,
    }));
    return toPaginatedResult(items, input.take);
  },

  async revisions(userId: string, input: DecisionRevisionsInput) {
    const decision = await prisma.decision.findFirst({
      where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null, workspace: { members: { some: { userId } } } },
      select: { id: true },
    });
    if (!decision) throw new AppError("NOT_FOUND", "Decision not found.");
    const rows = await prisma.decisionRevision.findMany({
      where: {
        decisionId: decision.id,
        version: input.cursor ? { gt: input.cursor } : undefined,
        decision: { workspaceId: input.workspaceId, deletedAt: null, workspace: { members: { some: { userId } } } },
      },
      orderBy: { version: "asc" },
      select: revisionSelect,
      take: input.take + 1,
    });
    const items = rows.slice(0, input.take);
    return { items, nextCursor: rows.length > input.take ? items[items.length - 1]?.version ?? null : null };
  },

  async edit(userId: string, input: EditDecisionInput) {
    let askedAgain: string[] = [];
    let editorLabel = "";
    const target = { decisionId: input.decisionId };
    if (input.attachmentIds) {
      const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId } }, select: { id: true } });
      if (!member) throw new AppError("NOT_FOUND", "Decision not found.");
      await attachmentService.verifyUploads(userId, input.workspaceId, await newUploadIds(target, input.attachmentIds));
    }
    const result = await prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      await lockDecision(tx, input.workspaceId, input.decisionId);
      const current = await tx.decision.findFirst({
        where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null },
        select: { status: true, createdById: true, version: true, question: true, outcome: true, rationale: true, alternatives: true },
      });
      if (!current) throw new AppError("NOT_FOUND", "Decision not found.");
      if (current.status !== "PROPOSED") throw new AppError("CONFLICT", "Finalized decisions cannot be edited.");
      assertCanEditDecision(role, current.createdById === userId);
      if (current.version !== input.expectedVersion) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
      const files = input.attachmentIds
        ? await attachmentService.sync(tx, { userId, workspaceId: input.workspaceId, target, desired: input.attachmentIds })
        : null;
      const filesChanged = Boolean(files && (files.added || files.removed || files.reordered));
      const updatedCount = await tx.decision.updateMany({
        where: { id: input.decisionId, workspaceId: input.workspaceId, status: "PROPOSED", deletedAt: null, version: input.expectedVersion },
        data: {
          question: input.question,
          outcome: input.outcome,
          rationale: input.rationale,
          alternatives: input.alternatives,
          followUp: input.followUp,
          version: { increment: 1 },
        },
      });
      if (updatedCount.count !== 1) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
      const [updated, user] = await Promise.all([
        tx.decision.findUniqueOrThrow({ where: { id: input.decisionId }, select: decisionSelect }),
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, username: true } }),
      ]);
      await tx.decisionRevision.create({
        data: {
          decisionId: updated.id,
          version: updated.version,
          action: "EDIT",
          actorUserId: userId,
          actorLabel: actorLabel(user),
          question: updated.question,
          outcome: updated.outcome,
          rationale: updated.rationale,
          alternatives: updated.alternatives,
          followUp: updated.followUp,
          fileNames: await fileNames(tx, updated.id),
          status: updated.status,
        },
      });
      await recordActivity(tx, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        actorLabel: actorLabel(user),
        kind: "DECISION_EDITED",
        subjectType: "DECISION",
        subjectId: updated.id,
        summary: { question: updated.question, status: updated.status, ...(files && (files.added || files.removed) ? { filesAdded: files.added, filesRemoved: files.removed } : {}) },
      });
      // Approvals refer to what the proposal said, files included; changing it
      // asks again (decision reviews FR-6).
      const changed = filesChanged || (["question", "outcome", "rationale", "alternatives"] as const).some((field) => current[field] !== updated[field]);
      if (changed) {
        const reset = await resetReviewsAfterEdit(tx, { workspaceId: input.workspaceId, decision: updated, actor: { userId, label: actorLabel(user) } });
        askedAgain = reset.flatMap((review) => (review.reviewerId ? [review.reviewerId] : []));
        editorLabel = actorLabel(user);
      }
      return updated;
    });
    await notificationService.enqueueDecisionReview({
      actorUserId: userId, workspaceId: input.workspaceId, decisionId: result.id, question: result.question,
      type: "REVIEW_REQUESTED", recipientUserIds: askedAgain,
      message: `${editorLabel} changed “${result.question}” since you reviewed it. Please review it again.`,
    });
    return result;
  },

  async finalize(userId: string, input: FinalizeDecisionInput) {
    return prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      await lockDecision(tx, input.workspaceId, input.decisionId);
      const current = await tx.decision.findFirst({
        where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null },
        select: { status: true, outcome: true, rationale: true, version: true, reviewRule: true, requiredApprovals: true },
      });
      if (!current) throw new AppError("NOT_FOUND", "Decision not found.");
      if (!canManageDecisions(role)) throw new AppError("FORBIDDEN", "Only a workspace manager can finalize decisions.");
      if (current.status !== "PROPOSED") throw new AppError("CONFLICT", "Only proposals can be finalized.");
      if (current.version !== input.expectedVersion) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
      if (!current.outcome?.trim() || !current.rationale?.trim()) {
        throw new AppError("BAD_REQUEST", "Outcome and rationale are required before finalization.");
      }
      // The review rule must be met, unless a manager finalizes anyway with a reason (FR-9).
      const gate = await reviewGate(tx, input.decisionId, current);
      const overrideReason = gate.met ? null : input.overrideReason ?? null;
      if (!gate.met && !overrideReason) throw new AppError("CONFLICT", gate.message);
      const updatedCount = await tx.decision.updateMany({
        where: { id: input.decisionId, workspaceId: input.workspaceId, status: "PROPOSED", deletedAt: null, version: input.expectedVersion },
        data: { status: "DECIDED", decidedAt: new Date(), version: { increment: 1 } },
      });
      if (updatedCount.count !== 1) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
      const [updated, user] = await Promise.all([
        tx.decision.findUniqueOrThrow({ where: { id: input.decisionId }, select: decisionSelect }),
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, username: true } }),
      ]);
      await tx.decisionRevision.create({
        data: {
          decisionId: updated.id,
          version: updated.version,
          action: "FINALIZE",
          actorUserId: userId,
          actorLabel: actorLabel(user),
          overrideReason,
          question: updated.question,
          outcome: updated.outcome,
          rationale: updated.rationale,
          alternatives: updated.alternatives,
          followUp: updated.followUp,
          fileNames: await fileNames(tx, updated.id),
          status: updated.status,
        },
      });
      await recordActivity(tx, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        actorLabel: actorLabel(user),
        kind: "DECISION_FINALIZED",
        subjectType: "DECISION",
        subjectId: updated.id,
        summary: { question: updated.question, status: updated.status, ...(overrideReason ? { overrideReason, waitingFor: gate.waitingFor } : {}) },
      });
      return updated;
    });
  },

  async supersede(userId: string, input: SupersedeDecisionInput) {
    if (input.oldDecisionId === input.replacementDecisionId) throw new AppError("BAD_REQUEST", "A decision cannot replace itself.");
    try {
      return await prisma.$transaction(async (tx) => {
        const role = await requireMutationMember(tx, input.workspaceId, userId);
        if (!canManageDecisions(role)) throw new AppError("FORBIDDEN", "Only workspace managers can replace decisions.");
        // Lock both rows in a deterministic order across API processes. The
        // version predicates below remain the final optimistic concurrency gate.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Decision"
          WHERE "workspaceId" = ${input.workspaceId}
            AND "id" IN (${input.oldDecisionId}, ${input.replacementDecisionId})
            AND "deletedAt" IS NULL
          ORDER BY "id" FOR UPDATE
        `;
        if (locked.length !== 2) throw new AppError("NOT_FOUND", "Decision not found.");
        const records = await tx.decision.findMany({
          where: { workspaceId: input.workspaceId, id: { in: [input.oldDecisionId, input.replacementDecisionId] }, deletedAt: null },
          select: { ...decisionSelect, predecessorLink: { select: { id: true } }, replacementLink: { select: { id: true } } },
        });
        const old = records.find((item) => item.id === input.oldDecisionId);
        const replacement = records.find((item) => item.id === input.replacementDecisionId);
        if (!old || !replacement) throw new AppError("NOT_FOUND", "Decision not found.");
        if (old.version !== input.expectedOldVersion || replacement.version !== input.expectedReplacementVersion) {
          throw new AppError("CONFLICT", "A decision changed. Review both records and try again.");
        }
        if (old.status !== "DECIDED" || old.replacementLink || replacement.status !== "DECIDED" || replacement.predecessorLink || replacement.replacementLink) {
          throw new AppError("CONFLICT", "These decisions can no longer be linked in a linear replacement history.");
        }
        const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
        if (!user) throw new AppError("UNAUTHORIZED", "Authentication required.");
        const label = actorLabel(user);
        const now = new Date();
        const oldUpdate = await tx.decision.updateMany({
          where: { id: old.id, workspaceId: input.workspaceId, status: "DECIDED", deletedAt: null, version: input.expectedOldVersion },
          data: { status: "SUPERSEDED", supersededAt: now, version: { increment: 1 } },
        });
        const replacementUpdate = await tx.decision.updateMany({
          where: { id: replacement.id, workspaceId: input.workspaceId, status: "DECIDED", deletedAt: null, version: input.expectedReplacementVersion },
          data: { version: { increment: 1 } },
        });
        if (oldUpdate.count !== 1 || replacementUpdate.count !== 1) throw new AppError("CONFLICT", "A decision changed. Review both records and try again.");
        const link = await tx.decisionSupersession.create({
          data: { workspaceId: input.workspaceId, previousDecisionId: old.id, replacementDecisionId: replacement.id, reason: input.reason, authorizedById: userId, authorizedByLabel: label, createdAt: now },
        });
        await tx.decisionRevision.createMany({ data: [
          { decisionId: old.id, version: old.version + 1, action: "SUPERSEDE", actorUserId: userId, actorLabel: label, reason: input.reason, question: old.question, outcome: old.outcome, rationale: old.rationale, alternatives: old.alternatives, followUp: old.followUp, fileNames: await fileNames(tx, old.id), status: "SUPERSEDED", createdAt: now },
          { decisionId: replacement.id, version: replacement.version + 1, action: "SUPERSEDE", actorUserId: userId, actorLabel: label, reason: input.reason, question: replacement.question, outcome: replacement.outcome, rationale: replacement.rationale, alternatives: replacement.alternatives, followUp: replacement.followUp, fileNames: await fileNames(tx, replacement.id), status: "DECIDED", createdAt: now },
        ] });
        await recordActivity(tx, {
          workspaceId: input.workspaceId,
          actorUserId: userId,
          actorLabel: label,
          kind: "DECISION_SUPERSEDED",
          subjectType: "DECISION",
          subjectId: old.id,
          summary: { question: old.question, replacementDecisionId: replacement.id, replacementQuestion: replacement.question },
        });
        return { oldDecisionId: old.id, replacementDecisionId: replacement.id, supersessionId: link.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw new AppError("CONFLICT", "A decision changed. Review both records and try again.");
      }
      throw error;
    }
  },

  async softDelete(userId: string, input: DeleteDecisionInput) {
    return prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      // Lock the row so a concurrent supersession or edit is ordered against
      // the deletion; the version predicate below is the final gate.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Decision"
        WHERE "workspaceId" = ${input.workspaceId} AND "id" = ${input.decisionId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (!locked[0]) throw new AppError("NOT_FOUND", "Decision not found.");
      const current = await tx.decision.findUniqueOrThrow({
        where: { id: input.decisionId },
        select: { ...decisionSelect, predecessorLink: { select: { id: true } }, replacementLink: { select: { id: true } } },
      });
      assertCanDeleteDecision(role, current.createdById === userId, current.status);
      if (current.version !== input.expectedVersion) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
      if (current.predecessorLink || current.replacementLink) {
        throw new AppError("CONFLICT", "Decisions in a replacement history cannot be deleted.");
      }
      const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
      if (!user) throw new AppError("UNAUTHORIZED", "Authentication required.");
      const updatedCount = await tx.decision.updateMany({
        where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null, version: input.expectedVersion },
        data: { deletedAt: new Date(), deletedById: userId, version: { increment: 1 } },
      });
      if (updatedCount.count !== 1) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
      await tx.decisionRevision.create({
        data: {
          decisionId: current.id,
          version: current.version + 1,
          action: "SOFT_DELETE",
          actorUserId: userId,
          actorLabel: actorLabel(user),
          question: current.question,
          outcome: current.outcome,
          rationale: current.rationale,
          alternatives: current.alternatives,
          followUp: current.followUp,
          fileNames: await fileNames(tx, current.id),
          status: current.status,
        },
      });
      await recordActivity(tx, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        actorLabel: actorLabel(user),
        kind: "DECISION_DELETED",
        subjectType: "DECISION",
        subjectId: current.id,
        summary: { question: current.question, status: current.status },
      });
      return { id: current.id, workspaceId: input.workspaceId };
    });
  },
};
