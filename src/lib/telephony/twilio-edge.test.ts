import assert from "node:assert/strict";
import test from "node:test";
import { adminAllowed, handleTwilioCheck } from "../../../supabase/functions/twilio-account/index.ts";

const secret = "super-secret-value";
const sid = "AC11111111111111111111111111111111";

function env(values: Record<string, string>): (name: string) => string | undefined {
  return (name) => values[name];
}

function baseEnv(extra: Record<string, string> = {}) {
  return env({
    SUPABASE_URL: "https://bexuyxicdxtviapavdwi.supabase.co",
    SUPABASE_ANON_KEY: "publishable-key",
    MACMAN_ADMIN_EMAILS: "owner@example.com",
    ...extra,
  });
}

test("an ordinary subscriber never reaches Twilio", async () => {
  const calls: string[] = [];
  const response = await handleTwilioCheck(
    new Request("https://example.com", { method: "POST", headers: { Authorization: "Bearer signed-in-user-token-value" } }),
    baseEnv(),
    async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ email: "member@example.com" }), { status: 200 });
    },
  );
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.reason, "forbidden");
  assert.equal(body.status, undefined);
  assert.deepEqual(calls, ["https://bexuyxicdxtviapavdwi.supabase.co/auth/v1/user"]);
  assert.equal(JSON.stringify(body).includes(secret), false);
});

test("an empty administrator list refuses everyone", () => {
  assert.equal(adminAllowed("owner@example.com", ""), false);
  assert.equal(adminAllowed("owner@example.com", "other@example.com"), false);
  assert.equal(adminAllowed("Owner@Example.com", "owner@example.com"), true);
});

test("an administrator can only read the Twilio account", async () => {
  const calls: { url: string; method: string }[] = [];
  const response = await handleTwilioCheck(
    new Request("https://example.com", { method: "POST", headers: { Authorization: "Bearer signed-in-admin-token-value" } }),
    baseEnv({
      TWILIO_ACCOUNT_SID: sid,
      TWILIO_API_KEY_SID: "SK123",
      TWILIO_API_KEY_SECRET: secret,
    }),
    async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "" });
      if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 200 });
      return new Response(JSON.stringify({ sid, status: "active", auth_token: secret, friendly_name: "Private" }), { status: 200 });
    },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.status, "active");
  assert.equal(body.callsPlaced, false);
  assert.equal(body.smsSent, false);
  assert.equal(body.numbersPurchased, false);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET"]);
  assert.equal(calls[1]?.url, `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`);
  assert.equal(calls[1]?.url.includes("/Calls"), false);
  assert.equal(calls[1]?.url.includes("/Messages"), false);
  const text = JSON.stringify(body);
  assert.equal(text.includes(secret), false);
  assert.equal(text.includes(sid), false);
  assert.equal(text.includes("Private"), false);
});

test("missing Twilio secrets do not call Twilio", async () => {
  let twilio = false;
  const response = await handleTwilioCheck(
    new Request("https://example.com", { method: "POST", headers: { Authorization: "Bearer signed-in-admin-token-value" } }),
    baseEnv(),
    async (input) => {
      if (String(input).includes("twilio.com")) twilio = true;
      return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 200 });
    },
  );
  const body = await response.json();
  assert.equal(twilio, false);
  assert.equal(body.reason, "missing");
});

test("a refused Twilio sign-in places nothing", async () => {
  const response = await handleTwilioCheck(
    new Request("https://example.com", { method: "POST", headers: { Authorization: "Bearer signed-in-admin-token-value" } }),
    baseEnv({
      TWILIO_ACCOUNT_SID: sid,
      TWILIO_API_KEY_SID: "SK123",
      TWILIO_API_KEY_SECRET: secret,
    }),
    async (input) => {
      if (String(input).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 200 });
      return new Response("no", { status: 401 });
    },
  );
  const body = await response.json();
  assert.equal(body.reason, "refused");
  assert.equal(body.callsPlaced, false);
  assert.equal(body.smsSent, false);
});
