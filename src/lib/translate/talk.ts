export type Speaker = "text" | "a" | "b";

/** One person at a time. Person A is followed by Person B, then Person A again. */
export function directionFor(
  speaker: Speaker,
  personA: string,
  personB: string,
  source: string,
  target: string,
): { from: string; to: string; next: "a" | "b" | null } {
  if (speaker === "b") return { from: personB, to: personA, next: "a" };
  if (speaker === "a") return { from: personA, to: personB, next: "b" };
  return { from: source, to: target, next: null };
}

/** A second microphone cannot open while the first person is still talking. */
export function micBlocked(recording: Speaker | null, speaker: Speaker): boolean {
  return recording !== null && recording !== speaker;
}

export function canSaveTranslation(consent: boolean, count: number): boolean {
  return consent === true && count > 0;
}
