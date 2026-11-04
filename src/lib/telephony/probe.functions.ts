import { createServerFn } from "@tanstack/react-start";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { admit } from "@/lib/security/pace";
import { probeTwilioAccount } from "@/lib/telephony/probe";

const guards = [supabaseMiddleware];
const checks = new Map<string, number[]>();

type Scope = { supabaseUserId: string };

export const checkTwilioAccount = createServerFn({ method: "POST" })
  .middleware(guards)
  .handler(async ({ context }) => {
    const userId = (context as unknown as Scope).supabaseUserId;
    const pace = admit(checks.get(userId) ?? [], Date.now(), 5, 10 * 60 * 1000);
    checks.set(userId, pace.next);
    if (!pace.ok) {
      return {
        ok: false as const,
        authenticated: false as const,
        reason: "pace" as const,
        missing: [] as string[],
        callsPlaced: false as const,
        smsSent: false as const,
        numbersPurchased: false as const,
      };
    }
    return probeTwilioAccount();
  });
