import { languageByCode, sameLanguage } from "../translate/languages.ts";
import { MIN_BYTES } from "../voice/utterance.ts";

export type PhoneParty = "a" | "b";

export type PhoneUsage = {
  durationMs: number;
  sttCalls: number;
  translateCalls: number;
  ttsCalls: number;
  characters: number;
  estimatedCostUsd: null;
};

export type TurnCode =
  | "ready"
  | "consent"
  | "language"
  | "same"
  | "unsupported"
  | "overlap"
  | "silence"
  | "interrupt";

export type TurnDecision = {
  proceed: boolean;
  code: TurnCode;
  notice: string;
  from: string | null;
  to: string | null;
  text: string;
  needsStt: boolean;
  durationMs: number;
};

const MAX_DURATION_MS = 4 * 60 * 60 * 1000;

const EN = {
  consent: "This call uses AI translation. It is not recorded. Both callers must agree before any speech is processed.",
  silence: "Nothing was heard. Say that again. Nothing was invented.",
  overlap: "One person at a time. Overlapping speech was not translated.",
  interrupt: "Playback stopped. The interruption was not translated.",
  language: "Choose two different languages before the call.",
  unsupported: "That language is not supported.",
};

const ES = {
  consent: "Esta llamada usa traducción con IA. No se graba. Ambos deben aceptar antes de procesar la voz.",
  silence: "No se oyó nada. Repítelo. No se inventó nada.",
  overlap: "Una persona a la vez. El habla superpuesta no se tradujo.",
  interrupt: "Se detuvo la reproducción. La interrupción no se tradujo.",
  language: "Elige dos idiomas distintos antes de la llamada.",
  unsupported: "Ese idioma no está admitido.",
};

function spanish(code: string): boolean {
  return code === "es" || code === "es-MX";
}

function line(code: string, key: keyof typeof EN): string {
  return spanish(code) ? ES[key] : EN[key];
}

export function disclosureFor(code: string): string {
  return line(code, "consent");
}

/** Both callers hear the disclosure in a language they selected. English covers any later language. */
export function consentNotice(languageA: string, languageB: string): string {
  const first = disclosureFor(languageA);
  const second = disclosureFor(languageB);
  return first === second ? first : `${first}\n\n${second}`;
}

export function blankUsage(durationMs = 0): PhoneUsage {
  return { durationMs, sttCalls: 0, translateCalls: 0, ttsCalls: 0, characters: 0, estimatedCostUsd: null };
}

/** Ignore clocks that are missing, reversed, or longer than four hours. No price is invented. */
export function callDuration(startedAt: number | null, now: number): number {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  const delta = now - startedAt;
  if (delta < 0 || delta > MAX_DURATION_MS) return 0;
  return Math.floor(delta);
}

export function otherParty(speaker: PhoneParty): PhoneParty {
  return speaker === "a" ? "b" : "a";
}

export function beginTurn(input: {
  languageA: string;
  languageB: string;
  consentA: boolean;
  consentB: boolean;
  speaker: PhoneParty;
  text: string;
  audioBytes: number;
  overlap: boolean;
  interrupt: boolean;
  startedAt: number | null;
  now: number;
}): TurnDecision {
  const durationMs = callDuration(input.startedAt, input.now);
  const speakerLanguage = input.speaker === "a" ? input.languageA : input.languageB;
  const listener = input.speaker === "a" ? input.languageB : input.languageA;
  const base = { from: null, to: null, text: "", needsStt: false, durationMs };
  if (!languageByCode(input.languageA) || !languageByCode(input.languageB)) {
    return { proceed: false, code: "unsupported", notice: line(speakerLanguage, "unsupported"), ...base };
  }
  if (sameLanguage(input.languageA, input.languageB)) {
    return { proceed: false, code: "same", notice: line(speakerLanguage, "language"), ...base };
  }
  if (input.consentA !== true || input.consentB !== true) {
    return { proceed: false, code: "consent", notice: consentNotice(input.languageA, input.languageB), ...base };
  }
  if (input.overlap) {
    return { proceed: false, code: "overlap", notice: line(speakerLanguage, "overlap"), ...base };
  }
  if (input.interrupt) {
    return { proceed: false, code: "interrupt", notice: line(speakerLanguage, "interrupt"), ...base };
  }
  const text = input.text.trim();
  if (!text && input.audioBytes < MIN_BYTES) {
    return { proceed: false, code: "silence", notice: line(speakerLanguage, "silence"), ...base };
  }
  return {
    proceed: true,
    code: "ready",
    notice: "",
    from: input.speaker === "a" ? input.languageA : input.languageB,
    to: listener,
    text,
    needsStt: !text,
    durationMs,
  };
}

const SAY_LANGUAGE: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  "es-MX": "es-MX",
};

export function sayLanguage(code: string): string | null {
  return SAY_LANGUAGE[code] ?? null;
}

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function xmlEscape(value: string): string {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  return value.replace(/&/g, amp).replace(/</g, lt).replace(/>/g, gt).replace(/"/g, quot);
}

/**
 * A prepared prompt. It is not served on the live webhook.
 * No Record and no Dial, so this document does not ask the carrier to store audio or place a call.
 */
export function translatorTwiml(input: {
  say: string;
  sayLanguage: string;
  actionUrl?: string;
  playUrl?: string;
  gather?: boolean;
}): { xml: string | null; reason: string | null } {
  const say = input.say.trim();
  const language = sayLanguage(input.sayLanguage);
  if (!say || !language) return { xml: null, reason: "The telephone prompt is ready for English and Spanish only." };
  const action = input.gather ? httpsUrl(input.actionUrl) : null;
  if (input.gather && !action) return { xml: null, reason: "The telephone action must be https." };
  const play = input.playUrl ? httpsUrl(input.playUrl) : null;
  if (input.playUrl && !play) return { xml: null, reason: "Playback must be an https address." };
  const spoken = xmlEscape(say);
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    `<Say language="${language}">${spoken}</Say>`,
  ];
  if (play) parts.push(`<Play>${xmlEscape(play)}</Play>`);
  if (action) {
    parts.push(
      `<Gather input="speech" language="${language}" action="${xmlEscape(action)}" timeout="5" speechTimeout="1" actionOnEmptyResult="true">`,
      `<Say language="${language}">${xmlEscape(line(input.sayLanguage, "overlap"))}</Say>`,
      "</Gather>",
    );
  }
  parts.push("</Response>");
  return { xml: parts.join(""), reason: null };
}
