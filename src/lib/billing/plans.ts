/** Price chosen by the account owner. Nothing is charged and no card is stored. */
export const TELEPHONE_PLAN = {
  id: "telephone_month",
  name: "Telephone",
  priceUsd: 20,
  currency: "USD",
  interval: "month",
  billing: false,
  cardStored: false,
} as const;

const DESK_FEATURES = new Set(["desk", "voice", "mail", "text"]);
const LOCKED_FEATURES = new Set(["phone", "live_sms", "outside_send"]);

export type Feature = "desk" | "voice" | "mail" | "text" | "phone" | "live_sms" | "outside_send";

/** The desk keeps working. The telephone price is set, and no one is charged. */
export function entitlement(feature: Feature): { allowed: boolean; billing: false; reason: string } {
  if (LOCKED_FEATURES.has(feature)) {
    return {
      allowed: false,
      billing: false,
      reason: `The telephone plan is $${TELEPHONE_PLAN.priceUsd} a month. Nothing has been charged.`,
    };
  }
  if (DESK_FEATURES.has(feature)) {
    return { allowed: true, billing: false, reason: "Included on the desk. No charge." };
  }
  return { allowed: false, billing: false, reason: "That plan is not available." };
}

export function changeSubscription(input: {
  actorId: string;
  ownerId: string;
  planId: string;
  billing: boolean;
}): { ok: false; billing: false; reason: string } {
  if (!input.actorId || input.actorId !== input.ownerId) {
    return { ok: false, billing: false, reason: "That subscription is not on this account." };
  }
  return {
    ok: false,
    billing: false,
    reason: `The telephone plan is $${TELEPHONE_PLAN.priceUsd} a month. Nothing was charged. No card was taken.`,
  };
}

/** A billing cap is not set. A caller may pass a test cap. Crossing it does not charge anyone. */
export function meterUsage(input: {
  actorId: string;
  ownerId: string;
  used: number;
  cap: number | null;
}): { ok: boolean; billing: false; reason: string } {
  if (!input.actorId || input.actorId !== input.ownerId) {
    return { ok: false, billing: false, reason: "That usage is not on this account." };
  }
  if (input.cap !== null && input.used >= input.cap) {
    return { ok: false, billing: false, reason: "The placeholder limit is reached. Billing is not on." };
  }
  return { ok: true, billing: false, reason: "Recorded. No charge." };
}

export function billingWebhook(input: {
  signatureValid: boolean;
  actorAccount: string | null;
  eventAccount: string;
  type: string;
}): { accepted: false; billing: false; cardStored: false; reason: string } {
  if (!input.signatureValid) {
    return { accepted: false, billing: false, cardStored: false, reason: "The payment signature is not valid." };
  }
  if (!input.actorAccount || input.actorAccount !== input.eventAccount) {
    return { accepted: false, billing: false, cardStored: false, reason: "That payment event is not for this account." };
  }
  if (input.type === "card" || input.type.includes("card")) {
    return { accepted: false, billing: false, cardStored: false, reason: "Card details are not stored." };
  }
  return { accepted: false, billing: false, cardStored: false, reason: "Billing is not on. The event was not applied." };
}
