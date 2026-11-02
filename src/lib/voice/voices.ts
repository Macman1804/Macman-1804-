export const VOICES = [
  { id: "eve", label: "Eve", tone: "Energetic" },
  { id: "ara", label: "Ara", tone: "Warm" },
  { id: "rex", label: "Rex", tone: "Clear" },
  { id: "sal", label: "Sal", tone: "Smooth" },
  { id: "leo", label: "Leo", tone: "Steady" },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export function voiceId(value: string | null | undefined): VoiceId {
  const id = (value ?? "").trim().toLowerCase();
  return VOICES.some((voice) => voice.id === id) ? (id as VoiceId) : "eve";
}
