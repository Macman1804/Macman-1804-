import assert from "node:assert/strict";
import test from "node:test";
import { probeTwilioAccount } from "./probe.ts";

const secret = "super-secret-value";
const env = {
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_API_KEY_SID: "SK123",
  TWILIO_API_KEY_SECRET: secret,
};

test("a missing Twilio key never calls the network", async () => {
  let called = false;
  const result = await probeTwilioAccount({
    env: { TWILIO_ACCOUNT_SID: "AC123" },
    fetchImpl: async () => {
      called = true;
      return new Response("no");
    },
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.authenticated, false);
  if (!result.ok) assert.deepEqual(result.missing, ["TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET"]);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("the account check is read-only and does not reveal the key", async () => {
  let method = "";
  let url = "";
  const result = await probeTwilioAccount({
    env,
    fetchImpl: async (input, init) => {
      method = init?.method ?? "";
      url = String(input);
      assert.equal(init?.body, undefined);
      return new Response(JSON.stringify({ sid: "AC123", status: "active", auth_token: secret }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(method, "GET");
  assert.equal(url, "https://api.twilio.com/2010-04-01/Accounts/AC123.json");
  assert.equal(url.includes("/Calls"), false);
  assert.equal(url.includes("/Messages"), false);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.status, "active");
  assert.equal(result.callsPlaced, false);
  assert.equal(result.smsSent, false);
  assert.equal(result.numbersPurchased, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("a refused sign-in does not place a call", async () => {
  const result = await probeTwilioAccount({
    env,
    fetchImpl: async () => new Response("denied", { status: 401 }),
  });
  assert.equal(result.authenticated, false);
  if (!result.ok) assert.equal(result.reason, "refused");
  assert.equal(result.callsPlaced, false);
  assert.equal(result.smsSent, false);
});
