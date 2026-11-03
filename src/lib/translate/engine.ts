import { DESK_MODEL } from "../search/live.ts";
import { languageName, sameLanguage, languageByCode } from "./languages.ts";
import { detectLanguage, parseTranslation, sourceLabel, translationInstructions, translationUserText } from "./parse.ts";

export type TranslateOutcome =
  | { ok: true; translation: string; confident: boolean; detected: string | null }
  | { ok: false; error: "unavailable" | "failed" | "empty" | "same" | "short" };

export async function requestTranslation(
  input: { source: string; target: string; text: string; earlier?: { original: string; translation: string }[] },
  options: { apiKey?: string; fetchImpl?: typeof fetch },
): Promise<TranslateOutcome> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > 2000) return { ok: false, error: "short" };
  if (!languageByCode(input.target)) return { ok: false, error: "failed" };
  if (input.source !== "auto" && !languageByCode(input.source)) return { ok: false, error: "failed" };
  if (sameLanguage(input.source, input.target)) return { ok: false, error: "same" };
  const guess = input.source === "auto" ? detectLanguage(text) : { code: input.source, confident: true };
  if (!options.apiKey) return { ok: false, error: "unavailable" };
  const earlier = (input.earlier ?? []).slice(-4).map((turn) => ({
    original: turn.original.slice(0, 300),
    translation: turn.translation.slice(0, 300),
  }));
  const body = {
    model: DESK_MODEL,
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      { role: "system", content: translationInstructions(sourceLabel(input.source, guess), languageName(input.target)) },
      { role: "user", content: translationUserText(text, earlier) },
    ],
  };
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const res = await fetchImpl("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: "failed" };
    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseTranslation(raw);
    if (!parsed) return { ok: false, error: "failed" };
    if (!parsed.text) return { ok: false, error: "empty" };
    const confident = parsed.confident && (input.source !== "auto" || guess.confident);
    return {
      ok: true,
      translation: parsed.text,
      confident,
      detected: input.source === "auto" ? (guess.confident ? guess.code : null) : input.source,
    };
  } catch {
    return { ok: false, error: "failed" };
  }
}
