import { requestTranslation } from "../translate/engine.ts";
import { synthesizeSpeech, transcribeAudio } from "../translate/speech.ts";
import { beginTurn, blankUsage, otherParty, type PhoneParty, type PhoneUsage } from "./phone-translate.ts";

export type PhoneTurnResult = {
  ok: boolean;
  live: "off";
  dialed: false;
  stored: false;
  recording: null;
  transcript: null;
  code: string;
  notice: string;
  translation: string | null;
  confident: boolean | null;
  audio: Uint8Array | null;
  audioUrl: string | null;
  mime: string | null;
  nextSpeaker: PhoneParty;
  usage: PhoneUsage;
};

function closed(input: {
  code: string;
  notice: string;
  speaker: PhoneParty;
  durationMs: number;
  translation?: string | null;
  confident?: boolean | null;
  audio?: Uint8Array | null;
  audioUrl?: string | null;
  mime?: string | null;
  nextSpeaker?: PhoneParty;
  sttCalls?: number;
  translateCalls?: number;
  ttsCalls?: number;
  characters?: number;
  ok?: boolean;
}): PhoneTurnResult {
  return {
    ok: input.ok === true,
    live: "off",
    dialed: false,
    stored: false,
    recording: null,
    transcript: null,
    code: input.code,
    notice: input.notice,
    translation: input.translation ?? null,
    confident: input.confident ?? null,
    audio: input.audio ?? null,
    audioUrl: input.audioUrl ?? null,
    mime: input.mime ?? null,
    nextSpeaker: input.nextSpeaker ?? input.speaker,
    usage: {
      ...blankUsage(input.durationMs),
      sttCalls: input.sttCalls ?? 0,
      translateCalls: input.translateCalls ?? 0,
      ttsCalls: input.ttsCalls ?? 0,
      characters: input.characters ?? 0,
    },
  };
}

function failureNotice(listener: string, kind: "failed" | "unavailable" | "quiet" | "silence"): string {
  const es = listener === "es" || listener === "es-MX";
  if (kind === "silence") return es ? "No se oyó nada. Repítelo. No se inventó nada." : "Nothing was heard. Say that again. Nothing was invented.";
  if (kind === "unavailable") {
    return es ? "La traducción no está disponible ahora. La llamada no cambió." : "Translation is not available right now. The call was not changed.";
  }
  if (kind === "quiet") {
    return es ? "La traducción está lista para leer. La voz no se pudo reproducir." : "The translation is ready to read. Spoken playback failed.";
  }
  return es ? "Esa línea no se pudo traducir. Repítela." : "That line could not be translated. Say it again.";
}

/** One simulated turn. The current translation can be spoken. It is not stored. */
export async function runPhoneTurn(
  input: {
    languageA: string;
    languageB: string;
    consentA: boolean;
    consentB: boolean;
    speaker: PhoneParty;
    text?: string;
    audio?: Uint8Array;
    mime?: string;
    overlap?: boolean;
    interrupt?: boolean;
    startedAt?: number | null;
    now?: number;
  },
  options: { apiKey?: string; fetchImpl?: typeof fetch },
): Promise<PhoneTurnResult> {
  const now = input.now ?? Date.now();
  const decision = beginTurn({
    languageA: input.languageA,
    languageB: input.languageB,
    consentA: input.consentA,
    consentB: input.consentB,
    speaker: input.speaker,
    text: input.text ?? "",
    audioBytes: input.audio?.byteLength ?? 0,
    overlap: input.overlap === true,
    interrupt: input.interrupt === true,
    startedAt: input.startedAt ?? null,
    now,
  });
  if (!decision.proceed || !decision.from || !decision.to) {
    return closed({ code: decision.code, notice: decision.notice, speaker: input.speaker, durationMs: decision.durationMs });
  }
  let text = decision.text;
  let sttCalls = 0;
  if (decision.needsStt) {
    sttCalls = 1;
    const heard = await transcribeAudio(
      { audio: input.audio ?? new Uint8Array(), mime: input.mime ?? "audio/webm", speechLanguage: decision.from },
      options,
    );
    if (!heard.ok) {
      const code = heard.error === "unavailable" ? "unavailable" : heard.error === "empty" ? "silence" : "failed";
      return closed({
        code,
        notice: failureNotice(decision.from, code === "unavailable" ? "unavailable" : code === "silence" ? "silence" : "failed"),
        speaker: input.speaker,
        durationMs: decision.durationMs,
        sttCalls,
      });
    }
    if (!heard.text.trim()) {
      return closed({
        code: "silence",
        notice: failureNotice(decision.from, "silence"),
        speaker: input.speaker,
        durationMs: decision.durationMs,
        sttCalls,
      });
    }
    text = heard.text.trim();
  }
  const translated = await requestTranslation({ source: decision.from, target: decision.to, text }, options);
  if (!translated.ok) {
    const code = translated.error === "unavailable" ? "unavailable" : translated.error === "empty" ? "silence" : "failed";
    return closed({
      code,
      notice: failureNotice(decision.from, code === "unavailable" ? "unavailable" : code === "silence" ? "silence" : "failed"),
      speaker: input.speaker,
      durationMs: decision.durationMs,
      sttCalls,
      translateCalls: 1,
    });
  }
  const spoken = await synthesizeSpeech({ text: translated.translation, language: decision.to }, options);
  const audio = spoken.ok && "audio" in spoken ? spoken.audio : null;
  const audioUrl = spoken.ok && "url" in spoken ? spoken.url : null;
  const mime = spoken.ok && "audio" in spoken ? spoken.mime : null;
  const played = Boolean(audio || audioUrl);
  return closed({
    ok: true,
    code: played ? "ready" : "quiet",
    notice: played ? "" : failureNotice(decision.from, "quiet"),
    speaker: input.speaker,
    nextSpeaker: otherParty(input.speaker),
    durationMs: decision.durationMs,
    translation: translated.translation,
    confident: translated.confident,
    audio,
    audioUrl,
    mime,
    sttCalls,
    translateCalls: 1,
    ttsCalls: 1,
    characters: translated.translation.length,
  });
}
