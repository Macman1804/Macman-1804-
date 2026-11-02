import assert from "node:assert/strict";
import test from "node:test";
import { placeTelephoneCall, telephoneLine } from "./line.ts";

test("the telephone line is not connected and cannot place a call", () => {
  const line = telephoneLine();
  const attempt = placeTelephoneCall();
  assert.equal(line.connected, false);
  assert.deepEqual(line.missing, ["a telephony provider", "a phone number", "billing"]);
  assert.equal(attempt.ok, false);
  assert.match(attempt.reason, /No call was placed/);
});
