import { createServerFn } from "@tanstack/react-start";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { admit } from "@/lib/security/pace";
import { requestTranslation } from "@/lib/translate/engine";
import { synthesizeSpeech, transcribeAudio } from "@/lib/translate/speech";

const guards = [supabaseMiddleware];
const translations = new Map<string, number[]>();
const speeches = new Map<string, number[]>();

type Scope = { supabaseUserId: string };

function allow(userId: string, bucket: Map<string, number[]>): boolean {
  const turn = admit(bucket.get(userId) ?? [], Date.now(), 20, 10 * 60 * 1000);
  bucket.set(userId, turn.next);
  return turn.ok;
}

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
    if (!audio || audio.length > 1_500_000) throw new Error("That recording is too long. Speak a shorter line.");
    return { audio, mime, speechLanguage };
  })
  .handler(async ({ context, data }) => {
    const userId = (context as unknown as Scope).supabaseUserId;
    if (!allow(userId, speeches)) return { ok: false as const, error: "pace" as const };
    const bytes = Uint8Array.from(Buffer.from(data.audio, "base64"));
    const heard = await transcribeAudio(
      { audio: bytes, mime: data.mime, speechLanguage: data.speechLanguage },
      { apiKey: process.env.XAI_API_KEY },
    );
    return heard;
  });

export const speakTranslation = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { text?: string; language?: string; voiceId?: string }) => {
    const text = (input?.text ?? "").trim();
    const language = (input?.language ?? "").trim().slice(0, 12);
    if (!text || text.length > 1500) throw new Error("Write a shorter line.");
    return { text, language, voiceId: (input?.voiceId ?? "").trim() };
  })
  .handler(async ({ context, data }) => {
    const userId = (context as unknown as Scope).supabaseUserId;
    if (!allow(userId, speeches)) return { ok: false as const, error: "pace" as const };
    const spoken = await synthesizeSpeech(
      { text: data.text, language: data.language, voice: data.voiceId },
      { apiKey: process.env.XAI_API_KEY },
    );
    if (!spoken.ok) return spoken;
    if ("url" in spoken) return { ok: true as const, url: spoken.url };
    return { ok: true as const, audio: Buffer.from(spoken.audio).toString("base64") };
  });
