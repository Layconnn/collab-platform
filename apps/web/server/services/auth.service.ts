import { randomUUID } from "node:crypto";

import argon2 from "argon2";

import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  VerifyTwoStepInput,
} from "@repo/validators/auth";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import {
  invalidateSession,
  invalidateUserSessions,
  persistSession,
  signAccessToken,
} from "../middleware/auth";
import { recordAuthFailure } from "../observability/security-events";
import { recordSecurityEvent, recordSessionStart, sessionService, type Client } from "./session.service";
import { accountService } from "./account.service";
import { twoStepService } from "./two-step.service";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const UNKNOWN_CLIENT: Client = { userAgent: "", device: "Unknown device", country: null };

type RequestContext = {
  requestId: string;
  // Device and country, for sessions and the security log (settings PRD, FR-8).
  client?: Client;
};

type AuthTokens = {
  accessToken: string;
  sessionToken: string;
  expiresInSeconds: number;
  csrfToken: string;
};

// With two-step sign-in on, the password alone gives no session (FR-13).
type TwoStepChallenge = { challengeToken: string };

async function startSession(userId: string, client: Client, kind: "ACCOUNT_CREATED" | "SIGNED_IN"): Promise<AuthTokens> {
  const sessionId = randomUUID();
  const sessionToken = randomUUID();

  await persistSession(sessionToken, userId, sessionId, SESSION_TTL_SECONDS);
  await recordSessionStart(userId, sessionId, client);
  await recordSecurityEvent(userId, kind, { sessionId, client });
  // Signing in during the 30-day grace period reopens a closed account (FR-18).
  if (kind === "SIGNED_IN") await accountService.restoreIfClosed(userId, { sessionId, client });

  return {
    accessToken: signAccessToken(userId, sessionId),
    sessionToken,
    expiresInSeconds: SESSION_TTL_SECONDS,
    csrfToken: randomUUID(),
  };
}

export const authService = {
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, name: true, usernameChangedAt: true, avatarKey: true },
    });
    if (!user) {
      throw new AppError("UNAUTHORIZED", "Authentication required.");
    }
    return user;
  },

  async register(input: RegisterInput, context: RequestContext): Promise<AuthTokens> {
    const username = input.username.toLowerCase();
    const email = input.email.toLowerCase();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
      select: { id: true },
    });

    if (existing) {
      throw new AppError("CONFLICT", "Email or username already in use.");
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
      },
      select: {
        id: true,
      },
    });

    return startSession(user.id, context.client ?? UNKNOWN_CLIENT, "ACCOUNT_CREATED");
  },

  async login(input: LoginInput, context: RequestContext): Promise<AuthTokens | TwoStepChallenge> {
    const email = input.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      await recordAuthFailure({
        requestId: context.requestId,
        userId: undefined,
        reason: "login_user_not_found",
        timestamp: new Date().toISOString(),
      });
      throw new AppError("UNAUTHORIZED", "Invalid credentials.");
    }

    if (!user.passwordHash) {
      await recordAuthFailure({
        requestId: context.requestId,
        userId: user.id,
        reason: "login_password_not_configured",
        timestamp: new Date().toISOString(),
      });
      throw new AppError("UNAUTHORIZED", "Invalid credentials.");
    }

    const validPassword = await argon2.verify(user.passwordHash, input.password);
    if (!validPassword) {
      await recordAuthFailure({
        requestId: context.requestId,
        userId: user.id,
        reason: "login_invalid_password",
        timestamp: new Date().toISOString(),
      });
      await recordSecurityEvent(user.id, "SIGN_IN_FAILED", { client: context.client });
      throw new AppError("UNAUTHORIZED", "Invalid credentials.");
    }

    if (await twoStepService.isEnabled(user.id)) {
      return { challengeToken: await twoStepService.createChallenge(user.id) };
    }

    return startSession(user.id, context.client ?? UNKNOWN_CLIENT, "SIGNED_IN");
  },

  // The code step of signing in (FR-13): an authenticator or recovery code.
  async verifyTwoStep(input: VerifyTwoStepInput, context: RequestContext): Promise<AuthTokens> {
    const userId = await twoStepService.completeChallenge(input.challengeToken, input.code, { client: context.client });
    return startSession(userId, context.client ?? UNKNOWN_CLIENT, "SIGNED_IN");
  },

  async logout(sessionToken: string | null, user?: { id: string; sessionId?: string } | null, client?: Client): Promise<{ success: true }> {
    if (sessionToken) {
      await invalidateSession(sessionToken);
    }
    if (user?.sessionId) {
      await sessionService.endSessions(user.id, [user.sessionId]);
      await recordSecurityEvent(user.id, "SIGNED_OUT", { sessionId: user.sessionId, client });
    }

    return { success: true as const };
  },

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext & { sessionToken: string | null; sessionId?: string },
  ): Promise<{ success: true }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new AppError("NOT_FOUND", "User not found.");
    }

    if (!user.passwordHash) {
      throw new AppError("BAD_REQUEST", "Password is not configured for this account.");
    }

    const validPassword = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!validPassword) {
      await recordAuthFailure({
        requestId: context.requestId,
        userId,
        reason: "change_password_invalid_current_password",
        timestamp: new Date().toISOString(),
      });
      throw new AppError("FORBIDDEN", "Current password is incorrect.");
    }

    const passwordHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Every other signed-in device loses access; the current session stays.
    await invalidateUserSessions(userId, context.sessionToken);
    const others = await prisma.userSession.findMany({ where: { userId, endedAt: null, NOT: { id: context.sessionId ?? "" } }, select: { id: true } });
    await sessionService.endSessions(userId, others.map((row) => row.id));
    await recordSecurityEvent(userId, "PASSWORD_CHANGED", { sessionId: context.sessionId, client: context.client });

    return { success: true as const };
  },
};
