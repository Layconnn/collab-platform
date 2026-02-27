import {
  addWorkspaceMemberInputSchema,
  createWorkspaceInputSchema,
  deleteWorkspaceInputSchema,
  getWorkspaceByIdInputSchema,
  listWorkspaceMembersInputSchema,
  listWorkspacesInputSchema,
  removeWorkspaceMemberInputSchema,
  transferWorkspaceOwnershipInputSchema,
  updateWorkspaceInputSchema,
  updateWorkspaceMemberRoleInputSchema,
} from "@repo/validators/workspace";

import { toTRPCError } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { workspaceService } from "../../services/workspace.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const execute = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    throw toTRPCError(error);
  }
};

const getByIdRateLimit = createRateLimitGuard({
  routeKey: "workspace.getById",
  limit: 60,
  windowSeconds: 60,
});

const addMemberRateLimit = createRateLimitGuard({
  routeKey: "workspace.addMember",
  limit: 20,
  windowSeconds: 60,
});

const updateMemberRoleRateLimit = createRateLimitGuard({
  routeKey: "workspace.updateMemberRole",
  limit: 20,
  windowSeconds: 60,
});

const removeMemberRateLimit = createRateLimitGuard({
  routeKey: "workspace.removeMember",
  limit: 20,
  windowSeconds: 60,
});

const getByIdProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await getByIdRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const addMemberProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await addMemberRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const updateMemberRoleProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await updateMemberRoleRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const removeMemberProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await removeMemberRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

export const workspaceRouter = createTRPCRouter({
  create: protectedProcedure.input(createWorkspaceInputSchema).mutation(({ ctx, input }) =>
    execute(() => workspaceService.create(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  listForUser: protectedProcedure.input(listWorkspacesInputSchema).query(({ ctx, input }) =>
    execute(() => workspaceService.listForUser(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  getById: getByIdProcedure.input(getWorkspaceByIdInputSchema).query(({ ctx, input }) =>
    execute(() => workspaceService.getById(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  update: protectedProcedure.input(updateWorkspaceInputSchema).mutation(({ ctx, input }) =>
    execute(() => workspaceService.update(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  remove: protectedProcedure.input(deleteWorkspaceInputSchema).mutation(({ ctx, input }) =>
    execute(() => workspaceService.remove(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  listMembers: protectedProcedure.input(listWorkspaceMembersInputSchema).query(({ ctx, input }) =>
    execute(() => workspaceService.listMembers(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  addMember: addMemberProcedure.input(addWorkspaceMemberInputSchema).mutation(({ ctx, input }) =>
    execute(() => workspaceService.addMember(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  updateMemberRole: updateMemberRoleProcedure.input(updateWorkspaceMemberRoleInputSchema).mutation(({ ctx, input }) =>
    execute(() => workspaceService.updateMemberRole(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  removeMember: removeMemberProcedure.input(removeWorkspaceMemberInputSchema).mutation(({ ctx, input }) =>
    execute(() => workspaceService.removeMember(ctx.user.id, input, { requestId: ctx.requestId })),
  ),

  transferOwnership: protectedProcedure.input(transferWorkspaceOwnershipInputSchema).mutation(({ ctx, input }) =>
    execute(() => workspaceService.transferOwnership(ctx.user.id, input, { requestId: ctx.requestId })),
  ),
});
