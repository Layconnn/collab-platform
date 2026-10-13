"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import { useMemo, useState, type ReactNode } from "react";

import { trpc } from "@/lib/trpc/api-client";
import { createQueryClient } from "@/lib/trpc/query-client";

export function DataProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const trpcClient = useMemo(
    () =>
      trpc.createClient({
        links: [
          loggerLink({
            enabled: (opts) =>
              process.env.NODE_ENV === "development" ||
              (opts.direction === "down" && opts.result instanceof Error),
          }),
          httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
            headers: () => {
              if (typeof window === "undefined") return {};
              const csrfToken = sessionStorage.getItem("csrf_token");
              return csrfToken ? { "x-csrf-token": csrfToken } : {};
            },
          }),
        ],
      }),
    [],
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
