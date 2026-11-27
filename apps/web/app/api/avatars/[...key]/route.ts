import { AVATAR_KEY_PATTERN } from "@repo/validators/auth";

import { resolveAuthenticatedUser } from "../../../../server/middleware/auth";
import { configuredStorage } from "../../../../server/services/files/storage";

export const dynamic = "force-dynamic";

// Serves a profile photo (settings PRD, FR-3) to signed-in people only. Each
// photo has a random key, so its URL reaches only those shown the person; a
// new photo gets a new key, so the redirect can be cached.
const plain = (status: number, text: string) =>
  new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const key = `avatars/${(await params).key.join("/")}`;
  if (!AVATAR_KEY_PATTERN.test(key)) return plain(404, "No such photo.");
  const user = await resolveAuthenticatedUser(request.headers);
  if (!user) return plain(401, "Sign in to see photos.");
  const storage = configuredStorage();
  if (!storage) return plain(404, "No such photo.");
  const url = await storage.signDownload(key, { contentType: key.endsWith(".jpg") ? "image/jpeg" : "image/webp", contentDisposition: "inline" }, 3600);
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=3000", "referrer-policy": "no-referrer" } });
}
