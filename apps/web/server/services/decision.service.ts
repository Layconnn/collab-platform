import { createHash } from "node:crypto";

import type {
  CreateDecisionInput,
  DecisionByIdInput,
  DecisionRevisionsInput,
  EditDecisionInput,
  FinalizeDecisionInput,
  ListDecisionsInput,
} from "@repo/validators/decision";
import { Prisma, type WorkspaceRole } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { toPaginatedResult } from "../../src/common/utils/pagination";

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
  createdAt: true,
} as const;

type Tx = Prisma.TransactionClient;

async function requireMember(db: Tx | typeof prisma, workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!member) throw new AppError("NOT_FOUND", "Decision not found.");
  return member.role;
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

function isManager(role: string) {
  return role === "OWNER" || role === "ADMIN";
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
            status: created.status,
          },
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
      select: decisionSelect,
    });
    if (!decision) throw new AppError("NOT_FOUND", "Decision not found.");
    return decision;
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
      },
      select: decisionSelect,
      orderBy: { id: "desc" },
      take: input.take + 1,
    });
    return toPaginatedResult(rows, input.take);
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
    return prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      const current = await tx.decision.findFirst({
        where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null },
        select: { status: true, createdById: true, version: true },
      });
      if (!current) throw new AppError("NOT_FOUND", "Decision not found.");
      if (current.status !== "PROPOSED") throw new AppError("CONFLICT", "Finalized decisions cannot be edited.");
      if (current.createdById !== userId && !isManager(role)) {
        throw new AppError("FORBIDDEN", "Only the proposal author or a workspace manager can edit it.");
      }
      if (current.version !== input.expectedVersion) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
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
          status: updated.status,
        },
      });
      return updated;
    });
  },

  async finalize(userId: string, input: FinalizeDecisionInput) {
    return prisma.$transaction(async (tx) => {
      const role = await requireMutationMember(tx, input.workspaceId, userId);
      const current = await tx.decision.findFirst({
        where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null },
        select: { status: true, outcome: true, rationale: true, version: true },
      });
      if (!current) throw new AppError("NOT_FOUND", "Decision not found.");
      if (!isManager(role)) throw new AppError("FORBIDDEN", "Only a workspace manager can finalize decisions.");
      if (current.status !== "PROPOSED") throw new AppError("CONFLICT", "Only proposals can be finalized.");
      if (current.version !== input.expectedVersion) throw new AppError("CONFLICT", "Decision changed. Reload and try again.");
      if (!current.outcome?.trim() || !current.rationale?.trim()) {
        throw new AppError("BAD_REQUEST", "Outcome and rationale are required before finalization.");
      }
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
          question: updated.question,
          outcome: updated.outcome,
          rationale: updated.rationale,
          alternatives: updated.alternatives,
          followUp: updated.followUp,
          status: updated.status,
        },
      });
      return updated;
    });
  },
};
