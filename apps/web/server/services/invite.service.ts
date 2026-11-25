import { createHash, randomBytes } from "node:crypto";

import { INVITE_EXPIRY_DAYS, MAX_ACTIVE_INVITES, type CreateInviteInput } from "@repo/validators/workspace";
import { Prisma, type WorkspaceRole } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { activityActorLabel, memberLabel, recordActivity } from "./activity.service";
import { notificationService } from "./notification.service";
import { requireWorkspaceAction } from "./workspace.access";
import { assertCanAssignRoleOnAddMember, WORKSPACE_ACTIONS } from "./workspace.permissions";
import { invalidateMembershipCaches } from "./workspace.service";

// Invite links (invite links PRD): managers create, list and revoke them;
// anyone with a working link can see where it leads and join.

const DAY_MS = 24 * 60 * 60 * 1000;
// Expired and used-up links stay listed this long, marked as such (FR-3).
const LIST_ENDED_FOR_MS = 7 * DAY_MS;
const NOT_WORKING = "This invite link no longer works. Ask the person who shared it for a new one.";

type RequestContext = { requestId: string };
export type InviteStatus = "ACTIVE" | "EXPIRED" | "USED_UP";

export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Links that can still be used: the database form of "working".
const workingWhere = (now: Date): Prisma.WorkspaceInviteWhereInput => ({ revokedAt: null, expiresAt: { gt: now } });
const usedUp = (invite: { uses: number; maxUses: number | null }) => invite.maxUses !== null && invite.uses >= invite.maxUses;

function statusOf(invite: { uses: number; maxUses: number | null; expiresAt: Date }, now: Date): InviteStatus {
  if (usedUp(invite)) return "USED_UP";
  return invite.expiresAt > now ? "ACTIVE" : "EXPIRED";
}

const inviteSelect = {
  id: true, role: true, name: true, maxUses: true, uses: true, expiresAt: true, createdAt: true,
  createdBy: { select: { name: true, username: true } },
} as const;

type InviteRow = Prisma.WorkspaceInviteGetPayload<{ select: typeof inviteSelect }>;

const toPublic = (invite: InviteRow, now: Date) => ({
  id: invite.id,
  role: invite.role as "MEMBER" | "ADMIN",
  name: invite.name,
  maxUses: invite.maxUses,
  uses: invite.uses,
  expiresAt: invite.expiresAt,
  createdAt: invite.createdAt,
  createdBy: invite.createdBy ? activityActorLabel(invite.createdBy) : "A former member",
  status: statusOf(invite, now),
});

export const inviteService = {
  // FR-1, FR-2, FR-5: the token is returned here and never again.
  async create(userId: string, input: CreateInviteInput, context: RequestContext, now = new Date()) {
    const role = await requireWorkspaceAction(input.workspaceId, userId, WORKSPACE_ACTIONS.ADD_MEMBER, context.requestId);
    assertCanAssignRoleOnAddMember(role, input.role);
    if (!(INVITE_EXPIRY_DAYS as readonly number[]).includes(input.expiresInDays)) throw new AppError("BAD_REQUEST", "Choose 1, 7 or 30 days.");
    const token = randomBytes(32).toString("base64url");

    const invite = await prisma.$transaction(async (tx) => {
      // One at a time per workspace, so the active-link limit holds.
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${input.workspaceId} FOR NO KEY UPDATE`;
      const open = await tx.workspaceInvite.findMany({ where: { workspaceId: input.workspaceId, ...workingWhere(now) }, select: { uses: true, maxUses: true } });
      if (open.filter((row) => !usedUp(row)).length >= MAX_ACTIVE_INVITES) {
        throw new AppError("BAD_REQUEST", `A workspace can have up to ${MAX_ACTIVE_INVITES} active invite links. Revoke one first.`);
      }
      return tx.workspaceInvite.create({
        data: {
          workspaceId: input.workspaceId, createdById: userId, tokenHash: hashInviteToken(token), role: input.role,
          name: input.name ?? null, maxUses: input.maxUses ?? null, expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
        },
        select: inviteSelect,
      });
    });
    return { invite: toPublic(invite, now), token, path: `/join/${token}` };
  },

  // FR-3: working links, and ended ones for a week; never revoked ones.
  async list(userId: string, input: { workspaceId: string }, context: RequestContext, now = new Date()) {
    await requireWorkspaceAction(input.workspaceId, userId, WORKSPACE_ACTIONS.ADD_MEMBER, context.requestId);
    const rows = await prisma.workspaceInvite.findMany({
      where: { workspaceId: input.workspaceId, revokedAt: null, expiresAt: { gt: new Date(now.getTime() - LIST_ENDED_FOR_MS) } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: inviteSelect,
    });
    return { items: rows.map((row) => toPublic(row, now)) };
  },

  // FR-4: immediate; revoking twice is fine.
  async revoke(userId: string, input: { workspaceId: string; inviteId: string }, context: RequestContext, now = new Date()) {
    await requireWorkspaceAction(input.workspaceId, userId, WORKSPACE_ACTIONS.ADD_MEMBER, context.requestId);
    const invite = await prisma.workspaceInvite.findFirst({ where: { id: input.inviteId, workspaceId: input.workspaceId }, select: { id: true } });
    if (!invite) throw new AppError("NOT_FOUND", "Invite link not found.");
    await prisma.workspaceInvite.updateMany({ where: { id: invite.id, revokedAt: null }, data: { revokedAt: now } });
    return { revoked: true };
  },

  // FR-6, FR-11: where a working link leads. Anything else is one generic
  // answer that says nothing about the workspace.
  async describe(token: string, viewerUserId: string | null, now = new Date()) {
    const invite = await prisma.workspaceInvite.findFirst({
      where: { tokenHash: hashInviteToken(token), ...workingWhere(now) },
      select: { role: true, uses: true, maxUses: true, workspace: { select: { id: true, name: true } }, createdBy: { select: { name: true, username: true } } },
    });
    if (!invite || usedUp(invite)) throw new AppError("NOT_FOUND", NOT_WORKING);
    const alreadyMember = viewerUserId
      ? Boolean(await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invite.workspace.id, userId: viewerUserId } }, select: { id: true } }))
      : false;
    return {
      workspace: invite.workspace,
      invitedBy: invite.createdBy ? activityActorLabel(invite.createdBy) : null,
      role: invite.role as "MEMBER" | "ADMIN",
      alreadyMember,
    };
  },

  // FR-8, FR-9, FR-10: joins under a lock on the link, so a link's last use
  // admits one person; members already in the workspace keep their role.
  async join(userId: string, token: string, context: RequestContext, now = new Date()) {
    const tokenHash = hashInviteToken(token);
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; workspaceId: string; role: WorkspaceRole; uses: number; maxUses: number | null; createdById: string | null; name: string | null }>>`
        SELECT "id", "workspaceId", "role", "uses", "maxUses", "createdById", "name" FROM "WorkspaceInvite"
        WHERE "tokenHash" = ${tokenHash} AND "revokedAt" IS NULL AND "expiresAt" > ${now}::timestamp
        FOR UPDATE
      `;
      const invite = locked[0];
      if (!invite || usedUp(invite)) throw new AppError("NOT_FOUND", NOT_WORKING);
      const existing = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } }, select: { id: true } });
      if (existing) return { workspaceId: invite.workspaceId, joined: false as const, invite };
      await tx.workspaceMember.create({ data: { workspaceId: invite.workspaceId, userId, role: invite.role } });
      await tx.workspaceInvite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
      await tx.workspaceInviteUse.create({ data: { inviteId: invite.id, userId } });
      const label = await memberLabel(tx, userId);
      await recordActivity(tx, {
        workspaceId: invite.workspaceId,
        actorUserId: userId,
        actorLabel: label,
        kind: "MEMBER_ADDED",
        subjectType: "MEMBER",
        subjectId: userId,
        summary: { member: label, role: invite.role, via: "invite", ...(invite.name ? { inviteName: invite.name } : {}) },
      });
      return { workspaceId: invite.workspaceId, joined: true as const, invite, label };
    }).catch((error: unknown) => {
      // Two tabs joining at once: the second finds the membership the first made.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    });
    if (!result) {
      const invite = await prisma.workspaceInvite.findUnique({ where: { tokenHash }, select: { workspaceId: true } });
      if (!invite) throw new AppError("NOT_FOUND", NOT_WORKING);
      return { workspaceId: invite.workspaceId, joined: false };
    }
    if (result.joined) {
      await invalidateMembershipCaches(result.workspaceId, userId);
      if (result.invite.createdById) {
        const workspace = await prisma.workspace.findUnique({ where: { id: result.workspaceId }, select: { name: true } });
        await notificationService.enqueueInviteAccepted({
          requestId: context.requestId,
          actorUserId: userId,
          workspaceId: result.workspaceId,
          inviteId: result.invite.id,
          recipientUserId: result.invite.createdById,
          message: `${result.label} joined ${workspace?.name ?? "your workspace"} with your invite link.`,
        }).catch((error: unknown) => {
          // Joining succeeds even if the notification cannot be queued.
          console.error(JSON.stringify({ level: "ERROR", event: "notification.enqueue.failed", requestId: context.requestId, workspaceId: result.workspaceId, error: String(error) }));
        });
      }
    }
    return { workspaceId: result.workspaceId, joined: result.joined };
  },
};
