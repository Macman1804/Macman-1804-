import assert from "node:assert/strict";
import test from "node:test";
import { SETUP_CHECKLIST, assignNumber, nextCallStatus, planInbound, planOutbound } from "./exchange.ts";

const lines = [
  { subscriberId: "owner-a", e164: "+15551212001" },
  { subscriberId: "owner-b", e164: "+15551212002" },
];

test("the setup checklist does not turn on billing or buy a number", () => {
  const text = SETUP_CHECKLIST.map((step) => `${step.title} ${step.detail}`).join(" ");
  assert.equal(SETUP_CHECKLIST.length >= 7, true);
  assert.match(text, /Do not paste it into chat/);
  assert.match(text, /A2P 10DLC/);
  assert.match(text, /No number is purchased/);
  assert.equal(text.includes("sk_live"), false);
});

test("a number can belong to only one signed-in account", () => {
  const claimed = assignNumber("owner-a", "owner-a", "+15551212009", lines);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.purchased, false);
  if (claimed.ok) assert.equal(claimed.assignment.subscriberId, "owner-a");
  const other = assignNumber("owner-a", "owner-b", "+15551212009", lines);
  assert.equal(other.ok, false);
  const taken = assignNumber("owner-a", "owner-a", "+15551212002", lines);
  assert.equal(taken.ok, false);
  if (!taken.ok) assert.match(taken.reason, /another account/);
});

test("a simulated call stays on the owner's voice memory and is not dialed", () => {
  const own = planInbound({
    kind: "voice",
    actorId: "owner-a",
    called: "+15551212001",
    body: "Remember the bicycle is named Pilot.",
    assignments: lines,
  });
  assert.equal(own.simulated, true);
  assert.equal(own.delivered, false);
  assert.equal(own.live, "off");
  assert.equal(own.status, "simulated");
  assert.equal(own.channel, "voice");
  assert.equal(own.ownerId, "owner-a");
  assert.equal(own.usage?.simulated, true);
  assert.equal(own.usage?.estimatedCostUsd, 0);

  const crossed = planInbound({
    kind: "voice",
    actorId: "owner-a",
    called: "+15551212002",
    body: "Read owner b mail.",
    assignments: lines,
  });
  assert.equal(crossed.status, "refused");
  assert.equal(crossed.ownerId, null);
  assert.equal(crossed.channel, null);
  assert.equal(crossed.usage, null);
  assert.equal(JSON.stringify(crossed).includes("owner-b"), false);
});

test("a simulated text uses the text memory and is not delivered", () => {
  const sms = planInbound({
    kind: "sms",
    actorId: "owner-b",
    called: "+15551212002",
    body: "Bring the key.",
    assignments: lines,
  });
  assert.equal(sms.channel, "text");
  assert.equal(sms.delivered, false);
  assert.match(sms.reason, /Nothing was sent/);
  assert.deepEqual(planOutbound(), {
    delivered: false,
    live: "off",
    status: "refused",
    reason: "Outbound voice and SMS are prepared and were not sent to Twilio.",
  });
});

test("call status stays distinct from a completed telephone call", () => {
  assert.equal(nextCallStatus("webhook"), "received");
  assert.equal(nextCallStatus("reject"), "refused");
  assert.equal(nextCallStatus("simulate"), "simulated");
  assert.equal(nextCallStatus("error"), "failed");
  assert.equal(nextCallStatus("finish"), "completed");
});
