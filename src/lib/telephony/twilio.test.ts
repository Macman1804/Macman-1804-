import assert from "node:assert/strict";
import test from "node:test";
import {
  callerIdFor,
  inboundDecision,
  isE164,
  outboundCallRequest,
  outboundDecision,
  signaturesMatch,
  twilioReadiness,
  twilioSignature,
} from "./twilio.server.ts";

test("Twilio readiness lists secret names and never enables a call", () => {
  const saved = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_API_KEY_SID",
    "TWILIO_API_KEY_SECRET",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_CALLS_ENABLED",
  ].map((name) => [name, process.env[name]] as const);
  for (const [name] of saved) delete process.env[name];
  try {
    const missing = twilioReadiness();
    assert.equal(missing.configured, false);
    assert.equal(missing.callsEnabled, false);
    assert.deepEqual(missing.missing, [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_API_KEY_SID",
      "TWILIO_API_KEY_SECRET",
      "TWILIO_AUTH_TOKEN",
    ]);
    for (const [name] of saved) process.env[name] = "present";
    process.env.TWILIO_CALLS_ENABLED = "true";
    const ready = twilioReadiness();
    assert.equal(ready.configured, true);
    assert.equal(ready.callsEnabled, false);
    assert.equal(JSON.stringify(ready).includes("present"), false);
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("a dedicated subscriber number is preferred over the shared number", () => {
  assert.equal(
    callerIdFor("owner", [{ subscriberId: "owner", e164: "+15551212001" }], "+15551212000"),
    "+15551212001",
  );
  assert.equal(callerIdFor("other", [{ subscriberId: "owner", e164: "+15551212001" }], "+15551212000"), "+15551212000");
  assert.equal(callerIdFor("other", [], null), null);
  assert.equal(callerIdFor("other", [], "not-a-number"), null);
  assert.equal(isE164("+15551212000"), true);
  assert.equal(isE164("5551212000"), false);
});

test("the Twilio signature matches an independently signed body", () => {
  const url = "https://example.com/api/twilio/voice";
  const params = { CallSid: "CA123", From: "+15551212000" };
  const token = "test-auth-token";
  const signature = twilioSignature(url, params, token);
  assert.equal(signaturesMatch(signature, signature), true);
  assert.equal(signaturesMatch(signature, "nope"), false);
  assert.equal(twilioSignature(url, params, "other-token") === signature, false);
});

test("inbound and outbound calls are refused before any request is sent", () => {
  assert.deepEqual(
    inboundDecision({ configured: true, callsEnabled: false, signatureValid: true, ownerId: "owner" }),
    { action: "reject", reason: "Telephone calls are not approved." },
  );
  assert.equal(
    inboundDecision({ configured: true, callsEnabled: true, signatureValid: true, ownerId: null }).action,
    "reject",
  );
  assert.deepEqual(
    inboundDecision({ configured: true, callsEnabled: true, signatureValid: true, ownerId: "owner" }),
    { action: "ready", ownerId: "owner" },
  );
  const refused = outboundDecision({
    configured: true,
    callsEnabled: true,
    to: "+15551212002",
    from: "+15551212001",
  });
  assert.equal(refused.action, "refuse");
  assert.match(refused.reason, /not sent to Twilio/);
  const request = outboundCallRequest({
    to: "+15551212002",
    from: "+15551212001",
    webhookUrl: "https://example.com/api/twilio/voice",
  });
  assert.equal(request?.body.get("To"), "+15551212002");
  assert.equal(request?.url.includes("{AccountSid}"), true);
  assert.equal(outboundCallRequest({ to: "555", from: "+15551212001", webhookUrl: "https://example.com" }), null);
  assert.equal(
    outboundCallRequest({ to: "+15551212002", from: "+15551212001", webhookUrl: "http://example.com/voice" }),
    null,
  );
});
