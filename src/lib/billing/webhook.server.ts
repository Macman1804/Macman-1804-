import { createHmac, timingSafeEqual } from "node:crypto";
import { billingWebhook } from "./plans.ts";

function serverEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[key]?.trim();
  return value || undefined;
}

export function paymentSignature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function signaturesMatch(expected: string, header: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(header);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** Accepts no event. Card fields are ignored. Billing stays off. */
export async function handlePaymentWebhook(request: Request): Promise<Response> {
  try {
    const secret = serverEnv("BILLING_WEBHOOK_SECRET");
    const body = await request.text();
    const header = request.headers.get("x-macman-signature") ?? "";
    const valid = Boolean(secret) && signaturesMatch(paymentSignature(body, secret ?? ""), header);
    let eventAccount = "";
    let type = "";
    try {
      const parsed = JSON.parse(body) as { account?: unknown; type?: unknown; card?: unknown };
      if (parsed.card !== undefined) type = "card";
      else if (typeof parsed.type === "string") type = parsed.type.slice(0, 80);
      if (typeof parsed.account === "string") eventAccount = parsed.account;
    } catch {
      type = "";
    }
    const decision = billingWebhook({
      signatureValid: valid,
      actorAccount: eventAccount || null,
      eventAccount,
      type,
    });
    return new Response(decision.reason, { status: 403 });
  } catch {
    return new Response("Billing is not on.", { status: 403 });
  }
}
