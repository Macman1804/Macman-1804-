import assert from "node:assert/strict";
import test from "node:test";
import { admit, auditRecord } from "./pace.ts";

test("the pace limit refuses the next line inside the window", () => {
  let stamps: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const turn = admit(stamps, 1_000 + i, 3, 10_000);
    assert.equal(turn.ok, true);
    stamps = turn.next;
  }
  const blocked = admit(stamps, 1_010, 3, 10_000);
  assert.equal(blocked.ok, false);
  const later = admit(blocked.next, 12_000, 3, 10_000);
  assert.equal(later.ok, true);
});

test("an audit note drops anything that looks like a secret", () => {
  const clean = auditRecord({ actorId: "owner-a", action: "mail.draft", outcome: "allowed" });
  assert.equal(clean.outcome, "allowed");
  const secret = auditRecord({
    actorId: "owner-a",
    action: "mail.link",
    outcome: "allowed",
    detail: "bearer token ya29",
  });
  assert.equal(secret.outcome, "refused");
  assert.equal(secret.detail.includes("ya29"), false);
});
