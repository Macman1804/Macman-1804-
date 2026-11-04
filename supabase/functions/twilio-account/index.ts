const CLOSED = { callsPlaced: false, smsSent: false, numbersPurchased: false } as const;

type EdgeEnv = (name: string) => string | undefined;

export type TwilioEdgeBody = {
  ok: boolean;
  authenticated: boolean;
  reason?: "forbidden" | "missing" | "refused" | "failed";
  status?: string;
  callsPlaced: false;
  smsSent: false;
  numbersPurchased: false;
};

function json(body: TwilioEdgeBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function forbidden(): Response {
  return json({ ok: false, authenticated: false, reason: "forbidden", ...CLOSED }, 403);
}

export function adminAllowed(email: string | null, allowlist: string): boolean {
  const allowed = allowlist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("@"));
  const caller = email?.trim().toLowerCase() ?? "";
  return caller.length > 0 && allowed.includes(caller);
}

function publishableKey(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (!value) return "";
  if (!value.startsWith("{")) return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const first = Object.values(parsed).find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim() : "";
  } catch {
    return "";
  }
}

function accountUrl(sid: string): string | null {
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) return null;
  return `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`;
}

/** Read-only account check. Secrets and account identifiers are never returned. */
export async function handleTwilioCheck(request: Request, envGet: EdgeEnv, fetchImpl: typeof fetch): Promise<Response> {
  if (request.method !== "POST") return forbidden();
  const authorization = request.headers.get("Authorization") ?? "";
  if (!/^Bearer \S{20,}$/.test(authorization)) return forbidden();
  const supabaseUrl = envGet("SUPABASE_URL")?.trim().replace(/\/$/, "") ?? "";
  const apikey = envGet("SUPABASE_ANON_KEY")?.trim() || publishableKey(envGet("SUPABASE_PUBLISHABLE_KEYS"));
  if (!supabaseUrl.startsWith("https://") || !apikey) {
    return json({ ok: false, authenticated: false, reason: "failed", ...CLOSED }, 403);
  }
  let email: string | null = null;
  try {
    const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: { Authorization: authorization, apikey },
    });
    if (!userResponse.ok) return forbidden();
    const user = (await userResponse.json()) as { email?: unknown };
    email = typeof user.email === "string" ? user.email : null;
  } catch {
    return json({ ok: false, authenticated: false, reason: "failed", ...CLOSED }, 403);
  }
  if (!adminAllowed(email, envGet("MACMAN_ADMIN_EMAILS") ?? "")) return forbidden();

  const sid = envGet("TWILIO_ACCOUNT_SID")?.trim() ?? "";
  const key = envGet("TWILIO_API_KEY_SID")?.trim() ?? "";
  const secret = envGet("TWILIO_API_KEY_SECRET")?.trim() ?? "";
  const url = accountUrl(sid);
  if (!url || !key || !secret) {
    return json({ ok: false, authenticated: false, reason: "missing", ...CLOSED }, 403);
  }
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
    });
    if (!response.ok) return json({ ok: false, authenticated: false, reason: "refused", ...CLOSED }, 403);
    const body = (await response.json()) as { status?: unknown };
    const status = body.status === "active" || body.status === "suspended" || body.status === "closed" ? body.status : "unknown";
    return json({ ok: true, authenticated: true, status, ...CLOSED }, 200);
  } catch {
    return json({ ok: false, authenticated: false, reason: "failed", ...CLOSED }, 403);
  }
}

const deno = (globalThis as { Deno?: { serve: (handler: (request: Request) => Promise<Response>) => void; env: { get: EdgeEnv } } }).Deno;
if (deno) {
  deno.serve((request) => handleTwilioCheck(request, deno.env.get, fetch));
}
