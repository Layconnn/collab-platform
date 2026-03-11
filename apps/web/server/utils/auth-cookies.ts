import { env } from "../env";
import { serializeCookie } from "./cookies";
import { csrfCookieName } from "../middleware/csrf";

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

export function buildAuthCookies(params: AuthCookieParams): string[] {
  return [
    serializeCookie("access_token", params.accessToken, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: params.expiresInSeconds,
    }),
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
