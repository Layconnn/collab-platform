import { TRPCError } from "@trpc/server";

export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
  | "INTERNAL";

const trpcCodeByAppCode: Record<AppErrorCode, TRPCError["code"]> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
  INTERNAL: "INTERNAL_SERVER_ERROR",
};

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.code = code;
    this.cause = options?.cause;
  }
}

export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }

  if (error instanceof AppError) {
    return new TRPCError({
      code: trpcCodeByAppCode[error.code],
      message: error.message,
      cause: error.cause,
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error.",
    cause: error,
  });
}
