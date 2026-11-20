import { QueryClient } from "@tanstack/react-query";

// Retrying cannot change these answers, and each retry waits longer: three
// retries of an UNAUTHORIZED query after sign-out kept it pending for ~7 s.
const FINAL_ERROR_CODES = new Set(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "TOO_MANY_REQUESTS"]);
const MAX_RETRIES = 3;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const code = (error as { data?: { code?: unknown } | null } | null)?.data?.code;
  if (typeof code === "string" && FINAL_ERROR_CODES.has(code)) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
      },
    },
  });
}
