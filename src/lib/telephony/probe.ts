export const TWILIO_API_SECRET_NAMES = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
] as const;

export type TwilioProbe =
  | {
      ok: true;
      authenticated: true;
      status: string;
      callsPlaced: false;
      smsSent: false;
      numbersPurchased: false;
    }
  | {
      ok: false;
      authenticated: false;
      reason: "missing" | "refused" | "failed";
      missing: string[];
      callsPlaced: false;
      smsSent: false;
      numbersPurchased: false;
    };

function readEnv(env: Record<string, string | undefined> | undefined, name: string): string {
  const source = env ?? process.env;
  return source[name]?.trim() ?? "";
}

/** Names only. A read of the account. No calls, texts, or number purchases. */
export async function probeTwilioAccount(options: {
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
} = {}): Promise<TwilioProbe> {
  const closed = { callsPlaced: false as const, smsSent: false as const, numbersPurchased: false as const };
  const missing = TWILIO_API_SECRET_NAMES.filter((name) => !readEnv(options.env, name));
  if (missing.length > 0) {
    return { ok: false, authenticated: false, reason: "missing", missing: [...missing], ...closed };
  }
  const sid = readEnv(options.env, "TWILIO_ACCOUNT_SID");
  const key = readEnv(options.env, "TWILIO_API_KEY_SID");
  const secret = readEnv(options.env, "TWILIO_API_KEY_SECRET");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`;
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { ok: false, authenticated: false, reason: "refused", missing: [], ...closed };
    const body = (await response.json()) as { status?: unknown; sid?: unknown };
    if (typeof body.sid === "string" && body.sid !== sid) {
      return { ok: false, authenticated: false, reason: "refused", missing: [], ...closed };
    }
    const status = typeof body.status === "string" ? body.status.slice(0, 40) : "unknown";
    return { ok: true, authenticated: true, status, ...closed };
  } catch {
    return { ok: false, authenticated: false, reason: "failed", missing: [], ...closed };
  }
}
