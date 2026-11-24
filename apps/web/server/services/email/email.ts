import { env } from "../../env";

// Sending email through Resend's HTTP API (daily digest PRD). A small adapter
// instead of an SDK: easy to replace, and tests pass their own sender.

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type EmailSender = (email: OutgoingEmail) => Promise<{ id: string }>;

export class EmailError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
  }
}

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Commons <onboarding@resend.dev>";

export function createResendSender(options: { apiKey: string; from?: string; fetchImpl?: typeof fetch }): EmailSender {
  const send = options.fetchImpl ?? fetch;
  return async (email) => {
    const response = await send(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: options.from ?? DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.headers ? { headers: email.headers } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!response.ok || !body.id) {
      // Rate limits and server errors are worth retrying; a rejected address is not.
      const retryable = response.status === 429 || response.status >= 500;
      throw new EmailError(`Resend ${response.status}: ${body.message ?? body.name ?? "no message"}`.slice(0, 300), response.status, retryable);
    }
    return { id: body.id };
  };
}

// The sender for this deployment, or null when email is not configured.
export function configuredSender(): EmailSender | null {
  if (!env.RESEND_API_KEY) return null;
  return createResendSender({ apiKey: env.RESEND_API_KEY, from: env.DIGEST_FROM });
}
