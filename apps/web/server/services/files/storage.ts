import { AwsClient } from "aws4fetch";

import { env } from "../../env";

// Where attachment files live (file uploads PRD). The app only ever hands the
// browser short-lived signed URLs; the bucket itself stays private (NFR-2).
export type StoredObject = { size: number; contentType: string | null };

export interface FileStorage {
  // A URL the browser can PUT exactly this file to, until it expires.
  signUpload(key: string, file: { contentType: string; size: number }, expiresInSeconds: number): Promise<{ url: string; headers: Record<string, string> }>;
  // A URL that serves the file with these response headers, until it expires.
  signDownload(key: string, response: { contentType: string; contentDisposition: string }, expiresInSeconds: number): Promise<string>;
  head(key: string): Promise<StoredObject | null>;
  // The first bytes, to check an image is what its name says.
  readStart(key: string, bytes: number): Promise<Uint8Array>;
  // Deleting a missing object succeeds.
  delete(key: string): Promise<void>;
}

export class StorageError extends Error {}

export function createR2Storage(options: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }): FileStorage {
  const client = new AwsClient({ accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey, service: "s3", region: "auto" });
  const objectUrl = (key: string) => new URL(`https://${options.accountId}.r2.cloudflarestorage.com/${options.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const call = async (key: string, init: RequestInit, okStatuses: number[]) => {
    const response = await client.fetch(objectUrl(key).toString(), init);
    if (!okStatuses.includes(response.status)) throw new StorageError(`Storage answered ${response.status} to ${init.method ?? "GET"}.`);
    return response;
  };

  return {
    async signUpload(key, file, expiresInSeconds) {
      const url = objectUrl(key);
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      // Content type and length are signed, so the URL accepts only this file.
      const headers = { "content-type": file.contentType, "content-length": String(file.size) };
      const signed = await client.sign(url.toString(), { method: "PUT", headers, aws: { signQuery: true, allHeaders: true } });
      return { url: signed.url, headers: { "content-type": file.contentType } };
    },
    async signDownload(key, response, expiresInSeconds) {
      const url = objectUrl(key);
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      url.searchParams.set("response-content-type", response.contentType);
      url.searchParams.set("response-content-disposition", response.contentDisposition);
      url.searchParams.set("response-cache-control", "private, max-age=300");
      const signed = await client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
      return signed.url;
    },
    async head(key) {
      const response = await call(key, { method: "HEAD" }, [200, 404]);
      if (response.status === 404) return null;
      return { size: Number(response.headers.get("content-length") ?? 0), contentType: response.headers.get("content-type") };
    },
    async readStart(key, bytes) {
      const response = await call(key, { method: "GET", headers: { range: `bytes=0-${bytes - 1}` } }, [200, 206]);
      return new Uint8Array(await response.arrayBuffer()).slice(0, bytes);
    },
    async delete(key) {
      await call(key, { method: "DELETE" }, [200, 204, 404]);
    },
  };
}

// For tests and local runs without R2: objects live in memory, and "signed"
// URLs are opaque strings the tests can inspect.
export function createMemoryStorage() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: FileStorage & { objects: typeof objects; put(key: string, body: Uint8Array, contentType: string): void } = {
    objects,
    put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async signUpload(key, file, expiresInSeconds) {
      return { url: `memory://upload/${key}?type=${encodeURIComponent(file.contentType)}&size=${file.size}&expires=${expiresInSeconds}`, headers: { "content-type": file.contentType } };
    },
    async signDownload(key, response, expiresInSeconds) {
      return `memory://download/${key}?type=${encodeURIComponent(response.contentType)}&disposition=${encodeURIComponent(response.contentDisposition)}&expires=${expiresInSeconds}`;
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { size: object.body.byteLength, contentType: object.contentType } : null;
    },
    async readStart(key, bytes) {
      return (objects.get(key)?.body ?? new Uint8Array()).slice(0, bytes);
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  return storage;
}

let override: FileStorage | null | undefined;

// The storage in use: R2 when all four settings exist, otherwise none, and
// attaching is switched off (NFR-6). Tests swap in memory storage.
export function configuredStorage(): FileStorage | null {
  if (override !== undefined) return override;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return createR2Storage({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
}

export function setStorageForTests(storage: FileStorage | null | undefined) {
  override = storage;
}
