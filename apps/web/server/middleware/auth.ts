import jwt, { type JwtPayload } from "jsonwebtoken";
import { z } from "zod";

import { redis } from "../cache/redis";
import { env } from "../env";
import { recordAuthFailure } from "../observability/security-events";
import { parseCookies } from "./cookies";

const SESSION_KEY_PREFIX = "auth:session:";
const AUTH_COOKIE_NAMES = ["access_token", "session_token", "auth_token"] as const;
const SESSION_COOKIE_NAME = "session_token";

export type AuthenticatedUser = {
  id: string;
  sessionId?: string;
};

type SessionRecord = {
  userId: string;
  sessionId?: string;
  revoked?: boolean;
};

const requestIdSchema = z.string().min(8).max(128);

const jwtClaimsSchema = z.object({
  sub: z.string().cuid(),
  sid: z.string().optional(),
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

function getCookieToken(headers: Headers): string | null {
  const cookies = parseCookies(headers.get("cookie"));

  for (const cookieName of AUTH_COOKIE_NAMES) {
    const token = cookies[cookieName];
    if (token) {
      return token;
    }
  }

  return null;
}

export function getSessionCookieToken(headers: Headers): string | null {
  const cookies = parseCookies(headers.get("cookie"));
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

export function isCookieAuth(headers: Headers): boolean {
  return Boolean(getCookieToken(headers));
}

function tryVerifyJWT(token: string): AuthenticatedUser | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload | string;
    if (typeof decoded === "string") {
      return null;
    }

    const parsed = jwtClaimsSchema.safeParse(decoded);
    if (!parsed.success) {
      return null;
    }

    return {
      id: parsed.data.sub,
      sessionId: parsed.data.sid,
    };
  } catch {
    return null;
  }
}

async function verifyRedisSessionToken(sessionToken: string): Promise<AuthenticatedUser | null> {
  const raw = await redis.get(`${SESSION_KEY_PREFIX}${sessionToken}`);
  if (!raw) {
    return null;
  }

  let parsed: SessionRecord | null = null;

  try {
    const asJson = JSON.parse(raw) as SessionRecord;
    parsed = asJson;
  } catch {
    parsed = {
      userId: raw,
    };
  }

  if (!parsed?.userId || parsed.revoked) {
    return null;
  }

  const userId = z.string().cuid().safeParse(parsed.userId);
  if (!userId.success) {
    return null;
  }

  return {
    id: userId.data,
    sessionId: parsed.sessionId,
  };
}

export async function resolveAuthenticatedUser(headers: Headers): Promise<AuthenticatedUser | null> {
  // Explicitly ignore spoofable identity headers such as x-user-id.
  const token = getBearerToken(headers) ?? getCookieToken(headers);
  if (!token) {
    return null;
  }

  const jwtUser = tryVerifyJWT(token);
  if (jwtUser) {
    return jwtUser;
  }

  const sessionUser = await verifyRedisSessionToken(token);
  if (sessionUser) {
    return sessionUser;
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

export async function persistSession(sessionToken: string, userId: string, ttlSeconds: number): Promise<void> {
  await redis.set(
    `${SESSION_KEY_PREFIX}${sessionToken}`,
    JSON.stringify({
      userId,
      createdAt: new Date().toISOString(),
    }),
    "EX",
    ttlSeconds,
  );
}

export async function invalidateSession(sessionToken: string): Promise<void> {
  await redis.del(`${SESSION_KEY_PREFIX}${sessionToken}`);
}
