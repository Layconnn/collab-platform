import type { NotificationKind, SetNotificationLevelInput, UpdatePreferencesInput, VisitWorkspaceInput } from "@repo/validators/preferences";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { getMembershipRole } from "./workspace.access";

// Preferences that follow a person to every device (settings PRD, FR-15,
// FR-16). A person without a saved row gets the defaults; `saved` tells the
// browser whether to adopt the account's values or upload its own.

// The digest's first schedule was 06:00 UTC; people who never chose keep it.
const DEFAULTS = {
  theme: "system", motion: "system", density: "comfortable", startPage: "home", defaultWorkspaceId: null, lastWorkspaceId: null,
  mutedKinds: [] as NotificationKind[], digestHour: 6, timeZone: "UTC",
} as const;

const select = {
  theme: true, motion: true, density: true, startPage: true, defaultWorkspaceId: true, lastWorkspaceId: true,
  mutedKinds: true, digestHour: true, timeZone: true,
} as const;

async function requireMember(workspaceId: string, userId: string) {
  if (!(await getMembershipRole(workspaceId, userId))) throw new AppError("NOT_FOUND", "Workspace not found.");
}

export const preferencesService = {
  async get(userId: string) {
    const row = await prisma.userPreference.findUnique({ where: { userId }, select });
    return row ? { ...row, saved: true } : { ...DEFAULTS, saved: false };
  },

  async update(userId: string, input: UpdatePreferencesInput) {
    if (input.defaultWorkspaceId) await requireMember(input.defaultWorkspaceId, userId);
    const row = await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: input,
      select,
    });
    return { ...row, saved: true };
  },

  // Each workspace with how much it may notify you (FR-5). No row is "ALL".
  async notificationLevels(userId: string) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true, workspace: { select: { name: true } }, notificationLevel: { select: { level: true } } },
      orderBy: { workspace: { name: "asc" } },
    });
    return memberships.map((row) => ({ workspaceId: row.workspaceId, name: row.workspace.name, level: row.notificationLevel?.level ?? "ALL" }));
  },

  async setNotificationLevel(userId: string, input: SetNotificationLevelInput) {
    await requireMember(input.workspaceId, userId);
    if (input.level === "ALL") {
      await prisma.workspaceNotificationLevel.deleteMany({ where: { workspaceId: input.workspaceId, userId } });
    } else {
      await prisma.workspaceNotificationLevel.upsert({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId } },
        create: { workspaceId: input.workspaceId, userId, level: input.level },
        update: { level: input.level },
      });
    }
    return { workspaceId: input.workspaceId, level: input.level };
  },

  // Remembered only when the person opens Commons on their last workspace.
  async visit(userId: string, input: VisitWorkspaceInput) {
    await requireMember(input.workspaceId, userId);
    await prisma.userPreference.updateMany({
      // "Not this workspace" must include "none yet": NULL never matches a NOT.
      where: { userId, startPage: "last", OR: [{ lastWorkspaceId: null }, { lastWorkspaceId: { not: input.workspaceId } }] },
      data: { lastWorkspaceId: input.workspaceId },
    });
    return { ok: true as const };
  },

  // Where Commons opens after signing in (FR-15). A workspace the person has
  // since left falls back to Home.
  async startPath(userId: string) {
    const row = await prisma.userPreference.findUnique({ where: { userId }, select: { startPage: true, defaultWorkspaceId: true, lastWorkspaceId: true } });
    const target = row?.startPage === "default" ? row.defaultWorkspaceId : row?.startPage === "last" ? row.lastWorkspaceId : null;
    if (target && await getMembershipRole(target, userId)) return `/workspace/${target}`;
    return "/workspace";
  },
};
