import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  TRUSTED_PROXY_TOKEN: z.string().min(16).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  RUN_WORKER_IN_API: z.string().optional(),
  NOTIFICATION_QUEUE_DRIVER: z.enum(["vercel", "bullmq"]).optional(),
  // Daily digest (daily digest PRD). Without RESEND_API_KEY nothing is sent.
  RESEND_API_KEY: z.string().min(1).optional(),
  DIGEST_FROM: z.string().min(3).optional(),
  // "allowlist" (default) sends only to DIGEST_ALLOWLIST; "all" needs a verified domain.
  DIGEST_DELIVERY: z.enum(["allowlist", "all"]).default("allowlist"),
  DIGEST_ALLOWLIST: z.string().optional(),
  // Shared with the scheduler (GitHub Actions) that starts each daily run.
  DIGEST_RUN_SECRET: z.string().min(32).optional(),
  // File uploads (file uploads PRD). Without all four, attaching is switched off.
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  // Local runs and end-to-end tests only: keep files in this folder instead.
  FILES_LOCAL_DIR: z.string().min(1).optional(),
  // Encrypts authenticator secrets (two-step sign-in). Falls back to a key
  // derived from JWT_SECRET; set it before rotating JWT_SECRET.
  TOTP_ENCRYPTION_KEY: z.string().min(32).optional(),
});

export const env = envSchema.parse(process.env);
