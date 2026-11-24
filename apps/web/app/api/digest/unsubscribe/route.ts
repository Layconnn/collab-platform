import { digestPreferences } from "../../../../server/services/digest/digest.preferences";

export const dynamic = "force-dynamic";

// One-click unsubscribe (RFC 8058, daily digest PRD FR-11): mail apps POST
// here from the List-Unsubscribe header. A GET (a person or a link scanner
// opening the URL) changes nothing and goes to the confirmation page instead.
export async function POST(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    await digestPreferences.applyToken(token);
    return new Response("You will not get daily digests from Commons any more.", { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return new Response("This link is not valid any more.", { status: 400, headers: { "cache-control": "no-store" } });
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  return Response.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, url.origin), 303);
}
