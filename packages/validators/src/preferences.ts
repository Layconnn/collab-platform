import { z } from "zod";

// Preferences that follow a person to every device (settings PRD, FR-15, FR-16).
export const THEMES = ["system", "light", "dark"] as const;
export const MOTIONS = ["system", "reduce"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const START_PAGES = ["home", "default", "last"] as const;

const workspaceId = z.string().cuid();

// Notifications (settings PRD, FR-4 to FR-7).
export const NOTIFICATION_KINDS = ["DISCUSSION_CREATED", "COMMENT_CREATED", "MENTION", "REVIEW_REQUESTED", "REVIEW_RESPONDED", "INVITE_ACCEPTED"] as const;
export const NOTIFICATION_LEVELS = ["ALL", "INVOLVED", "NONE"] as const;

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export const timeZoneSchema = z.string().min(1).max(64).refine(isTimeZone, "Choose a time zone from the list.");

export const updatePreferencesInputSchema = z.object({
  theme: z.enum(THEMES).optional(),
  motion: z.enum(MOTIONS).optional(),
  density: z.enum(DENSITIES).optional(),
  startPage: z.enum(START_PAGES).optional(),
  defaultWorkspaceId: workspaceId.nullable().optional(),
  mutedKinds: z.array(z.enum(NOTIFICATION_KINDS)).max(NOTIFICATION_KINDS.length).optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  timeZone: timeZoneSchema.optional(),
});

export const setNotificationLevelInputSchema = z.object({
  workspaceId,
  level: z.enum(NOTIFICATION_LEVELS),
});

export const visitWorkspaceInputSchema = z.object({ workspaceId });

export type Theme = (typeof THEMES)[number];
export type Motion = (typeof MOTIONS)[number];
export type Density = (typeof DENSITIES)[number];
export type StartPage = (typeof START_PAGES)[number];
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];
export type SetNotificationLevelInput = z.infer<typeof setNotificationLevelInputSchema>;
export type VisitWorkspaceInput = z.infer<typeof visitWorkspaceInputSchema>;
