import assert from "node:assert/strict";
import test from "node:test";
import { DB_CHANNEL, packBody, unpackBody } from "./channels.ts";

test("mail subject is packed and unpacked without changing other channels", () => {
  const packed = packBody("mail", "See you then.", "Tuesday");
  assert.equal(packed, "Subject: Tuesday\nSee you then.");
  assert.deepEqual(unpackBody("mail", packed), { subject: "Tuesday", body: "See you then." });
  assert.deepEqual(unpackBody("desk", "Hello"), { subject: null, body: "Hello" });
});

test("desk channels map onto the existing Supabase channel values", () => {
  assert.deepEqual(DB_CHANNEL, {
    desk: "web",
    voice: "voice",
    mail: "email",
    text: "sms",
  });
});
