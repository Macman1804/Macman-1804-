export const TELEPHONE_MISSING = ["a telephony provider", "a phone number", "billing"] as const;

export type TelephoneLine = {
  connected: false;
  missing: typeof TELEPHONE_MISSING;
};

/** Browser voice is separate. This line is not purchased and cannot place a call. */
export function telephoneLine(): TelephoneLine {
  return { connected: false, missing: TELEPHONE_MISSING };
}

export function placeTelephoneCall(): { ok: false; reason: string } {
  const missing = telephoneLine().missing.join(", ");
  return {
    ok: false,
    reason: `No call was placed. Still needed: ${missing}.`,
  };
}
