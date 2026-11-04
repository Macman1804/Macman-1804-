import { createServerFn } from "@tanstack/react-start";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { admit } from "@/lib/security/pace";
import { publicSupabaseEnv } from "@/lib/supabase/public-env";

const guards = [supabaseMiddleware];
const checks = new Map<string, number[]>();

type Scope = { supabaseUserId: string; supabaseAccessToken: string };

type EdgeCheck = {
  ok: boolean;
  authenticated: boolean;
  reason?: "forbidden" | "missing" | "refused" | "failed" | "pace";
  status?: string;
  callsPlaced: false;
  smsSent: false;
  numbersPurchased: false;
};

const CLOSED = { callsPlaced: false as const, smsSent: false as const, numbersPurchased: false as const };

function privateResult(reason: EdgeCheck["reason"]): EdgeCheck {
  return { ok: false, authenticated: false, reason, ...CLOSED };
}

function readEdgeBody(value: unknown): EdgeCheck {
  if (!value || typeof value !== "object") return privateResult("failed");
  const body = value as Record<string, unknown>;
  if (body.ok !== true) {
    const reason = body.reason;
    if (reason === "forbidden" || reason === "missing" || reason === "refused" || reason === "failed") {
      return privateResult(reason);
    }
    return privateResult("failed");
  }
  const status = body.status === "active" || body.status === "suspended" || body.status === "closed" ? body.status : "unknown";
  return { ok: true, authenticated: true, status, ...CLOSED };
}

export const checkTwilioAccount = createServerFn({ method: "POST" })
  .middleware(guards)
  .handler(async ({ context }): Promise<EdgeCheck> => {
    const scope = context as unknown as Scope;
    const pace = admit(checks.get(scope.supabaseUserId) ?? [], Date.now(), 5, 10 * 60 * 1000);
    checks.set(scope.supabaseUserId, pace.next);
    if (!pace.ok) return privateResult("pace");
    const pub = publicSupabaseEnv();
    if (!pub || !scope.supabaseAccessToken) return privateResult("failed");
    try {
      const response = await fetch(`${pub.url.replace(/\/$/, "")}/functions/v1/twilio-account`, {
        method: "POST",
        headers: { Authorization: `Bearer ${scope.supabaseAccessToken}`, apikey: pub.key },
        signal: AbortSignal.timeout(15000),
      });
      return readEdgeBody(await response.json());
    } catch {
      return privateResult("failed");
    }
  });
