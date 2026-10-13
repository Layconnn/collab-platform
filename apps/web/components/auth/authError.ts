export function authErrorMessage(error: unknown, action: "login" | "register") {
  const code = typeof error === "object" && error !== null && "data" in error
    ? (error.data as { code?: string } | null)?.code
    : undefined;

  if (code === "TOO_MANY_REQUESTS") return "Too many attempts. Please wait a moment and try again.";
  if (action === "login" && (code === "UNAUTHORIZED" || code === "BAD_REQUEST")) {
    return "Email or password is incorrect.";
  }
  if (action === "register" && code === "CONFLICT") {
    return "That email or username is unavailable. Try another one.";
  }
  return "We couldn't complete that request. Please try again in a moment.";
}
