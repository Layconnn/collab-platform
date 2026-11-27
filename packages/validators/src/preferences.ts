import { z } from "zod";

// Preferences that follow a person to every device (settings PRD, FR-15, FR-16).
export const THEMES = ["system", "light", "dark"] as const;
export const MOTIONS = ["system", "reduce"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const START_PAGES = ["home", "default", "last"] as const;

const workspaceId = z.string().cuid();

export const updatePreferencesInputSchema = z.object({
  theme: z.enum(THEMES).optional(),
  motion: z.enum(MOTIONS).optional(),
  density: z.enum(DENSITIES).optional(),
  startPage: z.enum(START_PAGES).optional(),
  defaultWorkspaceId: workspaceId.nullable().optional(),
});

export const visitWorkspaceInputSchema = z.object({ workspaceId });

export type Theme = (typeof THEMES)[number];
export type Motion = (typeof MOTIONS)[number];
export type Density = (typeof DENSITIES)[number];
export type StartPage = (typeof START_PAGES)[number];
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
export type VisitWorkspaceInput = z.infer<typeof visitWorkspaceInputSchema>;
