/** A message safe to show. Raw database and credential text stays on the server. */
export function publicError(message: string | undefined, fallback: string): string {
  const text = (message ?? "").trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "That email or password is not right.";
  }
  if (lower.includes("email not confirmed")) return "Confirm the email, then sign in.";
  if (lower.includes("rate limit") || lower.includes("too many")) return "Wait a moment, then try again.";
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "That email already has an account. Sign in instead.";
  }
  if (/jwt|bearer|stack trace|schema|relation "|duplicate key|api[_ -]?key|service_role|sk-/i.test(text)) {
    return fallback;
  }
  if (text.length > 160) return fallback;
  return text;
}
