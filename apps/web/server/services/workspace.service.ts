import type { WorkspaceRole } from "../../app/generated/prisma/client";
import type {
  AddWorkspaceMemberInput,
  CreateWorkspaceInput,
  DeleteWorkspaceInput,
  GetWorkspaceByIdInput,
  ListWorkspaceMembersInput,
  ListWorkspacesInput,
  RemoveWorkspaceMemberInput,
  TransferWorkspaceOwnershipInput,
  UpdateWorkspaceInput,
  UpdateWorkspaceMemberRoleInput,
} from "@repo/validators/workspace";
import { Prisma } from "../../app/generated/prisma/client";

import { redisCache } from "../cache/redis";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import {
  recordOwnershipTransfer,
  recordPermissionDenied,
  recordPermissionEscalationAttempt,
  recordWorkspacePermissionAudit,
} from "../observability/security-events";
import {
  WORKSPACE_ACTIONS,
  canPerformWorkspaceAction,
  assertCanAssignRoleOnAddMember,
  assertCanPerformWorkspaceAction,
  assertCanRemoveMember,
  assertCanUpdateMemberRole,
  assertExactlyOneOwner,
} from "./workspace.permissions";
import { toPaginatedResult, type PaginatedResult } from "@/src/common/utils/pagination";

const WORKSPACE_TTL_SECONDS = 120;
const WORKSPACE_LIST_TTL_SECONDS = 60;
const MEMBER_LIST_TTL_SECONDS = 60;

function userWorkspacesCacheKey(userId: string, cursor: string | undefined, take: number): string {
  return `user:${userId}:workspaces:${cursor ?? "start"}:${take}`;
}

function workspaceByIdCacheKey(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

function membersCacheKey(workspaceId: string, cursor: string | undefined, take: number): string {
  return `workspace:${workspaceId}:members:${cursor ?? "start"}:${take}`;
}

type MembershipRoleRecord = {
  role: WorkspaceRole;
};

type WorkspaceOwnerState = {
  ownerId: string;
  members: Array<{
    userId: string;
    role: WorkspaceRole;
  }>;
};

type RequestContext = {
  requestId: string;
};

async function getMembershipRole(workspaceId: string, userId: string): Promise<MembershipRoleRecord | null> {
  return prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    select: {
      role: true,
    },
  });
}

async function requireRoleForAction(
  workspaceId: string,
  userId: string,
  action: (typeof WORKSPACE_ACTIONS)[keyof typeof WORKSPACE_ACTIONS],
  requestId: string,
) {
  const membership = await getMembershipRole(workspaceId, userId);
  if (!membership) {
    await recordPermissionDenied({
      requestId,
      userId,
      workspaceId,
      action,
      reason: "not_workspace_member",
      timestamp: new Date().toISOString(),
    });
    throw new AppError("FORBIDDEN", "You are not a member of this workspace.");
  }

  if (!canPerformWorkspaceAction(membership.role, action)) {
    await recordPermissionDenied({
      requestId,
      userId,
      workspaceId,
      action,
      reason: `role_${membership.role.toLowerCase()}_not_allowed`,
      timestamp: new Date().toISOString(),
    });
    throw new AppError("FORBIDDEN", "Insufficient permissions for this action.");
  }

  return membership;
}

async function readWorkspaceOwnerState(workspaceId: string, dbClient: typeof prisma): Promise<WorkspaceOwnerState> {
  const workspace = await dbClient.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      ownerId: true,
      members: {
        where: { role: "OWNER" },
        select: {
          userId: true,
          role: true,
        },
      },
    },
  });

  if (!workspace) {
    throw new AppError("NOT_FOUND", "Workspace not found.");
  }

  return workspace;
}

async function enforceOwnerInvariant(workspaceId: string, dbClient: typeof prisma): Promise<void> {
  const ownerState = await readWorkspaceOwnerState(workspaceId, dbClient);
  assertExactlyOneOwner(ownerState.members.map((member) => member.role));

  if (ownerState.members[0]?.userId !== ownerState.ownerId) {
    throw new AppError("INTERNAL", "Workspace owner invariant violated.");
  }
}

async function invalidateWorkspaceCache(workspaceId: string): Promise<void> {
  await redisCache.del(workspaceByIdCacheKey(workspaceId));
  await redisCache.delByPattern(`workspace:${workspaceId}:members:*`);
}

async function invalidateUserWorkspaceLists(userId: string): Promise<void> {
  await redisCache.delByPattern(`user:${userId}:workspaces:*`);
}

export const workspaceService = {
  async create(userId: string, input: CreateWorkspaceInput, context: RequestContext) {
    try {
      const workspace = await prisma.$transaction(async (tx) => {
        const createdWorkspace = await tx.workspace.create({
          data: {
            name: input.name,
            slug: input.slug,
            ownerId: userId,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId: createdWorkspace.id,
            userId,
            role: "OWNER",
          },
        });

        await enforceOwnerInvariant(createdWorkspace.id, tx as unknown as typeof prisma);
        return createdWorkspace;
      });

      await invalidateUserWorkspaceLists(userId);
      await redisCache.setJSON(workspaceByIdCacheKey(workspace.id), workspace, WORKSPACE_TTL_SECONDS);

      return workspace;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("CONFLICT", "Workspace slug is already in use.", { cause: error });
      }
      throw error;
    }
  },

  async listForUser(userId: string, input: ListWorkspacesInput, context: RequestContext) {
    const cacheKey = userWorkspacesCacheKey(userId, input.cursor, input.take);
    const cached = await redisCache.getJSON<
      PaginatedResult<{ id: string; workspaceId: string; name: string; slug: string; role: WorkspaceRole; createdAt: Date }>
    >(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await prisma.workspaceMember.findMany({
      where: {
        userId,
      },
      take: input.take + 1,
      skip: input.cursor ? 1 : 0,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    const flattened = rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace.id,
      role: row.role,
      createdAt: row.createdAt,
      name: row.workspace.name,
      slug: row.workspace.slug,
    }));

    const paginated = toPaginatedResult(flattened, input.take);
    await redisCache.setJSON(cacheKey, paginated, WORKSPACE_LIST_TTL_SECONDS);

    return paginated;
  },

  async getById(userId: string, input: GetWorkspaceByIdInput, context: RequestContext) {
    await requireRoleForAction(input.workspaceId, userId, WORKSPACE_ACTIONS.READ, context.requestId);

    const cacheKey = workspaceByIdCacheKey(input.workspaceId);
    const cached = await redisCache.getJSON<{
      id: string;
      name: string;
      slug: string;
      ownerId: string;
      createdAt: Date;
      updatedAt: Date;
    }>(cacheKey);
    if (cached) {
      return cached;
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!workspace) {
      throw new AppError("NOT_FOUND", "Workspace not found.");
    }

    await redisCache.setJSON(cacheKey, workspace, WORKSPACE_TTL_SECONDS);
    return workspace;
  },

  async update(userId: string, input: UpdateWorkspaceInput, context: RequestContext) {
    await requireRoleForAction(input.workspaceId, userId, WORKSPACE_ACTIONS.UPDATE_WORKSPACE, context.requestId);

    try {
      const updated = await prisma.workspace.update({
        where: { id: input.workspaceId },
        data: {
          name: input.name,
          slug: input.slug,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await invalidateWorkspaceCache(input.workspaceId);
      await invalidateUserWorkspaceLists(userId);

      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("CONFLICT", "Workspace slug is already in use.", { cause: error });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError("NOT_FOUND", "Workspace not found.", { cause: error });
      }
      throw error;
    }
  },

  async remove(userId: string, input: DeleteWorkspaceInput, context: RequestContext) {
    await requireRoleForAction(input.workspaceId, userId, WORKSPACE_ACTIONS.TRANSFER_OWNERSHIP, context.requestId);

    try {
      await prisma.workspace.delete({
        where: { id: input.workspaceId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError("NOT_FOUND", "Workspace not found.", { cause: error });
      }
      throw error;
    }

    await invalidateWorkspaceCache(input.workspaceId);
    await invalidateUserWorkspaceLists(userId);

    return { success: true as const };
  },

  async listMembers(userId: string, input: ListWorkspaceMembersInput, context: RequestContext) {
    await requireRoleForAction(input.workspaceId, userId, WORKSPACE_ACTIONS.LIST_MEMBERS, context.requestId);

    const cacheKey = membersCacheKey(input.workspaceId, input.cursor, input.take);
    const cached = await redisCache.getJSON<
      PaginatedResult<{ id: string; userId: string; role: WorkspaceRole; createdAt: Date; user: { id: string; email: string; name: string | null } }>
    >(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      take: input.take + 1,
      skip: input.cursor ? 1 : 0,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    const paginated = toPaginatedResult(rows, input.take);
    await redisCache.setJSON(cacheKey, paginated, MEMBER_LIST_TTL_SECONDS);

    return paginated;
  },

  async addMember(actorUserId: string, input: AddWorkspaceMemberInput, context: RequestContext) {
    const actor = await requireRoleForAction(input.workspaceId, actorUserId, WORKSPACE_ACTIONS.ADD_MEMBER, context.requestId);
    if (input.role === "OWNER") {
      await recordPermissionEscalationAttempt({
        requestId: context.requestId,
        userId: actorUserId,
        workspaceId: input.workspaceId,
        attemptedRole: "OWNER",
        timestamp: new Date().toISOString(),
      });
    }
    assertCanAssignRoleOnAddMember(actor.role, input.role);

    try {
      const membership = await prisma.workspaceMember.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          role: input.role,
        },
        select: {
          id: true,
          workspaceId: true,
          userId: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await enforceOwnerInvariant(input.workspaceId, prisma);
      await invalidateWorkspaceCache(input.workspaceId);
      await invalidateUserWorkspaceLists(input.userId);
      await invalidateUserWorkspaceLists(actorUserId);
      await recordWorkspacePermissionAudit({
        operation: "addMember",
        requestId: context.requestId,
        actorUserId,
        workspaceId: input.workspaceId,
        targetUserId: input.userId,
        oldRole: null,
        newRole: input.role,
        timestamp: new Date().toISOString(),
      });

      return membership;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("CONFLICT", "User is already a member of this workspace.", { cause: error });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new AppError("BAD_REQUEST", "User or workspace does not exist.", { cause: error });
      }
      throw error;
    }
  },

  async updateMemberRole(actorUserId: string, input: UpdateWorkspaceMemberRoleInput, context: RequestContext) {
    const actor = await requireRoleForAction(
      input.workspaceId,
      actorUserId,
      WORKSPACE_ACTIONS.UPDATE_MEMBER_ROLE,
      context.requestId,
    );

    const targetMembership = await getMembershipRole(input.workspaceId, input.userId);
    if (!targetMembership) {
      throw new AppError("NOT_FOUND", "Workspace member not found.");
    }

    if (input.role === "OWNER") {
      await recordPermissionEscalationAttempt({
        requestId: context.requestId,
        userId: actorUserId,
        workspaceId: input.workspaceId,
        attemptedRole: "OWNER",
        timestamp: new Date().toISOString(),
      });
    }
    assertCanUpdateMemberRole(actor.role, targetMembership.role, input.role);

    const updated = await prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
      },
      data: {
        role: input.role,
      },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        role: true,
        updatedAt: true,
      },
    });

    await enforceOwnerInvariant(input.workspaceId, prisma);
    await invalidateWorkspaceCache(input.workspaceId);
    await invalidateUserWorkspaceLists(input.userId);
    await invalidateUserWorkspaceLists(actorUserId);
    await recordWorkspacePermissionAudit({
      operation: "updateMemberRole",
      requestId: context.requestId,
      actorUserId,
      workspaceId: input.workspaceId,
      targetUserId: input.userId,
      oldRole: targetMembership.role,
      newRole: input.role,
      timestamp: new Date().toISOString(),
    });

    return updated;
  },

  async removeMember(actorUserId: string, input: RemoveWorkspaceMemberInput, context: RequestContext) {
    const actor = await requireRoleForAction(
      input.workspaceId,
      actorUserId,
      WORKSPACE_ACTIONS.REMOVE_MEMBER,
      context.requestId,
    );
    const targetMembership = await getMembershipRole(input.workspaceId, input.userId);

    if (!targetMembership) {
      throw new AppError("NOT_FOUND", "Workspace member not found.");
    }

    assertCanRemoveMember(actor.role, targetMembership.role);

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
      },
    });

    await enforceOwnerInvariant(input.workspaceId, prisma);
    await invalidateWorkspaceCache(input.workspaceId);
    await invalidateUserWorkspaceLists(input.userId);
    await invalidateUserWorkspaceLists(actorUserId);
    await recordWorkspacePermissionAudit({
      operation: "removeMember",
      requestId: context.requestId,
      actorUserId,
      workspaceId: input.workspaceId,
      targetUserId: input.userId,
      oldRole: targetMembership.role,
      newRole: null,
      timestamp: new Date().toISOString(),
    });

    return { success: true as const };
  },

  async transferOwnership(actorUserId: string, input: TransferWorkspaceOwnershipInput, context: RequestContext) {
    const actor = await requireRoleForAction(
      input.workspaceId,
      actorUserId,
      WORKSPACE_ACTIONS.TRANSFER_OWNERSHIP,
      context.requestId,
    );

    if (actor.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "Only workspace owner can transfer ownership.");
    }

    if (actorUserId === input.newOwnerUserId) {
      throw new AppError("BAD_REQUEST", "New owner must be different from current owner.");
    }

    const targetMembership = await getMembershipRole(input.workspaceId, input.newOwnerUserId);
    if (!targetMembership) {
      throw new AppError("NOT_FOUND", "Target member not found in workspace.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: actorUserId,
          },
        },
        data: {
          role: "ADMIN",
        },
      });

      await tx.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.newOwnerUserId,
          },
        },
        data: {
          role: "OWNER",
        },
      });

      await tx.workspace.update({
        where: { id: input.workspaceId },
        data: { ownerId: input.newOwnerUserId },
      });

      await enforceOwnerInvariant(input.workspaceId, tx as unknown as typeof prisma);
    });

    await invalidateWorkspaceCache(input.workspaceId);
    await invalidateUserWorkspaceLists(actorUserId);
    await invalidateUserWorkspaceLists(input.newOwnerUserId);
    await recordWorkspacePermissionAudit({
      operation: "transferOwnership",
      requestId: context.requestId,
      actorUserId,
      workspaceId: input.workspaceId,
      targetUserId: input.newOwnerUserId,
      oldRole: targetMembership.role,
      newRole: "OWNER",
      timestamp: new Date().toISOString(),
    });
    await recordOwnershipTransfer({
      requestId: context.requestId,
      actorUserId,
      workspaceId: input.workspaceId,
      fromOwnerUserId: actorUserId,
      toOwnerUserId: input.newOwnerUserId,
      timestamp: new Date().toISOString(),
    });

    return { success: true as const };
  },
};
