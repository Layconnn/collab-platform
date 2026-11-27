import { Prisma } from "../../../app/generated/prisma/client";

import { prisma } from "../../db/prisma";
import { EmailError, type EmailSender } from "../email/email";
import { appBaseUrl, renderDigest } from "./digest.email";
import { digestSettingsFor, silencedWorkspaceIds } from "./digest.preferences";
import { createUnsubscribeToken } from "./digest.tokens";
import { buildDigest } from "./digest.service";

// The digest run (daily digest PRD, FR-5 to FR-8). It runs every hour and
// takes the members whose chosen hour it now is in their own time zone
// (settings PRD, FR-6); people who never chose get 06:00 UTC. Each member gets
// at most one digest per day of their own calendar: a delivery row for that
// date is claimed (SENDING) before anything is sent, so overlapping or
// repeated runs never send twice. A run stops at its deadline and the
// scheduler calls again until a call finds nobody left.

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
  // Everyone is due, on the UTC date; tests use it to run at any hour.
  ignoreSchedule?: boolean;
};

export type DigestRunResult = {
  date: string;
  sent: number;
  skippedEmpty: number;
  skippedOff: number;
  held: number;
  failed: number;
  // True when this call found nobody left to process today.
  done: boolean;
};

export const digestDateOf = (now: Date) => now.toISOString().slice(0, 10);

export const DEFAULT_DIGEST_HOUR = 6;

// The calendar date and hour at this moment in a time zone.
export function zoneClock(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const dayOf = (date: string) => new Date(`${date}T00:00:00.000Z`);

// Not yet sent for that day, or failed with attempts left.
const pendingOn = (digestDate: Date): Prisma.UserWhereInput => ({
  OR: [
    { digestDeliveries: { none: { digestDate } } },
    { digestDeliveries: { some: { digestDate, status: "FAILED", attempts: { lt: MAX_ATTEMPTS } } } },
  ],
});

// Who is due now: one condition per time zone in use.
async function dueNow(now: Date, ignoreSchedule: boolean): Promise<Prisma.UserWhereInput | null> {
  if (ignoreSchedule) return pendingOn(dayOf(digestDateOf(now)));
  const zones = new Set((await prisma.userPreference.findMany({ distinct: ["timeZone"], select: { timeZone: true } })).map((row) => row.timeZone));
  zones.add("UTC");
  const terms: Prisma.UserWhereInput[] = [];
  for (const timeZone of zones) {
    let clock: { date: string; hour: number };
    try { clock = zoneClock(now, timeZone); } catch { continue; }
    terms.push({ AND: [{ preference: { is: { timeZone, digestHour: clock.hour } } }, pendingOn(dayOf(clock.date))] });
    if (timeZone === "UTC" && clock.hour === DEFAULT_DIGEST_HOUR) {
      terms.push({ AND: [{ preference: { is: null } }, pendingOn(dayOf(clock.date))] });
    }
  }
  return terms.length ? { OR: terms } : null;
}

// The email with its stop links (one for everything, one per workspace in the
// digest) and the one-click unsubscribe headers mail apps use (FR-10, FR-11).
export function composeDigestEmail(digest: Awaited<ReturnType<typeof buildDigest>> & object, now: Date) {
  const baseUrl = appBaseUrl();
  const allToken = createUnsubscribeToken({ userId: digest.user.id, scope: "all" }, now);
  const workspaces = new Map<string, string>();
  for (const item of digest.needs.items) workspaces.set(item.workspace.id, item.workspace.name);
  for (const item of digest.decided) workspaces.set(item.workspace.id, item.workspace.name);
  for (const item of digest.activity) workspaces.set(item.workspace.id, item.workspace.name);
  const unsubscribeWorkspace = Object.fromEntries([...workspaces].map(([workspaceId, name]) => [
    name,
    `${baseUrl}/unsubscribe/${createUnsubscribeToken({ userId: digest.user.id, scope: "workspace", workspaceId }, now)}`,
  ]));
  const email = renderDigest(digest, { baseUrl, unsubscribeAll: `${baseUrl}/unsubscribe/${allToken}`, unsubscribeWorkspace });
  const headers = {
    "List-Unsubscribe": `<${baseUrl}/api/digest/unsubscribe?token=${allToken}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return { email, headers };
}

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
  const allowed = new Set(options.allowlist.map((email) => email.trim().toLowerCase()).filter(Boolean));
  const result: DigestRunResult = { date, sent: 0, skippedEmpty: 0, skippedOff: 0, held: 0, failed: 0, done: false };
  const due = await dueNow(now, Boolean(options.ignoreSchedule));
  if (!due) return { ...result, done: true };

  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    // Members with a workspace and no finished row for today (or a retryable failure).
    const batch = await prisma.user.findMany({
      where: {
        memberships: { some: {} },
        id: { ...(cursor ? { gt: cursor } : {}), ...(options.onlyUserIds ? { in: options.onlyUserIds } : {}) },
        ...due,
      },
      select: { id: true, email: true, preference: { select: { timeZone: true } } },
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
      // The day is the member's own calendar day.
      const digestDate = dayOf(options.ignoreSchedule ? date : zoneClock(now, user.preference?.timeZone ?? "UTC").date);
      const finish = (userId: string, data: Prisma.DigestDeliveryUpdateManyMutationInput) =>
        prisma.digestDelivery.updateMany({ where: { userId, digestDate, status: "SENDING" }, data });
      if (!(await claim(user.id, digestDate))) continue;
      processed += 1;
      const settings = await digestSettingsFor(user.id);
      if (!settings.enabled) {
        await finish(user.id, { status: "SKIPPED_OFF" });
        result.skippedOff += 1;
        continue;
      }
      // Workspaces set to notify nothing stay out of the digest too (FR-7).
      const excludedWorkspaceIds = [...settings.excludedWorkspaceIds, ...await silencedWorkspaceIds(user.id)];
      const digest = await buildDigest(user.id, { now, excludedWorkspaceIds });
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
      const { email, headers } = composeDigestEmail(digest, now);
      try {
        const sent = await options.sender({ to: user.email, subject: email.subject, html: email.html, text: email.text, headers });
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
