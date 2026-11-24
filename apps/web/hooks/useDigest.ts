"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useDigestPreview(enabled: boolean) {
  return trpc.digest.preview.useQuery(undefined, { enabled, staleTime: 60_000 });
}
