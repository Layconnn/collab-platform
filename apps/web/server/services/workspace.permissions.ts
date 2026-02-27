import type { WorkspaceRole } from "../../app/generated/prisma/client";

import { AppError } from "../errors/app-error";

export const WORKSPACE_ACTIONS = {
  READ: "read",
  CREATE_DISCUSSION: "create_discussion",
  READ_DISCUSSION: "read_discussion",
  MANAGE_DISCUSSION: "manage_discussion",
  CREATE_COMMENT: "create_comment",
  DELETE_COMMENT: "delete_comment",
  MANAGE_COMMENT: "manage_comment",
  UPDATE_WORKSPACE: "update_workspace",
  LIST_MEMBERS: "list_members",
  ADD_MEMBER: "add_member",
  UPDATE_MEMBER_ROLE: "update_member_role",
  REMOVE_MEMBER: "remove_member",
  TRANSFER_OWNERSHIP: "transfer_ownership",
} as const;

export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[keyof typeof WORKSPACE_ACTIONS];

export const WORKSPACE_PERMISSIONS: Record<WorkspaceRole, ReadonlyArray<WorkspaceAction>> = {
  MEMBER: [
    WORKSPACE_ACTIONS.READ,
    WORKSPACE_ACTIONS.CREATE_DISCUSSION,
    WORKSPACE_ACTIONS.READ_DISCUSSION,
    WORKSPACE_ACTIONS.CREATE_COMMENT,
    WORKSPACE_ACTIONS.DELETE_COMMENT,
  ],
  ADMIN: [
    WORKSPACE_ACTIONS.READ,
    WORKSPACE_ACTIONS.CREATE_DISCUSSION,
    WORKSPACE_ACTIONS.READ_DISCUSSION,
    WORKSPACE_ACTIONS.MANAGE_DISCUSSION,
    WORKSPACE_ACTIONS.CREATE_COMMENT,
    WORKSPACE_ACTIONS.DELETE_COMMENT,
    WORKSPACE_ACTIONS.MANAGE_COMMENT,
    WORKSPACE_ACTIONS.UPDATE_WORKSPACE,
    WORKSPACE_ACTIONS.LIST_MEMBERS,
    WORKSPACE_ACTIONS.ADD_MEMBER,
    WORKSPACE_ACTIONS.REMOVE_MEMBER,
  ],
  OWNER: [
    WORKSPACE_ACTIONS.READ,
    WORKSPACE_ACTIONS.CREATE_DISCUSSION,
    WORKSPACE_ACTIONS.READ_DISCUSSION,
    WORKSPACE_ACTIONS.MANAGE_DISCUSSION,
    WORKSPACE_ACTIONS.CREATE_COMMENT,
    WORKSPACE_ACTIONS.DELETE_COMMENT,
    WORKSPACE_ACTIONS.MANAGE_COMMENT,
    WORKSPACE_ACTIONS.UPDATE_WORKSPACE,
    WORKSPACE_ACTIONS.LIST_MEMBERS,
    WORKSPACE_ACTIONS.ADD_MEMBER,
    WORKSPACE_ACTIONS.UPDATE_MEMBER_ROLE,
    WORKSPACE_ACTIONS.REMOVE_MEMBER,
    WORKSPACE_ACTIONS.TRANSFER_OWNERSHIP,
  ],
};

export function canPerformWorkspaceAction(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return WORKSPACE_PERMISSIONS[role].includes(action);
}

export function assertCanPerformWorkspaceAction(role: WorkspaceRole, action: WorkspaceAction): void {
  if (!canPerformWorkspaceAction(role, action)) {
    throw new AppError("FORBIDDEN", "Insufficient permissions for this action.");
  }
}

export function assertCanAssignRoleOnAddMember(actorRole: WorkspaceRole, assignedRole: WorkspaceRole): void {
  assertCanPerformWorkspaceAction(actorRole, WORKSPACE_ACTIONS.ADD_MEMBER);

  if (assignedRole === "OWNER") {
    throw new AppError("BAD_REQUEST", "Use transferOwnership endpoint to assign OWNER role.");
  }
}

export function assertCanUpdateMemberRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
): void {
  assertCanPerformWorkspaceAction(actorRole, WORKSPACE_ACTIONS.UPDATE_MEMBER_ROLE);

  if (nextRole === "OWNER") {
    throw new AppError("BAD_REQUEST", "Use transferOwnership endpoint to assign OWNER role.");
  }

  if (targetRole === "OWNER") {
    throw new AppError("BAD_REQUEST", "Cannot update OWNER role from this endpoint.");
  }
}

export function assertCanRemoveMember(actorRole: WorkspaceRole, targetRole: WorkspaceRole): void {
  assertCanPerformWorkspaceAction(actorRole, WORKSPACE_ACTIONS.REMOVE_MEMBER);

  if (targetRole === "OWNER") {
    throw new AppError("BAD_REQUEST", "Workspace owner cannot be removed.");
  }

  if (actorRole === "ADMIN" && targetRole === "ADMIN") {
    throw new AppError("FORBIDDEN", "Admins cannot remove other admins.");
  }
}

export function assertExactlyOneOwner(roles: WorkspaceRole[]): void {
  const ownerCount = roles.filter((role) => role === "OWNER").length;
  if (ownerCount !== 1) {
    throw new AppError("INTERNAL", "Workspace owner invariant violated.");
  }
}
