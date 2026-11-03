import assert from "node:assert/strict";
import test from "node:test";
import { EMAIL_PHONE_PLAN, billingWebhook, changeSubscription, entitlement, meterUsage } from "./plans.ts";

test("the desk stays free and email plus phone do not charge anyone", () => {
  assert.equal(EMAIL_PHONE_PLAN.priceUsd, 20);
  assert.equal(EMAIL_PHONE_PLAN.currency, "USD");
  assert.equal(EMAIL_PHONE_PLAN.interval, "month");
  assert.equal(EMAIL_PHONE_PLAN.billing, false);
  assert.equal(EMAIL_PHONE_PLAN.cardStored, false);
  assert.deepEqual(EMAIL_PHONE_PLAN.covers, ["email", "phone"]);
  assert.equal(entitlement("desk").allowed, true);
  assert.equal(entitlement("mail").allowed, true);
  assert.equal(entitlement("voice").billing, false);
  assert.equal(entitlement("phone").allowed, false);
  assert.match(entitlement("phone").reason, /Email and phone/);
  assert.match(entitlement("outside_send").reason, /\$20/);
  assert.equal(entitlement("live_sms").allowed, false);
  assert.equal(entitlement("live_sms").reason.includes("$20"), false);
});

test("nobody can turn billing on, including for another account", () => {
  const own = changeSubscription({ actorId: "owner-a", ownerId: "owner-a", planId: "paid", billing: true });
  assert.equal(own.ok, false);
  assert.equal(own.billing, false);
  const other = changeSubscription({ actorId: "owner-a", ownerId: "owner-b", planId: "not_chosen", billing: false });
  assert.equal(other.ok, false);
  assert.equal(JSON.stringify(other).includes("owner-b"), false);
  const same = changeSubscription({ actorId: "owner-a", ownerId: "owner-a", planId: "not_chosen", billing: false });
  assert.match(same.reason, /Nothing was charged/);
});

test("usage metering isolates accounts and does not charge at the cap", () => {
  const under = meterUsage({ actorId: "owner-a", ownerId: "owner-a", used: 2, cap: 3 });
  assert.equal(under.ok, true);
  assert.equal(under.billing, false);
  const capped = meterUsage({ actorId: "owner-a", ownerId: "owner-a", used: 3, cap: 3 });
  assert.equal(capped.ok, false);
  assert.match(capped.reason, /Billing is not on/);
  const open = meterUsage({ actorId: "owner-a", ownerId: "owner-a", used: 100, cap: null });
  assert.equal(open.ok, true);
  const crossed = meterUsage({ actorId: "owner-a", ownerId: "owner-b", used: 0, cap: null });
  assert.equal(crossed.ok, false);
  assert.equal(JSON.stringify(crossed).includes("owner-b"), false);
});

test("a payment webhook is refused and no card is stored", () => {
  const bad = billingWebhook({
    signatureValid: false,
    actorAccount: "owner-a",
    eventAccount: "owner-a",
    type: "invoice.paid",
  });
  assert.equal(bad.accepted, false);
  assert.equal(bad.cardStored, false);
  const other = billingWebhook({
    signatureValid: true,
    actorAccount: "owner-a",
    eventAccount: "owner-b",
    type: "invoice.paid",
  });
  assert.equal(other.accepted, false);
  assert.equal(JSON.stringify(other).includes("owner-b"), false);
  const card = billingWebhook({
    signatureValid: true,
    actorAccount: "owner-a",
    eventAccount: "owner-a",
    type: "card.updated",
  });
  assert.match(card.reason, /Card details are not stored/);
  const valid = billingWebhook({
    signatureValid: true,
    actorAccount: "owner-a",
    eventAccount: "owner-a",
    type: "invoice.paid",
  });
  assert.equal(valid.accepted, false);
  assert.equal(valid.billing, false);
});
