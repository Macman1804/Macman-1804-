import { createServerFn } from "@tanstack/react-start";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { admit } from "@/lib/security/pace";
import { requestTranslation } from "@/lib/translate/engine";
import { sttCode, ttsCode } from "@/lib/translate/languages";
import { voiceId } from "@/lib/voice/voices";

const guards = [supabaseMiddleware];
const translations = new Map<string, number[]>();
const speeches = new Map<string, number[]>();

type Scope = { supabaseUserId: string };

function allow(userId: string, bucket: Map<string, number[]>): boolean {
  const turn = admit(bucket.get(userId) ?? [], Date.now(), 20, 10 * 60 * 1000);
  bucket.set(userId, turn.next);
  return turn.ok;
}

const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-m4a"]);

export const translateLine = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { source?: string; target?: string; text?: string; earlier?: { original?: string; translation?: string }[] }) => {
    const source = (input?.source ?? "").trim().slice(0, 12);
    const target = (input?.target ?? "").trim().slice(0, 12);
    const text = (input?.text ?? "").trim();
    if (!text || text.length > 2000) throw new Error("Write a shorter line.");
    const earlier = (Array.isArray(input?.earlier) ? input.earlier : []).slice(-4).map((turn) => ({
      original: (turn?.original ?? "").trim().slice(0, 300),
      translation: (turn?.translation ?? "").trim().slice(0, 300),
    }));
    return { source, target, text, earlier };
  })
  .handler(async ({ context, data }) => {
    const userId = (context as unknown as Scope).supabaseUserId;
    if (!allow(userId, translations)) return { ok: false as const, error: "pace" as const };
    return requestTranslation(
      { source: data.source, target: data.target, text: data.text, earlier: data.earlier },
      { apiKey: process.env.XAI_API_KEY },
    );
  });

export const transcribeTranslation = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { audio?: string; mime?: string; speechLanguage?: string }) => {
    const audio = input?.audio?.trim() ?? "";
    const mime = (input?.mime ?? "audio/webm").split(";")[0]?.trim().toLowerCase() ?? "";
    const speechLanguage = (input?.speechLanguage ?? "").trim().slice(0, 12);
    if (!AUDIO_TYPES.has(mime)) throw new Error("That recording format is not supported.");
    if (!audio || audio.length > 1_500_000) throw new Error("That recording is too long. Speak a shorter line.");
    return { audio, mime, speechLanguage };
  })
  .handler(async ({ context, data }) => {
    const userId = (context as unknown as Scope).supabaseUserId;
    if (!allow(userId, speeches)) return { ok: false as const, error: "pace" as const };
    const stt = data.speechLanguage ? sttCode(data.speechLanguage) : null;
    if (data.speechLanguage && data.speechLanguage !== "auto" && !stt) return { ok: false as const, error: "unsupported" as const };
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "unavailable" as const };
    try {
      const bytes = Buffer.from(data.audio, "base64");
      const ext = data.mime.includes("mp4") || data.mime.includes("m4a") ? "m4a" : data.mime.includes("ogg") ? "ogg" : data.mime.includes("wav") ? "wav" : "webm";
      const form = new FormData();
      if (stt) form.append("language", stt);
      form.append("file", new File([bytes], `line.${ext}`, { type: data.mime }));
      const res = await fetch("https://api.x.ai/v1/stt", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(25000),
        body: form,
      });
      if (!res.ok) return { ok: false as const, error: "failed" as const };
      const body = (await res.json()) as { text?: string };
      const text = body.text?.trim() ?? "";
      if (!text) return { ok: false as const, error: "empty" as const };
      return { ok: true as const, text };
    } catch {
      return { ok: false as const, error: "failed" as const };
    }
  });

export const speakTranslation = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { text?: string; language?: string; voiceId?: string }) => {
    const text = (input?.text ?? "").trim();
    const language = (input?.language ?? "").trim().slice(0, 12);
    if (!text || text.length > 1500) throw new Error("Write a shorter line.");
    return { text, language, voiceId: voiceId(input?.voiceId) };
  })
  .handler(async ({ context, data }) => {
    const userId = (context as unknown as Scope).supabaseUserId;
    if (!allow(userId, speeches)) return { ok: false as const, error: "pace" as const };
    const language = ttsCode(data.language);
    if (!language) return { ok: false as const, error: "unsupported" as const };
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "unavailable" as const };
    try {
      const res = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ text: data.text, voice_id: data.voiceId, language }),
      });
      if (!res.ok) return { ok: false as const, error: "quiet" as const };
      const ctype = res.headers.get("content-type") ?? "";
      if (ctype.includes("application/json")) {
        const json = (await res.json()) as { url?: string };
        if (json.url) return { ok: true as const, url: json.url };
        return { ok: false as const, error: "quiet" as const };
      }
      const audio = Buffer.from(await res.arrayBuffer()).toString("base64");
      return { ok: true as const, audio };
    } catch {
      return { ok: false as const, error: "quiet" as const };
    }
  });
