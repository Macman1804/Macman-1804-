/** Desk answers stay on this model. Live lookup uses the search model. */
export const DESK_MODEL = "grok-4.5";
export const SEARCH_MODEL = "grok-4.7";

export const UNVERIFIED = "I could not verify current information for that.";
export const SEARCH_LIMIT = "The search limit for this account was reached. Current information was not checked.";

const DATE_ONLY =
  /\b(today'?s date|what(?:'s| is) the date|what day is it|what(?:'s| is) today)\b/i;

const LIVE =
  /\b(news|headline|breaking|stock|stocks|share price|nasdaq|dow\b|s&p|market|bitcoin|btc|crypto|weather|forecast|temperature|score|scores|standings|who won|price of|how much is|how much does|law|statute|regulation|bill|election|earthquake|hurricane|right now|this week|yesterday|latest|current)\b/i;

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

const AUTHORITY = [
  "finance.yahoo.com",
  "coingecko.com",
  "coinbase.com",
  "coinmarketcap.com",
  "reuters.com",
  "cmegroup.com",
  "nasdaq.com",
  "nyse.com",
  "sec.gov",
  "federalreserve.gov",
  "bloomberg.com",
  "wsj.com",
  "marketwatch.com",
];

function canonical(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ref") parsed.searchParams.delete(key);
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function authorityRank(url: string): number {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const index = AUTHORITY.findIndex((item) => host === item || host.endsWith(`.${item}`));
    return index === -1 ? AUTHORITY.length : index;
  } catch {
    return AUTHORITY.length + 1;
  }
}

function httpsOnly(values: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const url = canonical(value.trim().replace(/[),.\]]+$/, ""));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    kept.push(url);
  }
  kept.sort((left, right) => authorityRank(left) - authorityRank(right));
  return kept.slice(0, 5);
}

function stripLinks(prose: string, allowed: ReadonlySet<string>): string {
  return prose
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_all, label: string, url: string) =>
      allowed.has(canonical(url) ?? "") ? label : "",
    )
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drops any link the provider did not return. Each URL is listed once, not inside the sentence. */
export function verifiedReply(
  text: string,
  citations: readonly string[],
): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  const sources = httpsOnly([...citations]);
  const prose = text.trim();
  if (!prose || sources.length === 0) return { ok: false };
  const clean = stripLinks(prose, new Set(sources));
  if (!clean) return { ok: false };
  return {
    ok: true,
    sources: sources.map((url) => ({ url })),
    body: `${clean}\n\nSources\n${sources.join("\n")}`,
  };
}

const PRICE = /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\s?\d+(?:\.\d+)?/g;
const CLOCK = /\b\d{1,2}:\d{2}(?:\s?[ap]\.?m\.?)?\b/gi;
const DAY =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi;

function pageHas(pages: string, token: string): boolean {
  const compact = pages.toLowerCase().replace(/,/g, "").replace(/\s+/g, "");
  const forms = token
    .toLowerCase()
    .replace(/[$,]/g, "")
    .replace(/\s+/g, "")
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
  return forms.length > 0 && compact.includes(forms);
}

function dropUnsupported(prose: string, pages: string): { text: string; droppedPrice: boolean; droppedTime: boolean } {
  let droppedPrice = false;
  let droppedTime = false;
  const next = prose
    .replace(PRICE, (token) => {
      if (pageHas(pages, token)) return token;
      droppedPrice = true;
      return "";
    })
    .replace(CLOCK, (token) => {
      if (pageHas(pages, token)) return token;
      droppedTime = true;
      return "";
    })
    .replace(DAY, (token) => {
      if (pageHas(pages, token)) return token;
      droppedTime = true;
      return "";
    })
    .replace(/\bat\s*\./gi, ".")
    .replace(/\s+See\s*$/i, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
  return { text: next, droppedPrice, droppedTime };
}

function quoteNotes(pages: string): string {
  const found = new Set<string>();
  for (const match of pages.matchAll(
    /\b(Eastern Time|Pacific Time|Central Time|Mountain Time|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|GMT)\b/g,
  )) {
    found.add(match[1] ?? "");
  }
  const zone =
    found.size === 1
      ? `The source states the time zone as ${[...found][0]}.`
      : found.size > 1
        ? "The sources name more than one time zone."
        : "The source did not state a time zone.";
  const lower = pages.toLowerCase();
  const delayed = /delayed|15-minute|15 minute|not real-time|not realtime/.test(lower);
  const live = /real-time|realtime|live price|live quote/.test(lower);
  const pace = delayed
    ? "The source calls this quote delayed."
    : live
      ? "The source calls this quote live."
      : "The source did not say whether this quote is live or delayed.";
  return `${zone}\n${pace}`;
}

export function isMarketQuote(text: string): boolean {
  return /\b(bitcoin|btc|ethereum|crypto|stock|nasdaq|share|market|price)\b|\$\s?\d/i.test(text);
}

/** Keeps a price or a time only when that exact figure is on a retrieved page. */
export function checkAgainstSources(
  body: string,
  pages: readonly string[],
): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  const [prose, listed = ""] = body.split("\n\nSources\n");
  const sources = httpsOnly(listed.split("\n"));
  if (!prose?.trim() || sources.length === 0) return { ok: false };
  const pageText = pages.join("\n");
  const market = isMarketQuote(prose);
  if (!pageText.trim()) {
    if (!market) return { ok: true, sources: sources.map((url) => ({ url })), body: `${prose.trim()}\n\nSources\n${sources.join("\n")}` };
    const stripped = dropUnsupported(prose, "");
    return {
      ok: true,
      sources: sources.map((url) => ({ url })),
      body: `${stripped.text}\n\nThe source page could not be read, so the price and time were left out.\n\nSources\n${sources.join("\n")}`.replace(/\n{3,}/g, "\n\n"),
    };
  }
  const checked = dropUnsupported(prose, pageText);
  const notes: string[] = [];
  if (checked.droppedPrice) notes.push("A quoted price was not on the source page, so it was left out.");
  if (checked.droppedTime) notes.push("A quoted time was not on the source page, so it was left out.");
  if (market) notes.push(quoteNotes(pageText));
  const text = [checked.text, ...notes].filter(Boolean).join("\n");
  if (!text.trim()) return { ok: false };
  return {
    ok: true,
    sources: sources.map((url) => ({ url })),
    body: `${text.trim()}\n\nSources\n${sources.join("\n")}`,
  };
}

export function spokenText(body: string): string {
  return (body.split(/\n\nSources\n/)[0] ?? "").replace(/https?:\/\/\S+/g, "").trim();
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
