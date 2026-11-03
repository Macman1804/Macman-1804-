import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TELEPHONE_PLAN, entitlement } from "../billing/plans.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function sql(name: string): string {
  return readFileSync(join(root, "supabase", name), "utf8").toLowerCase();
}

test("pending migrations stay owner-scoped and do not drop data", () => {
  for (const name of ["phone-lines.sql", "phase4-awaiting-approval.sql", "billing-awaiting-approval.sql"]) {
    const text = sql(name);
    assert.equal(text.includes("enable row level security"), true, name);
    assert.equal(text.includes("disable row level security"), false, name);
    assert.equal(text.includes("drop table"), false, name);
    assert.equal(text.includes("revoke all"), true, name);
    assert.equal(text.includes("to anon"), false, name);
  }
  const billing = sql("billing-awaiting-approval.sql");
  assert.equal(billing.includes("card_number"), false);
  assert.match(billing, /billing = false/);
  const mailbox = sql("phase4-awaiting-approval.sql");
  assert.match(mailbox, /sealed_secret/);
  assert.equal(mailbox.includes("grant select, insert, update on table public.mailbox_links"), false);
});

test("the telephone plan is $20 a month and nothing is charged", () => {
  assert.equal(TELEPHONE_PLAN.priceUsd, 20);
  assert.equal(TELEPHONE_PLAN.billing, false);
  assert.equal(TELEPHONE_PLAN.cardStored, false);
  assert.equal(entitlement("desk").allowed, true);
  assert.equal(entitlement("phone").allowed, false);
  assert.equal(entitlement("outside_send").allowed, false);
});
