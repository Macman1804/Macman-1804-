export type TranslateCode = (typeof TRANSLATE_LANGUAGES)[number]["code"];

/** Languages both speech recognition and speech playback document. English and Spanish stay first. */
export const TRANSLATE_LANGUAGES = [
  { code: "en", name: "English", stt: "en", tts: "en" },
  { code: "es", name: "Español", stt: "es", tts: "es-ES" },
  { code: "es-MX", name: "Español (México)", stt: "es", tts: "es-MX" },
  { code: "fr", name: "Français", stt: "fr", tts: "fr" },
  { code: "de", name: "Deutsch", stt: "de", tts: "de" },
  { code: "it", name: "Italiano", stt: "it", tts: "it" },
  { code: "pt", name: "Português", stt: "pt", tts: "pt-BR" },
  { code: "pt-PT", name: "Português (Portugal)", stt: "pt", tts: "pt-PT" },
  { code: "zh", name: "中文", stt: "zh", tts: "zh" },
  { code: "ja", name: "日本語", stt: "ja", tts: "ja" },
  { code: "ko", name: "한국어", stt: "ko", tts: "ko" },
  { code: "ru", name: "Русский", stt: "ru", tts: "ru" },
  { code: "ar", name: "العربية", stt: "ar", tts: "ar-EG" },
  { code: "hi", name: "हिन्दी", stt: "hi", tts: "hi" },
  { code: "id", name: "Bahasa Indonesia", stt: "id", tts: "id" },
  { code: "tr", name: "Türkçe", stt: "tr", tts: "tr" },
  { code: "vi", name: "Tiếng Việt", stt: "vi", tts: "vi" },
] as const;

export const CORE_LANGUAGES = TRANSLATE_LANGUAGES.filter((item) => item.code === "en" || item.code === "es");

const BY_CODE = new Map(TRANSLATE_LANGUAGES.map((item) => [item.code, item]));

export function languageByCode(code: string) {
  return BY_CODE.get(code as TranslateCode) ?? null;
}

export function languageName(code: string): string {
  return languageByCode(code)?.name ?? code;
}

/** Speech recognition code. Null means omit the field so the provider may detect speech. */
export function sttCode(code: string): string | null {
  if (code === "auto") return null;
  return languageByCode(code)?.stt ?? null;
}

/** Playback code. Null means this choice cannot be spoken. */
export function ttsCode(code: string): string | null {
  return languageByCode(code)?.tts ?? null;
}

export function sameLanguage(source: string, target: string): boolean {
  return source !== "auto" && source === target;
}

export function swapLanguages(source: string, target: string): { source: string; target: string } {
  if (source === "auto") {
    return { source: target, target: target === "en" ? "es" : "en" };
  }
  return { source: target, target: source };
}
