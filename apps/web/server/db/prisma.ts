import { PrismaClient as GeneratedPrismaClient } from "../../app/generated/prisma/client";
import { env } from "../env";

type DBPrismaClient = InstanceType<typeof GeneratedPrismaClient>;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: DBPrismaClient | undefined;
}

export const prisma: DBPrismaClient =
  globalThis.__prisma ??
  new GeneratedPrismaClient({
    accelerateUrl: env.DATABASE_URL,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
