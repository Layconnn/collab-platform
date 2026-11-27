import {
  usernameSchema,
  type ChangeUsernameInput,
  type UpdateProfileInput,
  type UsernameAvailableInput,
} from "@repo/validators/auth";

import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { invalidateMembershipCaches } from "./workspace.service";

// Your profile in Settings (settings PRD, FR-1 and FR-2): the name teammates
// see and the username they mention you by.

const DAY = 24 * 60 * 60 * 1000;
export const USERNAME_COOLDOWN_DAYS = 30;

// When the person may change their username again; null when they may now.
export function usernameChangeableAt(changedAt: Date | null, now = new Date()): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt.getTime() + USERNAME_COOLDOWN_DAYS * DAY);
  return next > now ? next : null;
}

// Member lists are cached per workspace and show names and usernames.
async function refreshMemberLists(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true } });
  await Promise.all(memberships.map((membership) => invalidateMembershipCaches(membership.workspaceId, userId)));
}

export const profileService = {
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: input.name || null },
      select: { id: true, name: true, username: true },
    });
    await refreshMemberLists(userId);
    return user;
  },

  async usernameAvailable(userId: string, input: UsernameAvailableInput) {
    const parsed = usernameSchema.safeParse(input.username);
    if (!parsed.success) {
      return { available: false as const, reason: "invalid" as const, message: parsed.error.issues[0]?.message ?? "Use 3 to 30 letters, numbers or underscores." };
    }
    const owner = await prisma.user.findUnique({ where: { username: parsed.data }, select: { id: true } });
    if (!owner) return { available: true as const, reason: "free" as const, username: parsed.data };
    return { available: false as const, reason: owner.id === userId ? "yours" as const : "taken" as const, username: parsed.data };
  },

  async changeUsername(userId: string, input: ChangeUsernameInput) {
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, usernameChangedAt: true } });
    if (!current) throw new AppError("UNAUTHORIZED", "Authentication required.");
    if (current.username === input.username) throw new AppError("BAD_REQUEST", "That's already your username.");

    const now = new Date();
    try {
      // The cool-down is part of the update, so two quick changes can't both pass.
      const changed = await prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ usernameChangedAt: null }, { usernameChangedAt: { lte: new Date(now.getTime() - USERNAME_COOLDOWN_DAYS * DAY) } }],
        },
        data: { username: input.username, usernameChangedAt: now },
      });
      if (!changed.count) {
        throw new AppError("FORBIDDEN", `You can change your username once every ${USERNAME_COOLDOWN_DAYS} days.`);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("CONFLICT", "That username is taken.");
      }
      throw error;
    }
    await refreshMemberLists(userId);
    return { username: input.username, usernameChangedAt: now };
  },
};
