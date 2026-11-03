import { createHmac, timingSafeEqual } from "node:crypto";
import { callerIdFor, isE164 } from "./exchange.ts";
import { twilioReadiness, TWILIO_SECRET_NAMES } from "./readiness.ts";

export { callerIdFor, isE164 };
export { twilioReadiness, TWILIO_SECRET_NAMES };
export type { PhoneAssignment } from "./exchange.ts";
export type { TwilioReadiness } from "./readiness.ts";

function serverEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[key]?.trim();
  return value || undefined;
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

const CLOSED = "Macman telephone is not enabled.";

async function refuseWebhook(request: Request): Promise<Response> {
  try {
    const readiness = twilioReadiness();
    if (!readiness.configured || readiness.callsEnabled || readiness.smsEnabled) {
      return new Response(CLOSED, { status: 403 });
    }
    const token = serverEnv("TWILIO_AUTH_TOKEN") ?? "";
    const signature = request.headers.get("x-twilio-signature") ?? "";
    const params = Object.fromEntries(new URLSearchParams(await request.text()));
    const url = serverEnv("TWILIO_WEBHOOK_URL") ?? request.url;
    const valid = token.length > 0 && signaturesMatch(twilioSignature(url, params, token), signature);
    const decision = inboundDecision({
      configured: true,
      callsEnabled: false,
      signatureValid: valid,
      ownerId: null,
    });
    if (decision.action !== "reject") return new Response(CLOSED, { status: 403 });
    return new Response(CLOSED, { status: 403 });
  } catch {
    return new Response(CLOSED, { status: 403 });
  }
}

export function handleInboundVoice(request: Request): Promise<Response> {
  return refuseWebhook(request);
}

export function handleInboundSms(request: Request): Promise<Response> {
  return refuseWebhook(request);
}
