export type CallPhase = "idle" | "listening" | "thinking" | "speaking" | "muted";

export type CallEvent =
  | { type: "start" }
  | { type: "denied" }
  | { type: "mute" }
  | { type: "unmute" }
  | { type: "heard" }
  | { type: "reply" }
  | { type: "spoken" }
  | { type: "end" };

export function reduceCall(phase: CallPhase, event: CallEvent): CallPhase {
  if (event.type === "end" || event.type === "denied") return "idle";
  if (event.type === "start" && phase === "idle") return "listening";
  if (event.type === "mute" && phase !== "idle") return "muted";
  if (event.type === "unmute" && phase === "muted") return "listening";
  if (event.type === "heard" && phase === "listening") return "thinking";
  if (event.type === "reply" && phase === "thinking") return "speaking";
  if (event.type === "spoken" && phase === "speaking") return "listening";
  return phase;
}
