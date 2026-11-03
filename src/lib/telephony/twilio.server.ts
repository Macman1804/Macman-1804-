import { createHmac, timingSafeEqual } from "node:crypto";

function serverEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

/** Names only. Values stay in the server environment and are never returned. */
export const TWILIO_SECRET_NAMES = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
] as const;

const E164 = /^\+[1-9]\d{7,14}$/;

export type TwilioReadiness = {
  configured: boolean;
  missing: string[];
  callsEnabled: false;
};

export type PhoneAssignment = {
  subscriberId: string;
  e164: string;
};

/** Credentials are absent until the server environment has every name. Calls stay off. */
export function twilioReadiness(): TwilioReadiness {
  const missing = TWILIO_SECRET_NAMES.filter((name) => !serverEnv(name));
  return { configured: missing.length === 0, missing: [...missing], callsEnabled: false };
}

export function isE164(value: string): boolean {
  return E164.test(value);
}

/** A subscriber number wins. A shared number is only a fallback. Neither is purchased here. */
export function callerIdFor(
  subscriberId: string,
  assignments: readonly PhoneAssignment[],
  shared: string | null,
): string | null {
  const own = assignments.find((row) => row.subscriberId === subscriberId)?.e164 ?? null;
  if (own && isE164(own)) return own;
  if (shared && isE164(shared)) return shared;
  return null;
}

export function twilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((sum, key) => sum + key + params[key], url);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function signaturesMatch(expected: string, header: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(header);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function inboundDecision(input: {
  configured: boolean;
  callsEnabled: boolean;
  signatureValid: boolean;
  ownerId: string | null;
}): { action: "reject"; reason: string } | { action: "ready"; ownerId: string } {
  if (!input.configured) return { action: "reject", reason: "Twilio credentials are not on the server." };
  if (!input.signatureValid) return { action: "reject", reason: "The Twilio signature is not valid." };
  if (!input.callsEnabled) return { action: "reject", reason: "Telephone calls are not approved." };
  if (!input.ownerId) return { action: "reject", reason: "This number is not assigned to a subscriber." };
  return { action: "ready", ownerId: input.ownerId };
}

export function outboundDecision(input: {
  configured: boolean;
  callsEnabled: boolean;
  to: string;
  from: string | null;
}): { action: "refuse"; reason: string } {
  if (!input.configured) return { action: "refuse", reason: "Twilio credentials are not on the server." };
  if (!input.callsEnabled) return { action: "refuse", reason: "Telephone calls are not approved." };
  if (!input.from || !isE164(input.from)) return { action: "refuse", reason: "No caller ID is assigned." };
  if (!isE164(input.to)) return { action: "refuse", reason: "The destination is not a phone number." };
  return { action: "refuse", reason: "Outbound calling is prepared and was not sent to Twilio." };
}

/** No network call. A prepared request is not a placed call. */
export function outboundCallRequest(input: { to: string; from: string; webhookUrl: string }): {
  url: string;
  body: URLSearchParams;
} | null {
  if (!isE164(input.to) || !isE164(input.from)) return null;
  let webhook: URL;
  try {
    webhook = new URL(input.webhookUrl);
  } catch {
    return null;
  }
  if (webhook.protocol !== "https:") return null;
  const body = new URLSearchParams();
  body.set("To", input.to);
  body.set("From", input.from);
  body.set("Url", webhook.toString());
  return { url: "https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Calls.json", body };
}

export async function handleInboundVoice(request: Request): Promise<Response> {
  const readiness = twilioReadiness();
  if (!readiness.configured) {
    return new Response("Macman telephone is not enabled.", { status: 403 });
  }
  const token = serverEnv("TWILIO_AUTH_TOKEN");
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const params = Object.fromEntries(new URLSearchParams(await request.text()));
  const url = serverEnv("TWILIO_WEBHOOK_URL") ?? request.url;
  const valid = Boolean(token) && signaturesMatch(twilioSignature(url, params, token ?? ""), signature);
  const decision = inboundDecision({
    configured: true,
    callsEnabled: false,
    signatureValid: valid,
    ownerId: null,
  });
  if (decision.action === "reject") {
    return new Response("Macman telephone is not enabled.", { status: 403 });
  }
  return new Response("Macman telephone is not enabled.", { status: 403 });
}
