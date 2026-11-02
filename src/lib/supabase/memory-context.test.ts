import assert from "node:assert/strict";
import test from "node:test";
import { pickRelevant } from "./memory-context.ts";

test("relevant lines are chosen by shared words, in their original order", () => {
  const lines = [
    { channel: "mail", role: "person", body: "The bicycle is named Pilot." },
    { channel: "text", role: "person", body: "Buy milk tomorrow." },
    { channel: "desk", role: "macman", body: "Noted." },
  ];
  const picked = pickRelevant(lines, "What is the bicycle name?", 2);
  assert.deepEqual(picked.map((line) => line.body), ["The bicycle is named Pilot."]);
});

test("a question with no shared words falls back to the latest lines", () => {
  const lines = [
    { channel: "desk", role: "person", body: "Alpha note." },
    { channel: "desk", role: "person", body: "Beta note." },
    { channel: "desk", role: "person", body: "Gamma note." },
  ];
  const picked = pickRelevant(lines, "Hello", 2);
  assert.deepEqual(picked.map((line) => line.body), ["Beta note.", "Gamma note."]);
});
