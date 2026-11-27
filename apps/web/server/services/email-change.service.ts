import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import argon2 from "argon2";

import { Prisma } from "../../app/generated/prisma/client";
import { redis } from "../cache/redis";
import { prisma } from "../db/prisma";
import { env } from "../env";
import { AppError } from "../errors/app-error";
import { configuredSender, type EmailSender } from "./email/email";
import { recordSecurityEvent, type Client } from "./session.service";

// Changing your email (settings PRD, FR-20): the password, then a 6-digit
// code sent to the new address (15 minutes, 5 attempts). The old address is
// told afterwards. Until the sending domain is verified, mail only goes to
// the addresses on DIGEST_ALLOWLIST, and the page says so.

const CODE_TTL_SECONDS = 15 * 60;
export const EMAIL_CODE_ATTEMPTS = 5;

type Pending = { email: string; codeHash: string; attempts: number; expiresAt: string };
type Options = { client?: Client; sessionId?: string };

export type MailSettings = { sender: EmailSender | null; delivery: "allowlist" | "all"; allowlist: string[] };

export function configuredMail(): MailSettings {
  return { sender: configuredSender(), delivery: env.DIGEST_DELIVERY, allowlist: (env.DIGEST_ALLOWLIST ?? "").split(",") };
}

const key = (userId: string) => `auth:email-change:${userId}`;
const hashCode = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");
const canReach = (mail: MailSettings, email: string) =>
  Boolean(mail.sender) && (mail.delivery === "all" || mail.allowlist.some((entry) => entry.trim().toLowerCase() === email));

async function pendingFor(userId: string): Promise<Pending | null> {
  const raw = await redis.get(key(userId));
  return raw ? (JSON.parse(raw) as Pending) : null;
}

function codeEmail(code: string) {
  return {
    subject: `${code} is your Commons code`,
    text: `Your code to confirm this email address for Commons is ${code}.\n\nIt works for 15 minutes. If you didn't ask for it, you can ignore this email.\n`,
    html: `<p>Your code to confirm this email address for Commons is</p><p style="font-size:28px;font-weight:600;letter-spacing:6px;font-family:monospace">${code}</p><p>It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  };
}

function noticeEmail(newEmail: string) {
  const masked = newEmail.replace(/^(.)(.*)(@.*)$/, (_, first: string, rest: string, domain: string) => `${first}${"•".repeat(Math.min(rest.length, 6))}${domain}`);
  return {
    subject: "Your Commons email address was changed",
    text: `The email address on your Commons account was changed to ${masked}.\n\nIf this wasn't you, sign in and change your password, then sign out your other sessions in Settings → Security.\n`,
    html: `<p>The email address on your Commons account was changed to <strong>${masked}</strong>.</p><p>If this wasn't you, sign in and change your password, then sign out your other sessions in Settings → Security.</p>`,
  };
}

export const emailChangeService = {
  // What the page needs: a change waiting for its code, and where mail can go.
  async status(userId: string, mail: MailSettings = configuredMail()) {
    const pending = await pendingFor(userId);
    return {
      pending: pending ? { email: pending.email, expiresAt: pending.expiresAt } : null,
      sending: mail.sender ? (mail.delivery === "all" ? "all" : "allowlist") : "off",
    } as const;
  },

  async request(userId: string, input: { email: string; password: string }, mail: MailSettings = configuredMail()) {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, passwordHash: true } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new AppError("FORBIDDEN", "Your password is incorrect.");
    }
    if (email === user.email) throw new AppError("BAD_REQUEST", "That's already your email address.");
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new AppError("CONFLICT", "That email address is already in use.");
    }
    if (!mail.sender) throw new AppError("PRECONDITION_FAILED", "Email isn't set up yet, so the address can't be changed.");
    if (!canReach(mail, email)) {
      throw new AppError("PRECONDITION_FAILED", "That address isn't on the test list, so it can't get a code yet.");
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString();
    const pending: Pending = { email, codeHash: hashCode(userId, code), attempts: 0, expiresAt };
    await redis.set(key(userId), JSON.stringify(pending), "EX", CODE_TTL_SECONDS);
    try {
      await mail.sender({ to: email, ...codeEmail(code) });
    } catch {
      await redis.del(key(userId));
      throw new AppError("SERVICE_UNAVAILABLE", "Could not send the code. Try again in a moment.");
    }
    return { pending: { email, expiresAt } };
  },

  async confirm(userId: string, input: { code: string }, options: Options = {}, mail: MailSettings = configuredMail()) {
    const pending = await pendingFor(userId);
    if (!pending) throw new AppError("BAD_REQUEST", "That code has expired. Ask for a new one.");
    const given = Buffer.from(hashCode(userId, input.code.trim()));
    if (!timingSafeEqual(given, Buffer.from(pending.codeHash))) {
      const attempts = pending.attempts + 1;
      if (attempts >= EMAIL_CODE_ATTEMPTS) {
        await redis.del(key(userId));
        throw new AppError("BAD_REQUEST", "Too many wrong codes. Ask for a new one.");
      }
      await redis.set(key(userId), JSON.stringify({ ...pending, attempts }), "KEEPTTL");
      throw new AppError("FORBIDDEN", "That code didn't work.");
    }

    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    try {
      await prisma.user.update({ where: { id: userId }, data: { email: pending.email } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await redis.del(key(userId));
        throw new AppError("CONFLICT", "That email address is already in use.");
      }
      throw error;
    }
    await redis.del(key(userId));
    await recordSecurityEvent(userId, "EMAIL_CHANGED", options);
    // Best effort: the old address hears about it when mail can reach it.
    if (mail.sender && canReach(mail, before.email)) {
      await mail.sender({ to: before.email, ...noticeEmail(pending.email) }).catch(() => undefined);
    }
    return { email: pending.email };
  },

  async cancel(userId: string) {
    await redis.del(key(userId));
    return { pending: null };
  },
};
