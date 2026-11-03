import assert from "node:assert/strict";
import test from "node:test";
import { appChannel, DB_CHANNEL, packBody, replySubject, unpackBody } from "./channels.ts";

test("mail subject is packed and unpacked without changing other channels", () => {
  const packed = packBody("mail", "See you then.", "Tuesday");
  assert.equal(packed, "Subject: Tuesday\nSee you then.");
  assert.deepEqual(unpackBody("mail", packed), { subject: "Tuesday", body: "See you then." });
  assert.deepEqual(unpackBody("desk", "Hello"), { subject: null, body: "Hello" });
});

test("a mail reply keeps the subject and does not repeat Re", () => {
  assert.equal(replySubject("Tuesday"), "Re: Tuesday");
  assert.equal(replySubject("Re: Tuesday"), "Re: Tuesday");
  assert.equal(replySubject(null), "Re: Letter");
});

test("every desk line can be spoken", () => {
  assert.equal(appChannel("web"), "desk");
  assert.equal(appChannel("voice"), "voice");
  assert.equal(appChannel("email"), "mail");
  assert.equal(appChannel("sms"), "text");
  assert.equal(appChannel("phone"), null);
});

test("desk channels map onto the existing Supabase channel values", () => {
  assert.deepEqual(DB_CHANNEL, {
    desk: "web",
    voice: "voice",
    mail: "email",
    text: "sms",
  });
});

