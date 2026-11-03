function serverEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
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

export type TwilioReadiness = {
  configured: boolean;
  missing: string[];
  callsEnabled: false;
  smsEnabled: false;
};

/** Credentials may be present later. Calls and texts stay off regardless. */
export function twilioReadiness(): TwilioReadiness {
  const missing = TWILIO_SECRET_NAMES.filter((name) => !serverEnv(name));
  return {
    configured: missing.length === 0,
    missing: [...missing],
    callsEnabled: false,
    smsEnabled: false,
  };
}
