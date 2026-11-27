import { z } from "zod";

// Sessions and the security log (settings PRD, FR-8 to FR-10).
export const signOutSessionInputSchema = z.object({ sessionId: z.string().uuid() });

export const securityLogInputSchema = z.object({
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(50).default(25),
});

export type SignOutSessionInput = z.infer<typeof signOutSessionInputSchema>;
export type SecurityLogInput = z.infer<typeof securityLogInputSchema>;
