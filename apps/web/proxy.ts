import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(
    request.cookies.get("access_token")?.value || request.cookies.get("session_token")?.value,
  );
  if (hasSessionCookie) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/workspace/:path*"],
};
