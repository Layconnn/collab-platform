import { createHash, randomBytes } from "node:crypto";

import argon2 from "argon2";

import { redis } from "../cache/redis";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { recordSecurityEvent, type Client } from "./session.service";
import {
  hashRecoveryCode,
  looksLikeRecoveryCode,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  openSecret,
  otpauthUrl,
  sealSecret,
} from "./totp";

// Two-step sign-in (settings PRD, FR-11 to FR-13). Setting up keeps the new
// secret in Redis until a code confirms it; signing in with two-step on
// returns a short-lived challenge instead of a session.

const SETUP_TTL_SECONDS = 15 * 60;
const CHALLENGE_TTL_SECONDS = 5 * 60;
export const CHALLENGE_ATTEMPTS = 5;

const setupKey = (userId: string) => `auth:2fa-setup:${userId}`;
const challengeKey = (token: string) => `auth:2fa-challenge:${createHash("sha256").update(token).digest("hex")}`;
const attemptsKey = (token: string) => `${challengeKey(token)}:attempts`;

type Options = { client?: Client; sessionId?: string };

async function replaceRecoveryCodes(userId: string) {
  const codes = newRecoveryCodes();
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })) }),
  ]);
  return codes;
}

// An authenticator code (each works once) or, where allowed, an unused
// recovery code. True when the code was accepted.
async function acceptCode(userId: string, code: string, { allowRecovery, ...options }: Options & { allowRecovery: boolean }): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true } });
  if (!user?.totpEnabledAt || !user.totpSecret) return false;
  const trimmed = code.replace(/\s/g, "");
  const step = matchTotp(openSecret(user.totpSecret), trimmed, Date.now(), user.totpLastStep);
  if (step !== null) {
    // Two requests with the same code: only one moves the step on.
    const { count } = await prisma.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return count === 1;
  }
  if (!allowRecovery || !looksLikeRecoveryCode(trimmed)) return false;
  const { count } = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(trimmed), usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return false;
  await recordSecurityEvent(userId, "RECOVERY_CODE_USED", options);
  return true;
}

export const twoStepService = {
  async status(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true } });
    const recoveryCodesLeft = user.totpEnabledAt ? await prisma.recoveryCode.count({ where: { userId, usedAt: null } }) : 0;
    return { enabled: Boolean(user.totpEnabledAt), enabledAt: user.totpEnabledAt, recoveryCodesLeft };
  },

  // A new secret to scan; nothing changes until `enable` confirms a code.
  async begin(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpEnabledAt: true } });
    if (user.totpEnabledAt) throw new AppError("CONFLICT", "Two-step sign-in is already on.");
    const secret = newTotpSecret();
    await redis.set(setupKey(userId), sealSecret(secret), "EX", SETUP_TTL_SECONDS);
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  },

  async enable(userId: string, code: string, options: Options = {}) {
    const pending = await redis.get(setupKey(userId));
    if (!pending) throw new AppError("BAD_REQUEST", "Setup expired. Start again.");
    const step = matchTotp(openSecret(pending), code.replace(/\s/g, ""), Date.now(), null);
    if (step === null) throw new AppError("BAD_REQUEST", "That code didn't match. Check the time on your phone and try the newest code.");
    const { count } = await prisma.user.updateMany({
      where: { id: userId, totpEnabledAt: null },
      data: { totpSecret: pending, totpEnabledAt: new Date(), totpLastStep: step },
    });
    if (count !== 1) throw new AppError("CONFLICT", "Two-step sign-in is already on.");
    await redis.del(setupKey(userId));
    const recoveryCodes = await replaceRecoveryCodes(userId);
    await recordSecurityEvent(userId, "TWO_STEP_ENABLED", options);
    return { recoveryCodes };
  },

  // Needs the password and a code: a stolen session alone can't turn it off.
  async disable(userId: string, input: { password: string; code: string }, options: Options = {}) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, totpEnabledAt: true } });
    if (!user.totpEnabledAt) throw new AppError("BAD_REQUEST", "Two-step sign-in is already off.");
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new AppError("FORBIDDEN", "Your password is incorrect.");
    }
    if (!(await acceptCode(userId, input.code, { allowRecovery: true, ...options }))) {
      throw new AppError("FORBIDDEN", "That code didn't work.");
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } }),
      prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
    await recordSecurityEvent(userId, "TWO_STEP_DISABLED", options);
    return { enabled: false };
  },

  // New codes replace the old ones; an authenticator code is required.
  async regenerateRecoveryCodes(userId: string, code: string, options: Options = {}) {
    if (!(await acceptCode(userId, code, { allowRecovery: false, ...options }))) {
      throw new AppError("FORBIDDEN", "That code didn't work.");
    }
    const recoveryCodes = await replaceRecoveryCodes(userId);
    await recordSecurityEvent(userId, "RECOVERY_CODES_REGENERATED", options);
    return { recoveryCodes };
  },

  async isEnabled(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } });
    return Boolean(user?.totpEnabledAt);
  },

  // After the password: a token for the code step, good for five minutes.
  async createChallenge(userId: string) {
    const token = randomBytes(32).toString("base64url");
    await redis.set(challengeKey(token), userId, "EX", CHALLENGE_TTL_SECONDS);
    return token;
  },

  // The user the challenge belongs to once a code is accepted. Five wrong
  // codes end the challenge; the password has to be entered again.
  async completeChallenge(token: string, code: string, options: Options = {}): Promise<string> {
    const userId = await redis.get(challengeKey(token));
    if (!userId) throw new AppError("UNAUTHORIZED", "This sign-in expired. Enter your password again.");
    if (await acceptCode(userId, code, { allowRecovery: true, ...options })) {
      await redis.del(challengeKey(token), attemptsKey(token));
      return userId;
    }
    const attempts = await redis.incr(attemptsKey(token));
    if (attempts === 1) await redis.expire(attemptsKey(token), CHALLENGE_TTL_SECONDS);
    await recordSecurityEvent(userId, "SIGN_IN_FAILED", options);
    if (attempts >= CHALLENGE_ATTEMPTS) {
      await redis.del(challengeKey(token), attemptsKey(token));
      throw new AppError("UNAUTHORIZED", "Too many wrong codes. Enter your password again.");
    }
    throw new AppError("UNAUTHORIZED", "That code didn't work.");
  },
};
