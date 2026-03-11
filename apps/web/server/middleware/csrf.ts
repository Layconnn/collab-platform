import { AppError } from "../errors/app-error";
import { parseCookies } from "./cookies";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

export function issueCsrfToken(): string {
  return crypto.randomUUID();
}

export function requireCsrfToken(headers: Headers, requestMethod: string | null): void {
  if (!requestMethod || requestMethod.toUpperCase() === "GET") {
    return;
  }

  const cookies = parseCookies(headers.get("cookie"));
  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeader = headers.get(CSRF_HEADER_NAME);

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw new AppError("FORBIDDEN", "Invalid CSRF token.");
  }
}

export const csrfCookieName = CSRF_COOKIE_NAME;
