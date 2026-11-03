import assert from "node:assert/strict";
import test from "node:test";
import { openSecret, sealSecret } from "./seal.server.ts";

test("a mailbox token is sealed and is not stored in the clear", () => {
  const token = "ya29.mailbox-token-sample";
  const sealed = sealSecret(token, "test-mailbox-key");
  assert.equal(sealed.includes(token), false);
  assert.equal(openSecret(sealed, "test-mailbox-key"), token);
  assert.throws(() => openSecret(sealed, "other-key"));
});
