import { z } from "zod";

export const listNotificationsInputSchema = z.object({
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(20),
  unreadOnly: z.boolean().default(false),
});

export const markNotificationReadInputSchema = z.object({
  notificationId: z.string().cuid(),
});

export const markAllNotificationsReadInputSchema = z.object({
  workspaceId: z.string().cuid().optional(),
});

export type ListNotificationsInput = z.infer<typeof listNotificationsInputSchema>;
export type MarkNotificationReadInput = z.infer<typeof markNotificationReadInputSchema>;
export type MarkAllNotificationsReadInput = z.infer<typeof markAllNotificationsReadInputSchema>;
