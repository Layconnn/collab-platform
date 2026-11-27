import { prisma } from "../../db/prisma";
import { AppError } from "../../errors/app-error";
import { readUnsubscribeToken } from "./digest.tokens";

// Who wants the daily digest and from which workspaces (daily digest PRD,
// FR-9 to FR-12). No preference row means on; opt-outs are per workspace.

export async function digestSettingsFor(userId: string): Promise<{ enabled: boolean; excludedWorkspaceIds: string[] }> {
  const [preference, optOuts] = await Promise.all([
    prisma.digestPreference.findUnique({ where: { userId }, select: { enabled: true } }),
    prisma.digestWorkspaceOptOut.findMany({ where: { userId }, select: { workspaceId: true } }),
  ]);
  return { enabled: preference?.enabled ?? true, excludedWorkspaceIds: optOuts.map((row) => row.workspaceId) };
}

// Workspaces the member set to notify them of nothing (settings PRD, FR-7).
export async function silencedWorkspaceIds(userId: string): Promise<string[]> {
  const rows = await prisma.workspaceNotificationLevel.findMany({ where: { userId, level: "NONE" }, select: { workspaceId: true } });
  return rows.map((row) => row.workspaceId);
}

async function setEnabled(userId: string, enabled: boolean) {
  await prisma.digestPreference.upsert({ where: { userId }, create: { userId, enabled }, update: { enabled } });
}

async function setWorkspace(userId: string, workspaceId: string, included: boolean) {
  if (included) {
    await prisma.digestWorkspaceOptOut.deleteMany({ where: { userId, workspaceId } });
    return;
  }
  await prisma.digestWorkspaceOptOut.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    create: { userId, workspaceId },
    update: {},
  });
}

export const digestPreferences = {
  async get(userId: string) {
    const [settings, memberships] = await Promise.all([
      digestSettingsFor(userId),
      prisma.workspaceMember.findMany({ where: { userId }, select: { workspace: { select: { id: true, name: true } } }, orderBy: { workspace: { name: "asc" } } }),
    ]);
    const excluded = new Set(settings.excludedWorkspaceIds);
    return {
      enabled: settings.enabled,
      workspaces: memberships.map(({ workspace }) => ({ ...workspace, included: !excluded.has(workspace.id) })),
    };
  },

  async setEnabled(userId: string, enabled: boolean) {
    await setEnabled(userId, enabled);
    return this.get(userId);
  },

  async setWorkspace(userId: string, workspaceId: string, included: boolean) {
    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
    if (!member) throw new AppError("NOT_FOUND", "Workspace not found.");
    await setWorkspace(userId, workspaceId, included);
    return this.get(userId);
  },

  // What a link from an email would do, for the confirmation page.
  async describeToken(token: string) {
    const action = readUnsubscribeToken(token);
    if (!action) throw new AppError("BAD_REQUEST", "This link is not valid any more. Change your email settings after signing in.");
    if (action.scope === "all") return { scope: "all" as const, workspaceName: null };
    const workspace = await prisma.workspace.findUnique({ where: { id: action.workspaceId }, select: { name: true } });
    return { scope: "workspace" as const, workspaceName: workspace?.name ?? "this workspace" };
  },

  // Applies (or undoes) a link's action without signing in (FR-10).
  async applyToken(token: string, undo = false) {
    const action = readUnsubscribeToken(token);
    if (!action) throw new AppError("BAD_REQUEST", "This link is not valid any more. Change your email settings after signing in.");
    if (action.scope === "all") await setEnabled(action.userId, undo);
    else await setWorkspace(action.userId, action.workspaceId, undo);
    return this.describeToken(token);
  },
};
