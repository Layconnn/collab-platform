import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import jwt from "jsonwebtoken";

import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from "@repo/validators/auth";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { env } from "../env";
import { invalidateSession, persistSession } from "../middleware/auth";
import { recordAuthFailure } from "../observability/security-events";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ACCESS_TOKEN_TTL = "15m";

type RequestContext = {
  requestId: string;
};

type AuthTokens = {
  accessToken: string;
  sessionToken: string;
  expiresInSeconds: number;
  csrfToken: string;
};

function generateTokenPair(userId: string) {
  const sessionId = randomUUID();
  const sessionToken = randomUUID();

  const accessToken = jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      tokenType: "access",
    },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );

  return { accessToken, sessionToken };
}

export const authService = {
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

    const { accessToken, sessionToken } = generateTokenPair(user.id);
    const csrfToken = randomUUID();

    await persistSession(sessionToken, user.id, SESSION_TTL_SECONDS);

    return {
      accessToken,
      sessionToken,
      expiresInSeconds: SESSION_TTL_SECONDS,
      csrfToken,
    };
  },

  async login(input: LoginInput, context: RequestContext): Promise<AuthTokens> {
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

    const validPassword = await argon2.verify(user.passwordHash, input.password);
    if (!validPassword) {
      await recordAuthFailure({
        requestId: context.requestId,
        userId: user.id,
        reason: "login_invalid_password",
        timestamp: new Date().toISOString(),
      });
      throw new AppError("UNAUTHORIZED", "Invalid credentials.");
    }

    const { accessToken, sessionToken } = generateTokenPair(user.id);
    const csrfToken = randomUUID();

    await persistSession(sessionToken, user.id, SESSION_TTL_SECONDS);

    return {
      accessToken,
      sessionToken,
      expiresInSeconds: SESSION_TTL_SECONDS,
      csrfToken,
    };
  },

  async logout(sessionToken: string | null): Promise<{ success: true }> {
    if (sessionToken) {
      await invalidateSession(sessionToken);
    }

    return { success: true as const };
  },

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<{ success: true }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new AppError("NOT_FOUND", "User not found.");
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

    return { success: true as const };
  },
};
