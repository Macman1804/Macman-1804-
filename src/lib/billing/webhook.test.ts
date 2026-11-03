import assert from "node:assert/strict";
import test from "node:test";
import { handlePaymentWebhook, paymentSignature } from "./webhook.server.ts";

test("a signed payment event is still refused and the card number is not echoed", async () => {
  const saved = process.env.BILLING_WEBHOOK_SECRET;
  const secret = "test-billing-secret";
  process.env.BILLING_WEBHOOK_SECRET = secret;
  try {
    const card = "4242424242424242";
    const body = JSON.stringify({ account: "owner-a", type: "invoice.paid", card });
    const response = await handlePaymentWebhook(
      new Request("https://example.com/api/billing/webhook", {
        method: "POST",
        headers: { "x-macman-signature": paymentSignature(body, secret) },
        body,
      }),
    );
    const text = await response.text();
    assert.equal(response.status, 403);
    assert.equal(text.includes(card), false);
    assert.match(text, /Card details are not stored/);
    const unsigned = await handlePaymentWebhook(
      new Request("https://example.com/api/billing/webhook", { method: "POST", body: "{}" }),
    );
    assert.equal(unsigned.status, 403);
  } finally {
    if (saved === undefined) delete process.env.BILLING_WEBHOOK_SECRET;
    else process.env.BILLING_WEBHOOK_SECRET = saved;
  }
});
