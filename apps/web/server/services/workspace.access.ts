import type { WorkspaceRole } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { recordPermissionDenied } from "../observability/security-events";
import { canPerformWorkspaceAction, type WorkspaceAction } from "./workspace.permissions";

type DenialRecorder = typeof recordPermissionDenied;

export async function getMembershipRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const membership = await prisma.workspaceMember.findUnique({
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
  return membership?.role ?? null;
}

// Loads the caller's role and enforces the permission matrix. Each domain passes
// its own denial recorder so its security counters keep their meaning.
export async function requireWorkspaceAction(
  workspaceId: string,
  userId: string,
  action: WorkspaceAction,
  requestId: string,
  recordDenied: DenialRecorder = recordPermissionDenied,
): Promise<WorkspaceRole> {
  const role = await getMembershipRole(workspaceId, userId);
  if (!role) {
    await recordDenied({
      requestId,
      userId,
      workspaceId,
      action,
      reason: "not_workspace_member",
      timestamp: new Date().toISOString(),
    });
    throw new AppError("FORBIDDEN", "You are not a member of this workspace.");
  }

  if (!canPerformWorkspaceAction(role, action)) {
    await recordDenied({
      requestId,
      userId,
      workspaceId,
      action,
      reason: `role_${role.toLowerCase()}_not_allowed`,
      timestamp: new Date().toISOString(),
    });
    throw new AppError("FORBIDDEN", "Insufficient permissions for this action.");
  }

  return role;
}
