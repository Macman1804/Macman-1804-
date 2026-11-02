import assert from "node:assert/strict";
import test from "node:test";
import { reduceCall } from "./call-machine.ts";

test("a browser call listens, thinks, speaks, then listens again", () => {
  let phase = reduceCall("idle", { type: "start" });
  phase = reduceCall(phase, { type: "heard" });
  phase = reduceCall(phase, { type: "reply" });
  phase = reduceCall(phase, { type: "spoken" });
  assert.equal(phase, "listening");
});

test("mute holds the call and end returns to idle", () => {
  const muted = reduceCall("listening", { type: "mute" });
  assert.equal(muted, "muted");
  assert.equal(reduceCall(muted, { type: "unmute" }), "listening");
  assert.equal(reduceCall(muted, { type: "end" }), "idle");
});

test("a denied microphone never opens the call", () => {
  assert.equal(reduceCall("idle", { type: "denied" }), "idle");
});
