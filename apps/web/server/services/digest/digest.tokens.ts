import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../env";

// Signed unsubscribe links (daily digest PRD, FR-10, NFR-2): scoped to one
// member and one action, expiring after 60 days, and useless if changed.

export const UNSUBSCRIBE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export type UnsubscribeAction = { userId: string; scope: "all" } | { userId: string; scope: "workspace"; workspaceId: string };

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");
// A key derived for this purpose only, so a token can never pass as a session.
const key = () => createHmac("sha256", env.JWT_SECRET).update("commons:digest-unsubscribe:v1").digest();
const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest();

export function createUnsubscribeToken(action: UnsubscribeAction, now = new Date()): string {
  const payload = b64(JSON.stringify({
    u: action.userId,
    s: action.scope,
    ...(action.scope === "workspace" ? { w: action.workspaceId } : {}),
    e: now.getTime() + UNSUBSCRIBE_TTL_MS,
  }));
  return `${payload}.${b64(sign(payload))}`;
}

export function readUnsubscribeToken(token: string, now = new Date()): UnsubscribeAction | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = sign(payload);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; s?: unknown; w?: unknown; e?: unknown };
    if (typeof data.u !== "string" || typeof data.e !== "number" || data.e < now.getTime()) return null;
    if (data.s === "all") return { userId: data.u, scope: "all" };
    if (data.s === "workspace" && typeof data.w === "string") return { userId: data.u, scope: "workspace", workspaceId: data.w };
    return null;
  } catch {
    return null;
  }
}
