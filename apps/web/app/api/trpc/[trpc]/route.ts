import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "../../../../server/api/root";
import { createTRPCContext } from "../../../../server/api/trpc";
import { initSentry, captureError } from "../../../../server/observability/sentry";

initSentry();

const handler = async (req: Request) => {
  try {
    return await fetchRequestHandler({
      endpoint: "/api/trpc",
      req,
      router: appRouter,
      createContext: () => createTRPCContext({ headers: req.headers, request: req }),
      responseMeta({ ctx }) {
        const headers = new Headers();
        if (ctx?.responseHeaders) {
          ctx.responseHeaders.forEach((value, key) => {
            headers.append(key, value);
          });
        }
        return { headers };
      },
      onError({ error, path, type }) {
        captureError(error, { path, type });
      },
    });
  } catch (error) {
    captureError(error, { route: "trpc" });
    throw error;
  }
};

export { handler as GET, handler as POST };
