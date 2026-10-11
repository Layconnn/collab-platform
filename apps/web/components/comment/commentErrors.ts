type ActionError = { data?: { code?: string } | null } | null;

export function commentActionError(error: ActionError, fallback: string): string | null {
  if (!error) return null;
  if (error.data?.code === "FORBIDDEN" || error.data?.code === "UNAUTHORIZED") {
    return "Your workspace access changed. Refresh the discussion before trying again.";
  }
  if (error.data?.code === "NOT_FOUND") {
    return "This comment or discussion is no longer available.";
  }
  if (error.data?.code === "TOO_MANY_REQUESTS") {
    return "Please wait a moment before trying again.";
  }
  return fallback;
}
