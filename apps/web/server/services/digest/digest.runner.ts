import { Prisma } from "../../../app/generated/prisma/client";

import { prisma } from "../../db/prisma";
import { EmailError, type EmailSender } from "../email/email";
import { appBaseUrl, renderDigest } from "./digest.email";
import { buildDigest } from "./digest.service";

// The daily run (daily digest PRD, FR-5 to FR-8). Each member gets at most one
// digest a day: a delivery row is claimed (SENDING) before anything is sent,
// so overlapping or repeated runs never send twice. A run stops at its
// deadline and the scheduler calls again until a call finds nobody left.

export const MAX_ATTEMPTS = 3;
const BATCH = 25;

export type DigestRunOptions = {
  now?: Date;
  sender: EmailSender | null;
  delivery: "allowlist" | "all";
  allowlist: string[];
  // Stop starting new members after this time (epoch ms).
  deadline: number;
  // Pause between sends, to stay inside the provider's rate limit.
  pauseMs?: number;
  // Limits a run to some members; tests use it to stay independent.
  onlyUserIds?: string[];
};

export type DigestRunResult = {
  date: string;
  sent: number;
  skippedEmpty: number;
  held: number;
  failed: number;
  // True when this call found nobody left to process today.
  done: boolean;
};

export const digestDateOf = (now: Date) => now.toISOString().slice(0, 10);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Claims today's row for a member: a new row, or a failed one with attempts
// left. False when someone else has it or it is finished.
async function claim(userId: string, digestDate: Date): Promise<boolean> {
  try {
    await prisma.digestDelivery.create({ data: { userId, digestDate, status: "SENDING", attempts: 1 } });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  const retried = await prisma.digestDelivery.updateMany({
    where: { userId, digestDate, status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "SENDING", attempts: { increment: 1 }, error: null },
  });
  return retried.count === 1;
}

export async function runDigest(options: DigestRunOptions): Promise<DigestRunResult> {
  const now = options.now ?? new Date();
  const date = digestDateOf(now);
  const digestDate = new Date(`${date}T00:00:00.000Z`);
  const allowed = new Set(options.allowlist.map((email) => email.trim().toLowerCase()).filter(Boolean));
  const result: DigestRunResult = { date, sent: 0, skippedEmpty: 0, held: 0, failed: 0, done: false };
  const finish = (userId: string, data: Prisma.DigestDeliveryUpdateManyMutationInput) =>
    prisma.digestDelivery.updateMany({ where: { userId, digestDate, status: "SENDING" }, data });

  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    // Members with a workspace and no finished row for today (or a retryable failure).
    const batch = await prisma.user.findMany({
      where: {
        memberships: { some: {} },
        id: { ...(cursor ? { gt: cursor } : {}), ...(options.onlyUserIds ? { in: options.onlyUserIds } : {}) },
        OR: [
          { digestDeliveries: { none: { digestDate } } },
          { digestDeliveries: { some: { digestDate, status: "FAILED", attempts: { lt: MAX_ATTEMPTS } } } },
        ],
      },
      select: { id: true, email: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (!batch.length) {
      result.done = processed === 0;
      return result;
    }
    for (const user of batch) {
      if (Date.now() >= options.deadline) return result;
      cursor = user.id;
      if (!(await claim(user.id, digestDate))) continue;
      processed += 1;
      const digest = await buildDigest(user.id, { now });
      if (!digest || digest.empty) {
        await finish(user.id, { status: "SKIPPED_EMPTY" });
        result.skippedEmpty += 1;
        continue;
      }
      const mayReceive = options.delivery === "all" || allowed.has(user.email.toLowerCase());
      if (!mayReceive || !options.sender) {
        await finish(user.id, { status: "HELD", error: options.sender ? null : "Email is not configured." });
        result.held += 1;
        continue;
      }
      const email = renderDigest(digest, { baseUrl: appBaseUrl() });
      try {
        const sent = await options.sender({ to: user.email, subject: email.subject, html: email.html, text: email.text });
        await finish(user.id, { status: "SENT", providerId: sent.id });
        result.sent += 1;
      } catch (error) {
        const retryable = !(error instanceof EmailError) || error.retryable;
        await finish(user.id, {
          status: "FAILED",
          error: String(error instanceof Error ? error.message : error).slice(0, 500),
          // A rejected address will not start working on a retry.
          ...(retryable ? {} : { attempts: MAX_ATTEMPTS }),
        });
        result.failed += 1;
      }
      if (options.pauseMs) await sleep(options.pauseMs);
    }
  }
}
