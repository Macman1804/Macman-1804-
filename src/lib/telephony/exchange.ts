const E164 = /^\+[1-9]\d{7,14}$/;

export type PhoneAssignment = {
  subscriberId: string;
  e164: string;
};

export type SetupStep = {
  id: string;
  title: string;
  detail: string;
};

/** Shown in the app. Nothing in this list buys a number or turns billing on. */
export const SETUP_CHECKLIST: readonly SetupStep[] = [
  {
    id: "desktop",
    title: "Finish Twilio on a computer",
    detail: "The Android onboarding screen can be skipped. Open the Twilio console in a desktop browser.",
  },
  {
    id: "api-key",
    title: "Create a Standard API key",
    detail: "Account, then API keys and tokens. Leave the secret in Twilio. Do not paste it into chat.",
  },
  {
    id: "secrets",
    title: "Store four server secrets",
    detail:
      "TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_AUTH_TOKEN. Server only. Never prefix them with VITE_.",
  },
  {
    id: "verify",
    title: "Verify the Twilio account",
    detail: "Complete Twilio's identity and address checks before any number can be used.",
  },
  {
    id: "regulatory",
    title: "Regulatory registration waits for your approval",
    detail:
      "A US texting number needs A2P 10DLC. Outbound voice may need a voice trust profile. Do not start either until you approve the cost.",
  },
  {
    id: "number",
    title: "Approve one number before it is bought",
    detail: "No number is purchased until you approve the monthly cost. It is then assigned to one subscriber only.",
  },
  {
    id: "webhooks",
    title: "Attach webhooks only after approval",
    detail: "Voice and SMS webhooks must be https. Until then, both routes refuse every request.",
  },
];

export function isE164(value: string): boolean {
  return E164.test(value);
}

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

/** Describes an assignment. It does not buy a number or write to the database. */
export function assignNumber(
  actorId: string,
  subscriberId: string,
  e164: string,
  existing: readonly PhoneAssignment[],
): { ok: true; assignment: PhoneAssignment; purchased: false } | { ok: false; reason: string; purchased: false } {
  if (!actorId || actorId !== subscriberId) {
    return { ok: false, purchased: false, reason: "A number can be assigned only to the signed-in account." };
  }
  if (!isE164(e164)) return { ok: false, purchased: false, reason: "That is not a phone number." };
  const taken = existing.find((row) => row.e164 === e164);
  if (taken && taken.subscriberId !== actorId) {
    return { ok: false, purchased: false, reason: "That number belongs to another account." };
  }
  return { ok: true, purchased: false, assignment: taken ?? { subscriberId: actorId, e164 } };
}

export type CarrierKind = "voice" | "sms";
export type CallStatus = "received" | "refused" | "simulated" | "completed" | "failed";

export type ExchangePlan = {
  simulated: boolean;
  delivered: false;
  live: "off";
  status: "simulated" | "refused";
  channel: "voice" | "text" | null;
  ownerId: string | null;
  reason: string;
  usage: { channel: "voice" | "text"; units: 1; estimatedCostUsd: 0; simulated: true } | null;
};

function memoryChannel(kind: CarrierKind): "voice" | "text" {
  return kind === "sms" ? "text" : "voice";
}

export function planInbound(input: {
  kind: CarrierKind;
  actorId: string;
  called: string;
  body: string;
  assignments: readonly PhoneAssignment[];
}): ExchangePlan {
  const owned = input.assignments.find((row) => row.e164 === input.called && row.subscriberId === input.actorId);
  if (!owned) {
    return {
      simulated: false,
      delivered: false,
      live: "off",
      status: "refused",
      channel: null,
      ownerId: null,
      reason: "That number is not on this account.",
      usage: null,
    };
  }
  const body = input.body.trim();
  if (!body) {
    return {
      simulated: false,
      delivered: false,
      live: "off",
      status: "refused",
      channel: null,
      ownerId: input.actorId,
      reason: "There was nothing to answer.",
      usage: null,
    };
  }
  const channel = memoryChannel(input.kind);
  return {
    simulated: true,
    delivered: false,
    live: "off",
    status: "simulated",
    channel,
    ownerId: input.actorId,
    reason:
      input.kind === "sms"
        ? "Simulated text. Nothing was sent to a phone."
        : "Simulated call. Nothing was dialed.",
    usage: { channel, units: 1, estimatedCostUsd: 0, simulated: true },
  };
}

export function planOutbound(): { delivered: false; live: "off"; status: "refused"; reason: string } {
  return {
    delivered: false,
    live: "off",
    status: "refused",
    reason: "Outbound voice and SMS are prepared and were not sent to Twilio.",
  };
}

export function nextCallStatus(event: "webhook" | "reject" | "simulate" | "finish" | "error"): CallStatus {
  if (event === "webhook") return "received";
  if (event === "reject") return "refused";
  if (event === "simulate") return "simulated";
  if (event === "finish") return "completed";
  return "failed";
}
