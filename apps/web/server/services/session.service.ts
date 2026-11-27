import type { SecurityEventKind } from "../../app/generated/prisma/client";
import { describeDevice } from "../../lib/device";
import { redis } from "../cache/redis";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { findSessionToken, invalidateSession, invalidateUserSessions, liveSessionIds } from "../middleware/auth";

// Sessions and the security log (settings PRD, FR-8 to FR-10). Redis decides
// whether a session is alive; UserSession rows describe sessions for people,
// and SecurityEvent rows are what the log shows for 90 days.

export type Client = { userAgent: string; device: string; country: string | null };

const LOG_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;
const SEEN_EVERY_SECONDS = 600;

// Device and country of a request. Country comes from Vercel's edge; no IP
// address is stored.
export function clientOf(headers: Headers): Client {
  const userAgent = (headers.get("user-agent") ?? "").slice(0, 300);
  const country = headers.get("x-vercel-ip-country");
  return { userAgent, device: describeDevice(userAgent), country: country && /^[A-Z]{2}$/.test(country) ? country : null };
}

export async function recordSecurityEvent(userId: string, kind: SecurityEventKind, details: { sessionId?: string | null; client?: Client | null } = {}) {
  await prisma.$transaction([
    prisma.securityEvent.create({
      data: { userId, kind, sessionId: details.sessionId ?? null, device: details.client?.device ?? null, country: details.client?.country ?? null },
    }),
    prisma.securityEvent.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - LOG_DAYS * DAY) } } }),
  ]);
}

export async function recordSessionStart(userId: string, sessionId: string, client: Client) {
  await prisma.userSession.create({ data: { id: sessionId, userId, device: client.device, userAgent: client.userAgent, country: client.country } });
}

async function endSessions(userId: string, sessionIds: string[]) {
  if (sessionIds.length) await prisma.userSession.updateMany({ where: { userId, id: { in: sessionIds }, endedAt: null }, data: { endedAt: new Date() } });
}

export const sessionService = {
  // Last active, at most every 10 minutes per session. A session from before
  // this existed gets its row here.
  async touch(userId: string, sessionId: string, headers: Headers) {
    const first = await redis.set(`auth:seen:${sessionId}`, "1", "EX", SEEN_EVERY_SECONDS, "NX");
    if (first !== "OK") return;
    const client = clientOf(headers);
    await prisma.userSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId, userId, device: client.device, userAgent: client.userAgent, country: client.country },
      update: { lastSeenAt: new Date(), ...(client.country ? { country: client.country } : {}) },
    });
  },

  async list(userId: string, currentSessionId: string | undefined) {
    const rows = await prisma.userSession.findMany({
      where: { userId, endedAt: null },
      select: { id: true, device: true, country: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
    const live = await liveSessionIds(userId, rows.map((row) => row.id));
    // Sessions that expired on their own are closed here.
    await endSessions(userId, rows.filter((row) => !live.has(row.id)).map((row) => row.id));
    return rows
      .filter((row) => live.has(row.id))
      .map((row) => ({ ...row, current: row.id === currentSessionId }))
      .sort((a, b) => Number(b.current) - Number(a.current));
  },

  async signOut(userId: string, sessionId: string, context: { currentSessionId?: string; client: Client }) {
    if (sessionId === context.currentSessionId) throw new AppError("BAD_REQUEST", "Use Sign out to end this session.");
    const sessionToken = await findSessionToken(userId, sessionId);
    if (!sessionToken) {
      await endSessions(userId, [sessionId]);
      throw new AppError("NOT_FOUND", "That session has already ended.");
    }
    await invalidateSession(sessionToken);
    await endSessions(userId, [sessionId]);
    await recordSecurityEvent(userId, "SESSION_SIGNED_OUT", { sessionId: context.currentSessionId, client: context.client });
    return { ok: true as const };
  },

  async signOutOthers(userId: string, context: { currentSessionId?: string; sessionToken: string | null; client: Client }) {
    await invalidateUserSessions(userId, context.sessionToken);
    const others = await prisma.userSession.findMany({ where: { userId, endedAt: null, NOT: { id: context.currentSessionId ?? "" } }, select: { id: true } });
    await endSessions(userId, others.map((row) => row.id));
    await recordSecurityEvent(userId, "OTHER_SESSIONS_SIGNED_OUT", { sessionId: context.currentSessionId, client: context.client });
    return { ended: others.length };
  },

  // Newest first, the last 90 days (FR-10).
  async log(userId: string, input: { cursor?: string; take: number }) {
    const rows = await prisma.securityEvent.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - LOG_DAYS * DAY) } },
      select: { id: true, kind: true, device: true, country: true, createdAt: true, sessionId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.take + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return { items: rows.slice(0, input.take), nextCursor: rows.length > input.take ? rows[input.take - 1]!.id : null };
  },

  endSessions,
};
