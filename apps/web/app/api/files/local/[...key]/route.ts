import { readFile } from "node:fs/promises";

import { FILE_LIMITS } from "@repo/validators/files";

import { configuredLocalStorage, verifyLocalSignature, writeLocalObject } from "../../../../../server/services/files/storage";

export const dynamic = "force-dynamic";

// Local-folder storage for development and end-to-end tests (FILES_LOCAL_DIR),
// standing in for R2: signed, expiring PUT and GET URLs. Never on Vercel.
const notFound = () => new Response("Not found.", { status: 404, headers: { "cache-control": "no-store" } });

function signed(request: Request, keyParts: string[], parts: (key: string, params: URLSearchParams) => string[]) {
  const storage = configuredLocalStorage();
  if (!storage) return null;
  const key = keyParts.join("/");
  const params = new URL(request.url).searchParams;
  if (Number(params.get("e")) < Date.now() / 1000) return null;
  if (!verifyLocalSignature(storage.secret, parts(key, params), params.get("t") ?? "")) return null;
  return { storage, key, params };
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const access = signed(request, (await params).key, (key, query) => ["PUT", key, query.get("e") ?? "", query.get("s") ?? "", query.get("ct") ?? ""]);
  if (!access) return new Response("Forbidden.", { status: 403 });
  const size = Number(access.params.get("s"));
  if (request.headers.get("content-type") !== access.params.get("ct")) return new Response("Wrong content type.", { status: 403 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength !== size || size > FILE_LIMITS.maxFileBytes) return new Response("Wrong size.", { status: 403 });
  await writeLocalObject(access.storage, access.key, body);
  return new Response(null, { status: 200 });
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const access = signed(request, (await params).key, (key, query) => ["GET", key, query.get("e") ?? "", query.get("ct") ?? "", query.get("cd") ?? ""]);
  if (!access) return notFound();
  try {
    const body = await readFile(access.storage.path(access.key));
    return new Response(body, { headers: {
      "content-type": access.params.get("ct") ?? "application/octet-stream",
      "content-disposition": access.params.get("cd") ?? "attachment",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    } });
  } catch {
    return notFound();
  }
}
