import { describe, expect, it } from "vitest";

import { shouldRetryQuery } from "./query-client";

const trpcError = (code: string) => ({ data: { code } });

describe("shouldRetryQuery", () => {
  it("does not retry answers a retry cannot change", () => {
    for (const code of ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "TOO_MANY_REQUESTS"]) {
      expect(shouldRetryQuery(0, trpcError(code))).toBe(false);
    }
  });

  it("retries transient failures up to three times", () => {
    expect(shouldRetryQuery(0, trpcError("INTERNAL_SERVER_ERROR"))).toBe(true);
    expect(shouldRetryQuery(2, new Error("network"))).toBe(true);
    expect(shouldRetryQuery(3, new Error("network"))).toBe(false);
  });

  it("treats errors without a tRPC code as transient", () => {
    expect(shouldRetryQuery(0, null)).toBe(true);
    expect(shouldRetryQuery(0, { data: null })).toBe(true);
  });
});
