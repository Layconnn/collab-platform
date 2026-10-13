type ActionError = { data?: { code?: string } | null } | null;

export function discussionActionError(error: ActionError, fallback: string): string | null {
  if (!error) return null;
  if (error.data?.code === "FORBIDDEN" || error.data?.code === "UNAUTHORIZED") {
    return "Your workspace access changed. Refresh before trying again.";
  }
  if (error.data?.code === "NOT_FOUND") return "This discussion is no longer available.";
  if (error.data?.code === "TOO_MANY_REQUESTS") return "Too many attempts. Please wait a minute and try again.";
  return fallback;
}
