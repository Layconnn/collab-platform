import jwt, { type JwtPayload } from "jsonwebtoken";
import { z } from "zod";

import { redis } from "../cache/redis";
import { env } from "../env";
import { recordAuthFailure } from "../observability/security-events";
import { parseCookies } from "./cookies";

const SESSION_KEY_PREFIX = "auth:session:";
const SESSION_ID_KEY_PREFIX = "auth:sid:";
const USER_SESSIONS_KEY_PREFIX = "auth:user-sessions:";
const ACCESS_COOKIE_NAME = "access_token";
const SESSION_COOKIE_NAMES = ["session_token", "auth_token"] as const;

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;

export type AuthenticatedUser = {
  id: string;
  sessionId?: string;
  // "session" means the access token was missing or stale and the Redis session
  // authenticated the request; the caller may then issue a fresh access token.
  via: "bearer" | "access" | "session";
};

type SessionRecord = {
  userId: string;
  sessionId?: string;
  revoked?: boolean;
};

const requestIdSchema = z.string().min(8).max(128);

const jwtClaimsSchema = z.object({
  sub: z.string().cuid(),
  sid: z.string().min(1),
  tokenType: z.enum(["access", "session"]).optional(),
});

function getBearerToken(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim();
}

function isTrustedProxy(headers: Headers): boolean {
  const trustedProxyToken = env.TRUSTED_PROXY_TOKEN;
  if (!trustedProxyToken) {
    return false;
  }

  return headers.get("x-trusted-proxy-token") === trustedProxyToken;
}

export function resolveRequestId(headers: Headers): string {
  const headerRequestId = headers.get("x-request-id");
  if (!headerRequestId) {
    return crypto.randomUUID();
  }

  if (!isTrustedProxy(headers)) {
    return crypto.randomUUID();
  }

  const parsed = requestIdSchema.safeParse(headerRequestId.trim());
  if (!parsed.success) {
    return crypto.randomUUID();
  }

  return parsed.data;
}

function getCookieSessionToken(cookies: Record<string, string>): string | null {
  for (const cookieName of SESSION_COOKIE_NAMES) {
    const token = cookies[cookieName];
    if (token) {
      return token;
    }
  }
  return null;
}

export function getSessionCookieToken(headers: Headers): string | null {
  return getCookieSessionToken(parseCookies(headers.get("cookie")));
}

export function isCookieAuth(headers: Headers): boolean {
  const cookies = parseCookies(headers.get("cookie"));
  return Boolean(cookies[ACCESS_COOKIE_NAME] || getCookieSessionToken(cookies));
}

export function signAccessToken(userId: string, sessionId: string): string {
  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      tokenType: "access",
    },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
}

// An access token is only honoured while its session is alive, so logout and
// password changes revoke it immediately instead of after its expiry.
async function verifyAccessToken(token: string): Promise<{ id: string; sessionId: string } | null> {
  let decoded: JwtPayload | string;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload | string;
  } catch {
    return null;
  }
  if (typeof decoded === "string") {
    return null;
  }

  const parsed = jwtClaimsSchema.safeParse(decoded);
  if (!parsed.success) {
    return null;
  }

  const sessionOwner = await redis.get(`${SESSION_ID_KEY_PREFIX}${parsed.data.sid}`);
  if (sessionOwner !== parsed.data.sub) {
    return null;
  }

  return {
    id: parsed.data.sub,
    sessionId: parsed.data.sid,
  };
}

async function readSessionRecord(sessionToken: string): Promise<SessionRecord | null> {
  const raw = await redis.get(`${SESSION_KEY_PREFIX}${sessionToken}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return { userId: raw };
  }
}

async function verifyRedisSessionToken(sessionToken: string): Promise<{ id: string; sessionId?: string } | null> {
  const record = await readSessionRecord(sessionToken);
  if (!record?.userId || record.revoked) {
    return null;
  }

  const userId = z.string().cuid().safeParse(record.userId);
  if (!userId.success) {
    return null;
  }

  return {
    id: userId.data,
    sessionId: record.sessionId,
  };
}

export async function resolveAuthenticatedUser(headers: Headers): Promise<AuthenticatedUser | null> {
  // Explicitly ignore spoofable identity headers such as x-user-id.
  const bearerToken = getBearerToken(headers);
  if (bearerToken) {
    const bearerUser = await verifyAccessToken(bearerToken);
    return bearerUser ? { ...bearerUser, via: "bearer" } : null;
  }

  const cookies = parseCookies(headers.get("cookie"));
  const accessToken = cookies[ACCESS_COOKIE_NAME];
  if (accessToken) {
    const accessUser = await verifyAccessToken(accessToken);
    if (accessUser) {
      return { ...accessUser, via: "access" };
    }
  }

  // An expired or revoked access token falls back to the longer-lived session.
  const sessionToken = getCookieSessionToken(cookies);
  if (sessionToken) {
    const sessionUser = await verifyRedisSessionToken(sessionToken);
    if (sessionUser) {
      return { ...sessionUser, via: "session" };
    }
  }

  return null;
}

export async function trackAuthFailure(requestId: string, userId: string | undefined, reason: string): Promise<void> {
  await recordAuthFailure({
    requestId,
    userId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

export async function persistSession(
  sessionToken: string,
  userId: string,
  sessionId: string,
  ttlSeconds: number,
): Promise<void> {
  const userSessionsKey = `${USER_SESSIONS_KEY_PREFIX}${userId}`;
  await redis
    .multi()
    .set(
      `${SESSION_KEY_PREFIX}${sessionToken}`,
      JSON.stringify({
        userId,
        sessionId,
        createdAt: new Date().toISOString(),
      }),
      "EX",
      ttlSeconds,
    )
    .set(`${SESSION_ID_KEY_PREFIX}${sessionId}`, userId, "EX", ttlSeconds)
    .sadd(userSessionsKey, sessionToken)
    .expire(userSessionsKey, ttlSeconds)
    .exec();
}

export async function invalidateSession(sessionToken: string): Promise<void> {
  const record = await readSessionRecord(sessionToken);
  const pipeline = redis.multi().del(`${SESSION_KEY_PREFIX}${sessionToken}`);
  if (record?.sessionId) {
    pipeline.del(`${SESSION_ID_KEY_PREFIX}${record.sessionId}`);
  }
  if (record?.userId) {
    pipeline.srem(`${USER_SESSIONS_KEY_PREFIX}${record.userId}`, sessionToken);
  }
  await pipeline.exec();
}

export async function invalidateUserSessions(userId: string, keepSessionToken?: string | null): Promise<void> {
  const sessionTokens = await redis.smembers(`${USER_SESSIONS_KEY_PREFIX}${userId}`);
  for (const sessionToken of sessionTokens) {
    if (sessionToken !== keepSessionToken) {
      await invalidateSession(sessionToken);
    }
  }
}

// The session token behind a session id, for signing out one session from
// Settings (settings PRD, FR-9). Only the person's own sessions are searched.
export async function findSessionToken(userId: string, sessionId: string): Promise<string | null> {
  const sessionTokens = await redis.smembers(`${USER_SESSIONS_KEY_PREFIX}${userId}`);
  for (const sessionToken of sessionTokens) {
    const record = await readSessionRecord(sessionToken);
    if (record?.userId === userId && record.sessionId === sessionId) return sessionToken;
  }
  return null;
}

// Which of these session ids are still alive for this person.
export async function liveSessionIds(userId: string, sessionIds: string[]): Promise<Set<string>> {
  if (!sessionIds.length) return new Set();
  const owners = await redis.mget(...sessionIds.map((id) => `${SESSION_ID_KEY_PREFIX}${id}`));
  return new Set(sessionIds.filter((_, index) => owners[index] === userId));
}
