export const SPEECH_LEVEL = 0.02;
export const QUIET_MS = 900;
export const MIN_BYTES = 2500;

export function nextUtterance(state: {
  heard: boolean;
  quietMs: number;
  bytes: number;
  level: number;
  frameMs: number;
}): { heard: boolean; quietMs: number; action: "wait" | "send" | "discard" } {
  if (state.level >= SPEECH_LEVEL) return { heard: true, quietMs: 0, action: "wait" };
  if (!state.heard) return { heard: false, quietMs: 0, action: "wait" };
  const quietMs = state.quietMs + state.frameMs;
  if (quietMs < QUIET_MS) return { heard: true, quietMs, action: "wait" };
  if (state.bytes < MIN_BYTES) return { heard: false, quietMs: 0, action: "discard" };
  return { heard: false, quietMs: 0, action: "send" };
}
