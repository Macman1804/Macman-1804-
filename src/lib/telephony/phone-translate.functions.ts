import { createServerFn } from "@tanstack/react-start";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { admit } from "@/lib/security/pace";
import { runPhoneTurn } from "@/lib/telephony/phone-translate-run";

const guards = [supabaseMiddleware];
const turns = new Map<string, number[]>();

type Scope = { supabaseUserId: string };

export const practicePhoneTranslation = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: {
    simulated?: boolean;
    languageA?: string;
    languageB?: string;
    consentA?: boolean;
    consentB?: boolean;
    speaker?: string;
    text?: string;
    audio?: string;
    mime?: string;
    overlap?: boolean;
    interrupt?: boolean;
    startedAt?: number;
  }) => {
    if (input?.simulated !== true) throw new Error("Only a simulated call can be practiced.");
    let speaker: "a" | "b";
    if (input.speaker === "b") speaker = "b";
    else if (input.speaker === "a") speaker = "a";
    else throw new Error("Unknown line.");
    const text = (input.text ?? "").trim();
    if (text.length > 2000) throw new Error("Write a shorter line.");
    const audio = (input.audio ?? "").trim();
    if (audio.length > 1_500_000) throw new Error("That recording is too long. Speak a shorter line.");
    const startedAt = Number(input.startedAt);
    return {
      simulated: true as const,
      languageA: (input.languageA ?? "").trim().slice(0, 12),
      languageB: (input.languageB ?? "").trim().slice(0, 12),
      consentA: input.consentA === true,
      consentB: input.consentB === true,
      speaker,
      text,
      audio,
      mime: (input.mime ?? "audio/webm").split(";")[0]?.trim().toLowerCase() || "audio/webm",
      overlap: input.overlap === true,
      interrupt: input.interrupt === true,
      startedAt: Number.isFinite(startedAt) ? startedAt : null,
    };
  })
  .handler(async ({ context, data }) => {
    const userId = (context as unknown as Scope).supabaseUserId;
    const pace = admit(turns.get(userId) ?? [], Date.now(), 20, 10 * 60 * 1000);
    turns.set(userId, pace.next);
    if (!pace.ok) {
      return {
        ok: false as const,
        live: "off" as const,
        dialed: false as const,
        stored: false as const,
        code: "pace" as const,
        notice: "Wait a moment before the next line.",
        translation: null,
        audio: null,
        mime: null,
        nextSpeaker: data.speaker,
        usage: { durationMs: 0, sttCalls: 0, translateCalls: 0, ttsCalls: 0, characters: 0, estimatedCostUsd: null },
      };
    }
    const audio = data.audio ? Uint8Array.from(Buffer.from(data.audio, "base64")) : undefined;
    const result = await runPhoneTurn(
      {
        languageA: data.languageA,
        languageB: data.languageB,
        consentA: data.consentA,
        consentB: data.consentB,
        speaker: data.speaker,
        text: data.text,
        audio,
        mime: data.mime,
        overlap: data.overlap,
        interrupt: data.interrupt,
        startedAt: data.startedAt,
      },
      { apiKey: process.env.XAI_API_KEY },
    );
    return {
      ok: result.ok,
      live: result.live,
      dialed: result.dialed,
      stored: result.stored,
      code: result.code,
      notice: result.notice,
      translation: result.translation,
      audio: result.audio ? Buffer.from(result.audio).toString("base64") : result.audioUrl,
      mime: result.mime,
      nextSpeaker: result.nextSpeaker,
      usage: result.usage,
    };
  });
