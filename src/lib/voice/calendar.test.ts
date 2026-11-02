import assert from "node:assert/strict";
import test from "node:test";
import { calendarReply } from "./calendar.ts";

test("a date question is answered from the clock, not from memory", () => {
  const reply = calendarReply(
    "Hey, what's today's date?",
    new Date("2026-11-02T21:54:00Z"),
    "America/New_York",
  );
  assert.equal(reply, "Today is Monday, November 2, 2026.");
});

test("other questions are left for the desk", () => {
  assert.equal(calendarReply("What is the bicycle's name?", new Date(), "America/New_York"), null);
});
