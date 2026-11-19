import { env } from "../env";
import { serializeCookie } from "./cookies";
import { csrfCookieName } from "../middleware/csrf";
import { ACCESS_TOKEN_TTL_SECONDS } from "../middleware/auth";

type AuthCookieParams = {
  accessToken: string;
  sessionToken: string;
  csrfToken: string;
  expiresInSeconds: number;
};

const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict",
  secure: env.NODE_ENV === "production",
  path: "/",
} as const;

// The access cookie lives exactly as long as its token; the session cookie then
// authenticates the next request and a new access token is issued.
export function buildAccessTokenCookie(accessToken: string): string {
  return serializeCookie("access_token", accessToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function buildAuthCookies(params: AuthCookieParams): string[] {
  return [
    buildAccessTokenCookie(params.accessToken),
    serializeCookie("session_token", params.sessionToken, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: params.expiresInSeconds,
    }),
    serializeCookie(csrfCookieName, params.csrfToken, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: params.expiresInSeconds,
    }),
  ];
}

export function buildLogoutCookies(): string[] {
  return [
    serializeCookie("access_token", "", { ...AUTH_COOKIE_OPTIONS, maxAge: 0 }),
    serializeCookie("session_token", "", { ...AUTH_COOKIE_OPTIONS, maxAge: 0 }),
    serializeCookie(csrfCookieName, "", { ...AUTH_COOKIE_OPTIONS, maxAge: 0 }),
  ];
}
