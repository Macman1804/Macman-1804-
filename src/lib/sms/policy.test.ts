import assert from "node:assert/strict";
import test from "node:test";
import { simulateSms, smsKeyword } from "./policy.ts";

test("STOP opts out and a simulated text is not delivered", () => {
  assert.equal(smsKeyword("opted_in", "stop").consent, "opted_out");
  assert.equal(smsKeyword("opted_out", "START").consent, "opted_in");
  const sent = simulateSms({ actorId: "owner-a", ownerId: "owner-a", consent: "opted_in", body: "Bring the key." });
  assert.equal(sent.ok, true);
  assert.equal(sent.delivered, false);
  assert.equal(sent.status, "simulated");
  const blocked = simulateSms({ actorId: "owner-a", ownerId: "owner-a", consent: "opted_out", body: "Bring the key." });
  assert.equal(blocked.ok, false);
  const missing = simulateSms({ actorId: "owner-a", ownerId: "owner-a", consent: "unknown", body: "Hello" });
  assert.equal(missing.ok, false);
});

test("another account cannot receive the simulated text", () => {
  const crossed = simulateSms({ actorId: "owner-a", ownerId: "owner-b", consent: "opted_in", body: "Hello" });
  assert.equal(crossed.ok, false);
  assert.equal(JSON.stringify(crossed).includes("owner-b"), false);
});
