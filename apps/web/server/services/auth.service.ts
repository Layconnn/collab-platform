import { randomUUID } from "node:crypto";

import { z } from "zod";
import jwt from "jsonwebtoken";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { env } from "../env";
import { invalidateSession, persistSession } from "../middleware/auth";
import { recordAuthFailure } from "../observability/security-events";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ACCESS_TOKEN_TTL = "15m";

const loginInputSchema = z.object({
  userId: z.string().cuid(),
  requestId: z.string().min(8),
});

const logoutInputSchema = z.object({
  sessionToken: z.string().min(16),
  requestId: z.string().min(8),
  userId: z.string().cuid().optional(),
});

export const authService = {
  async login(rawInput: unknown) {
    const input = loginInputSchema.parse(rawInput);

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });

    if (!user) {
      await recordAuthFailure({
        requestId: input.requestId,
        userId: input.userId,
        reason: "login_user_not_found",
        timestamp: new Date().toISOString(),
      });
      throw new AppError("UNAUTHORIZED", "Invalid credentials.");
    }

    const sessionId = randomUUID();
    const sessionToken = randomUUID();

    await persistSession(sessionToken, user.id, SESSION_TTL_SECONDS);

    const accessToken = jwt.sign(
      {
        sub: user.id,
        sid: sessionId,
        tokenType: "access",
      },
      env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    return {
      accessToken,
      sessionToken,
      expiresInSeconds: SESSION_TTL_SECONDS,
    };
  },

  async logout(rawInput: unknown) {
    const input = logoutInputSchema.parse(rawInput);
    await invalidateSession(input.sessionToken);

    return { success: true as const };
  },
};
