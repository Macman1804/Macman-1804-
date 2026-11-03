/** Desk answers stay on this model. Live lookup uses the search model. */
export const DESK_MODEL = "grok-4.5";
export const SEARCH_MODEL = "grok-4.7";

export const UNVERIFIED = "I could not verify current information for that.";
export const SEARCH_LIMIT = "The search limit for this account was reached. Current information was not checked.";

const DATE_ONLY =
  /\b(today'?s date|what(?:'s| is) the date|what day is it|what(?:'s| is) today)\b/i;

const LIVE =
  /\b(news|headline|breaking|stock|stocks|share price|nasdaq|dow\b|s&p|market|weather|forecast|temperature|score|scores|standings|who won|price of|how much is|how much does|law|statute|regulation|bill|election|earthquake|hurricane|right now|this week|yesterday|latest|current)\b/i;

/** True only when the question asks for the outside world, not a private desk fact. */
export function needsLiveLookup(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  if (DATE_ONLY.test(text) && !/\b(weather|forecast|news|score|stock|price)\b/i.test(text)) return false;
  return LIVE.test(text);
}

/** The search provider receives this string only. Mail, phone numbers, and memories stay out. */
export function searchQuery(body: string): string {
  return body
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\+\d{8,15}/g, "")
    .replace(/\b\d{3}[-.\s]?\d{2,3}[-.\s]?\d{4}\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export type LiveSource = { url: string };

function httpsOnly(values: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const url = value.trim().replace(/[),.\]]+$/, "");
    if (!url.startsWith("https://") || seen.has(url)) continue;
    seen.add(url);
    kept.push(url);
    if (kept.length === 5) break;
  }
  return kept;
}

/** Drops any link the provider did not return. Adds no date that was not supplied. */
export function verifiedReply(
  text: string,
  citations: readonly string[],
): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  const sources = httpsOnly([...citations]);
  const prose = text.trim();
  if (!prose || sources.length === 0) return { ok: false };
  const allowed = new Set(sources);
  const clean = prose
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_all, label: string, url: string) =>
      allowed.has(url) ? label : "",
    )
    .replace(/https?:\/\/\S+/g, (url) => (allowed.has(url.replace(/[),.\]]+$/, "")) ? url : ""))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return { ok: false };
  return {
    ok: true,
    sources: sources.map((url) => ({ url })),
    body: `${clean}\n\nSources\n${sources.join("\n")}`,
  };
}

export function spokenText(body: string): string {
  return body.split(/\n\nSources\n/)[0]?.trim() ?? "";
}

type OutputText = { type?: string; text?: string; annotations?: { url?: string }[] };
type OutputItem = { type?: string; content?: OutputText[] };

/** Reads only URLs the provider listed. A missing citation is a failed lookup. */
export function parseSearchPayload(payload: unknown): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  if (!payload || typeof payload !== "object") return { ok: false };
  const record = payload as { output?: OutputItem[]; citations?: unknown };
  const citations = Array.isArray(record.citations) ? record.citations.filter((item) => typeof item === "string") : [];
  const texts: string[] = [];
  const annotated: string[] = [];
  for (const item of record.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) texts.push(part.text);
      for (const note of part.annotations ?? []) {
        if (note.url) annotated.push(note.url);
      }
    }
  }
  return verifiedReply(texts.join("\n"), [...citations, ...annotated]);
}
