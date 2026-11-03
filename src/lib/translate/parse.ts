import { languageByCode, languageName } from "./languages.ts";

const WORDS: { code: string; weight: number; pattern: RegExp }[] = [
  { code: "en", weight: 2, pattern: /\b(hello|thanks|thank|please|where|what|when|the|is|are|was|you|good|morning|need|want|station|help|goodbye)\b/gi },
  { code: "es", weight: 2, pattern: /\b(hola|gracias|buenos|dias|días|donde|dónde|esta|está|favor|manana|mañana|quiero|necesito|adios|adiós|buenas|noches)\b/gi },
  { code: "fr", weight: 2, pattern: /\b(bonjour|merci|gare|s'il|vous|suis|avez|oui|bonjour)\b/gi },
  { code: "de", weight: 2, pattern: /\b(hallo|danke|bitte|bahnhof|guten|morgen|ich|nicht|wo)\b/gi },
  { code: "pt", weight: 2, pattern: /\b(olá|obrigado|obrigada|bom|dia|onde|estação|por|favor)\b/gi },
  { code: "it", weight: 2, pattern: /\b(ciao|grazie|buongiorno|dove|stazione|per|favore)\b/gi },
];

const MARKERS: { code: string; pattern: RegExp }[] = [
  { code: "es", pattern: /[¿¡ñ]/ },
  { code: "fr", pattern: /[çœ]/i },
  { code: "de", pattern: /[ß]/ },
  { code: "pt", pattern: /[ãõ]/i },
];

/** A language guess. Confident only when one language is clearly ahead. */
export function detectLanguage(text: string): { code: string | null; confident: boolean } {
  const sample = text.trim();
  if (sample.length < 8) return { code: null, confident: false };
  const scores = new Map<string, number>();
  for (const row of WORDS) {
    const hits = sample.match(row.pattern)?.length ?? 0;
    if (hits) scores.set(row.code, (scores.get(row.code) ?? 0) + hits * row.weight);
  }
  for (const row of MARKERS) {
    if (row.pattern.test(sample)) scores.set(row.code, (scores.get(row.code) ?? 0) + 3);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top || top[1] < 2) return { code: null, confident: false };
  const second = ranked[1]?.[1] ?? 0;
  if (top[1] - second < 2) return { code: null, confident: false };
  return { code: top[0], confident: true };
}

export function translationInstructions(sourceName: string, targetName: string): string {
  return [
    "You translate one line. You do not chat and you do not keep a memory.",
    `Translate from ${sourceName} into ${targetName}.`,
    "Preserve the speaker's meaning, tone, names, numbers, and important details.",
    "Do not add facts. Do not invent words that were not in the source.",
    "If the source is incomplete or unclear, the first line must be CONFIDENT: no and the translation may include only the words that are clear.",
    "Otherwise the first line must be CONFIDENT: yes.",
    "After that line, write only the translation. No markdown, no labels, no explanation.",
  ].join(" ");
}

export function translationUserText(
  text: string,
  earlier: readonly { original: string; translation: string }[],
): string {
  const prior = earlier
    .slice(-4)
    .map((turn) => `Original: ${turn.original.slice(0, 300)}\nTranslation: ${turn.translation.slice(0, 300)}`)
    .join("\n");
  return prior
    ? `Earlier lines from this conversation only:\n${prior}\n\nText:\n${text}`
    : `Text:\n${text}`;
}

/** Reads the required first line. A missing label is a failed translation, not a guess. */
export function parseTranslation(raw: string): { text: string; confident: boolean } | null {
  const match = raw.match(/^\s*CONFIDENT:\s*(yes|no)\s*(?:\r?\n([\s\S]*))?$/i);
  if (!match) return null;
  const text = (match[2] ?? "").trim();
  if (/^```/.test(text)) return null;
  const confident = match[1].toLowerCase() === "yes" && text.length > 0;
  return { text, confident };
}

export function sourceLabel(source: string, detected: { code: string | null; confident: boolean }): string {
  if (source !== "auto") return languageName(source);
  if (detected.confident && detected.code && languageByCode(detected.code)) return languageName(detected.code);
  return "an unknown language";
}

export type SavedTurn = {
  id: string;
  at: string;
  source: string;
  target: string;
  original: string;
  translation: string;
  uncertain: boolean;
};

export function historyStorageKey(userId: string): string | null {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return `macman.translate.${userId}`;
}

function asTurn(value: unknown): SavedTurn | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<SavedTurn>;
  if (typeof row.id !== "string" || typeof row.original !== "string" || typeof row.translation !== "string") return null;
  if (typeof row.source !== "string" || typeof row.target !== "string") return null;
  return {
    id: row.id.slice(0, 80),
    at: typeof row.at === "string" ? row.at.slice(0, 40) : "",
    source: row.source.slice(0, 12),
    target: row.target.slice(0, 12),
    original: row.original.slice(0, 500),
    translation: row.translation.slice(0, 500),
    uncertain: row.uncertain === true,
  };
}

export function readSavedTurns(raw: string | null): SavedTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(asTurn).filter((item): item is SavedTurn => Boolean(item)).slice(0, 30);
  } catch {
    return [];
  }
}

export function packSavedTurns(userId: string, turns: readonly SavedTurn[]): string | null {
  if (!historyStorageKey(userId)) return null;
  return JSON.stringify(turns.slice(-30).map((turn) => asTurn(turn)).filter(Boolean));
}
