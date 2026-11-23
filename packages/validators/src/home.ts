import { z } from "zod";

export const needsYouInputSchema = z.object({
  // Home shows 20 items with a total; "Show all" asks for the rest.
  all: z.boolean().default(false),
});

export const dismissNeedsInputSchema = z.object({
  notificationIds: z.array(z.string().cuid()).min(1).max(100),
});

export type NeedsYouInput = z.infer<typeof needsYouInputSchema>;
export type DismissNeedsInput = z.infer<typeof dismissNeedsInputSchema>;
