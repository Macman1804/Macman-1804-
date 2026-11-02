import assert from "node:assert/strict";
import test from "node:test";
import { nextUtterance } from "./utterance.ts";

test("speech keeps the recording open until a quiet pause", () => {
  const speaking = nextUtterance({ heard: false, quietMs: 0, bytes: 0, level: 0.1, frameMs: 100 });
  assert.equal(speaking.action, "wait");
  assert.equal(speaking.heard, true);
  const quiet = nextUtterance({ heard: true, quietMs: 700, bytes: 4000, level: 0.01, frameMs: 100 });
  assert.equal(quiet.action, "wait");
  const ready = nextUtterance({ heard: true, quietMs: 900, bytes: 4000, level: 0.01, frameMs: 100 });
  assert.equal(ready.action, "send");
});

test("a quiet blip is discarded instead of transcribed", () => {
  const blip = nextUtterance({ heard: true, quietMs: 900, bytes: 100, level: 0, frameMs: 100 });
  assert.equal(blip.action, "discard");
});
