import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  TRUSTED_PROXY_TOKEN: z.string().min(16).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  RUN_WORKER_IN_API: z.string().optional(),
});

export const env = envSchema.parse(process.env);
