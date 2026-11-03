import assert from "node:assert/strict";
import test from "node:test";
import { futureGrokCall, placeTelephoneCall, telephoneLine } from "./line.ts";

test("the telephone line is not connected and cannot place a call", () => {
  const line = telephoneLine();
  const attempt = placeTelephoneCall();
  assert.equal(line.connected, false);
  assert.deepEqual(line.missing, ["a telephony provider", "a phone number", "billing"]);
  assert.equal(attempt.ok, false);
  assert.match(attempt.reason, /No call was placed/);
});

test("a future Grok call test does not dial and has no number", () => {
  const testCall = futureGrokCall();
  assert.equal(testCall.caller, "Grok");
  assert.equal(testCall.live, "off");
  assert.equal(testCall.delivered, false);
  assert.equal(testCall.dialed, false);
  assert.equal(testCall.number, null);
});
