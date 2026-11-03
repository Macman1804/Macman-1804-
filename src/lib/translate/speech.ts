import { sttCode, ttsCode } from "./languages.ts";
import { voiceId } from "../voice/voices.ts";

export type SpeechError = "unsupported" | "unavailable" | "quiet" | "failed" | "empty";

export type SpeechAudio =
  | { ok: true; audio: Uint8Array; mime: string }
  | { ok: true; url: string }
  | { ok: false; error: SpeechError; status?: number };

const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-m4a"]);

/** Playback through the same speech endpoint the desk uses. No text is stored. */
export async function synthesizeSpeech(
  input: { text: string; language: string; voice?: string },
  options: { apiKey?: string; fetchImpl?: typeof fetch },
): Promise<SpeechAudio> {
  const text = input.text.trim();
  if (!text || text.length > 1500) return { ok: false, error: "failed" };
  const language = ttsCode(input.language);
  if (!language) return { ok: false, error: "unsupported" };
  if (!options.apiKey) return { ok: false, error: "unavailable" };
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const res = await fetchImpl("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ text, voice_id: voiceId(input.voice), language }),
    });
    if (!res.ok) return { ok: false, error: "quiet", status: res.status };
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (json.url) return { ok: true, url: json.url };
      return { ok: false, error: "quiet" };
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.byteLength < 32) return { ok: false, error: "quiet" };
    return { ok: true, audio, mime: ctype.split(";")[0] || "audio/mpeg" };
  } catch {
    return { ok: false, error: "quiet" };
  }
}

/** Recognition through the same speech endpoint the desk uses. Empty audio is not a translation. */
export async function transcribeAudio(
  input: { audio: Uint8Array; mime: string; speechLanguage?: string },
  options: { apiKey?: string; fetchImpl?: typeof fetch },
): Promise<{ ok: true; text: string } | { ok: false; error: SpeechError; status?: number }> {
  const mime = (input.mime || "audio/webm").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!AUDIO_TYPES.has(mime)) return { ok: false, error: "unsupported" };
  if (!input.audio.byteLength) return { ok: false, error: "empty" };
  const speechLanguage = (input.speechLanguage ?? "").trim();
  const stt = speechLanguage ? sttCode(speechLanguage) : null;
  if (speechLanguage && speechLanguage !== "auto" && !stt) return { ok: false, error: "unsupported" };
  if (!options.apiKey) return { ok: false, error: "unavailable" };
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "webm";
    const form = new FormData();
    if (stt) form.append("language", stt);
    const bytes = Uint8Array.from(input.audio);
    form.append("file", new File([bytes], `line.${ext}`, { type: mime }));
    const res = await fetchImpl("https://api.x.ai/v1/stt", {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}` },
      signal: AbortSignal.timeout(25000),
      body: form,
    });
    if (!res.ok) return { ok: false, error: "failed", status: res.status };
    const body = (await res.json()) as { text?: string };
    const text = body.text?.trim() ?? "";
    if (!text) return { ok: false, error: "empty" };
    return { ok: true, text };
  } catch {
    return { ok: false, error: "failed" };
  }
}
