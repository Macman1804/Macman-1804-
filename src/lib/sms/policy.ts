export type SmsConsent = "unknown" | "opted_in" | "opted_out";

export function smsKeyword(consent: SmsConsent, body: string): { consent: SmsConsent; notice: string | null } {
  const word = body.trim().toUpperCase();
  if (word === "STOP" || word === "UNSUBSCRIBE" || word === "CANCEL" || word === "END" || word === "QUIT") {
    return { consent: "opted_out", notice: "You will not receive texts. Reply START to allow them again." };
  }
  if (word === "START" || word === "UNSTOP" || word === "YES") {
    return { consent: "opted_in", notice: "Texts on this account are allowed. Reply STOP to opt out." };
  }
  if (word === "HELP" || word === "INFO") {
    return { consent, notice: "Macman texts stay on your account until you opt in. Reply STOP to opt out." };
  }
  return { consent, notice: null };
}

/** A simulated text is never handed to Twilio. Opt-out wins. Another account is hidden. */
export function simulateSms(input: {
  actorId: string;
  ownerId: string;
  consent: SmsConsent;
  body: string;
}):
  | { ok: true; simulated: true; delivered: false; status: "simulated"; channel: "text" }
  | { ok: false; simulated: true; delivered: false; status: "refused"; reason: string } {
  if (!input.actorId || input.actorId !== input.ownerId) {
    return { ok: false, simulated: true, delivered: false, status: "refused", reason: "That text is not on this account." };
  }
  const keyword = smsKeyword(input.consent, input.body);
  if (keyword.notice && keyword.consent !== input.consent) {
    return {
      ok: true,
      simulated: true,
      delivered: false,
      status: "simulated",
      channel: "text",
    };
  }
  if (input.consent === "opted_out") {
    return { ok: false, simulated: true, delivered: false, status: "refused", reason: "Texts are stopped for this account." };
  }
  if (input.consent !== "opted_in") {
    return { ok: false, simulated: true, delivered: false, status: "refused", reason: "Opt in before a simulated text." };
  }
  if (!input.body.trim()) {
    return { ok: false, simulated: true, delivered: false, status: "refused", reason: "There was nothing to send." };
  }
  return { ok: true, simulated: true, delivered: false, status: "simulated", channel: "text" };
}
