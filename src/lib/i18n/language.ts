export type Lang = "en" | "es";

export const LANG_KEY = "macman.lang";

export function parseLang(value: unknown): Lang {
  return value === "es" ? "es" : "en";
}

export function localeOf(lang: Lang): "en-US" | "es-ES" {
  return lang === "es" ? "es-ES" : "en-US";
}

export function readStoredLang(): Lang {
  if (typeof localStorage === "undefined") return "en";
  try {
    return parseLang(localStorage.getItem(LANG_KEY));
  } catch {
    return "en";
  }
}

export function writeStoredLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* a private browser can refuse storage; the choice still applies this visit */
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}
