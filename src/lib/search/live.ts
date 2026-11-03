/** Desk answers stay on this model. Live lookup uses the search model. */
export const DESK_MODEL = "grok-4.5";
export const SEARCH_MODEL = "grok-4.7";

export const UNVERIFIED = "I could not verify current information for that.";
export const SEARCH_LIMIT = "The search limit for this account was reached. Current information was not checked.";

const DATE_ONLY =
  /\b(today'?s date|what(?:'s| is) the date|what day is it|what(?:'s| is) today)\b/i;

const LIVE =
  /\b(news|headline|breaking|stock|stocks|share price|nasdaq|dow\b|s&p|market|bitcoin|btc|crypto|weather|forecast|temperature|score|scores|standings|who won|price of|how much is|how much does|law|statute|regulation|bill|election|earthquake|hurricane|right now|this week|yesterday|latest|current|noticias|noticia|titulares|clima|pron[oó]stico|temperatura|precio|cotizaci[oó]n|mercado|marcador|terremoto|hurac[aá]n|elecci[oó]n)\b/i;

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

function originalSource(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.\]]+$/, "");
  const direct = canonical(trimmed);
  if (!direct) return null;
  const parsed = new URL(direct);
  if (parsed.hostname.replace(/^www\./, "") !== "r.jina.ai") return direct;
  const embedded = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const target = /^https?:\/\//i.test(embedded)
    ? embedded.replace(/^http:\/\//i, "https://")
    : /^https?:\//i.test(embedded)
      ? embedded.replace(/^https?:\//i, "https://")
      : "";
  if (!target) return null;
  const inner = canonical(target);
  if (!inner || new URL(inner).hostname.replace(/^www\./, "") === "r.jina.ai") return null;
  return inner;
}

function httpsOnly(values: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    const url = originalSource(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    kept.push(url);
  }
  kept.sort((left, right) => authorityRank(left) - authorityRank(right));
  return kept.slice(0, 5);
}

function stripMarkers(text: string): string {
  return text
    .replace(/\[\[?\d+\]?\]/g, "")
    .replace(/【\d+】/g, "")
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sentenceOk(sentence: string): boolean {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  if (/\b(is|are|at|of|for|see|was|were|a|the)\s*[.!?]?$/i.test(sentence)) return false;
  if (/\$\s*[.!?]?$/.test(sentence)) return false;
  if (/\b(left out|could not be read|not on the source|source page)\b/i.test(sentence)) return false;
  return true;
}

function cleanProse(text: string): string {
  const plain = stripMarkers(text).replace(/\s+/g, " ").trim();
  return plain
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(sentenceOk)
    .join(" ");
}

/** Drops any link the provider did not return. Proxy links are unwrapped. Markers stay out of the sentence. */
export function verifiedReply(
  text: string,
  citations: readonly string[],
): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  const sources = httpsOnly([...citations]);
  const prose = stripMarkers(text);
  if (!prose || sources.length === 0) return { ok: false };
  return {
    ok: true,
    sources: sources.map((url) => ({ url })),
    body: `${prose}\n\nSources\n${sources.join("\n")}`,
  };
}

const PRICE = /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$\s?\d+(?:\.\d+)?/g;
const CLOCK = /\b\d{1,2}:\d{2}(?:\s?[ap]\.?m\.?)?\b/gi;

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

function sourceName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const names: Record<string, string> = {
    "finance.yahoo.com": "Yahoo Finance",
    "coingecko.com": "CoinGecko",
    "coinbase.com": "Coinbase",
    "coinmarketcap.com": "CoinMarketCap",
    "reuters.com": "Reuters",
    "nasdaq.com": "Nasdaq",
  };
  return names[host] ?? host;
}

function zoneOn(page: string): string | null {
  const match = page.match(
    /\b(Eastern Time|Pacific Time|Central Time|Mountain Time|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|GMT)\b/,
  );
  return match?.[1] ?? null;
}

type PricedPage = { url: string; text: string };

function presentMarket(
  claimed: string,
  pages: readonly PricedPage[],
): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  const claimedPrices = [...claimed.matchAll(PRICE)].map((match) => match[0].replace(/\s/g, ""));
  const claimedTimes = [...claimed.matchAll(CLOCK)].map((match) => match[0]);
  const kept: { url: string; price: string; time?: string; zone: string | null; delayed: boolean; live: boolean }[] = [];
  for (const page of pages) {
    const url = originalSource(page.url);
    if (!url || !page.text.trim()) continue;
    const price = claimedPrices.find((item) => pageHas(page.text, item));
    if (!price) continue;
    const lower = page.text.toLowerCase();
    kept.push({
      url,
      price,
      time: claimedTimes.find((item) => pageHas(page.text, item)),
      zone: zoneOn(page.text),
      delayed: /delayed|15-minute|15 minute|not real-time|not realtime/.test(lower),
      live: /real-time|realtime|live price|live quote/.test(lower),
    });
  }
  if (kept.length === 0) return { ok: false };
  const prices = [...new Set(kept.map((item) => item.price))];
  const sentence =
    prices.length === 1
      ? `The quoted price is ${prices[0]}${kept.find((item) => item.time)?.time ? ` as of ${kept.find((item) => item.time)?.time}` : ""}.`
      : kept
          .filter((item, index) => kept.findIndex((other) => other.price === item.price) === index)
          .slice(0, 2)
          .map((item) => `${sourceName(item.url)} lists ${item.price}.`)
          .join(" ");
  const notes: string[] = [];
  const zones = [...new Set(kept.map((item) => item.zone).filter((item): item is string => Boolean(item)))];
  if (zones.length === 1) notes.push(`The time zone is ${zones[0]}.`);
  if (kept.every((item) => item.delayed)) notes.push("That quote is delayed.");
  else if (kept.every((item) => item.live && !item.delayed)) notes.push("That quote is live.");
  const urls = httpsOnly(kept.map((item) => item.url));
  return {
    ok: true,
    sources: urls.map((url) => ({ url })),
    body: `${[sentence, ...notes].join(" ")}\n\nSources\n${urls.join("\n")}`,
  };
}

export function isMarketQuote(text: string): boolean {
  return /\b(bitcoin|btc|ethereum|crypto|stock|nasdaq|share|market|price)\b|\$\s?\d/i.test(text);
}

/** A market source is shown only when its page contains the quoted price. */
export function checkAgainstSources(
  body: string,
  pages: readonly { url: string; text: string }[],
): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  const [prose, listed = ""] = body.split("\n\nSources\n");
  const sources = httpsOnly(listed.split("\n"));
  if (!prose?.trim() || sources.length === 0) return { ok: false };
  if (isMarketQuote(prose)) {
    const paired = sources.map((url) => ({
      url,
      text: pages.find((page) => originalSource(page.url) === url)?.text ?? "",
    }));
    return presentMarket(prose, paired);
  }
  const clean = cleanProse(prose);
  if (!clean) return { ok: false };
  return {
    ok: true,
    sources: sources.map((url) => ({ url })),
    body: `${clean}\n\nSources\n${sources.join("\n")}`,
  };
}

/** News is shown only when a retrieved page has readable text. */
export function presentNews(
  body: string,
  pages: readonly { url: string; text: string }[],
): { ok: true; body: string; sources: LiveSource[] } | { ok: false } {
  const [prose, listed = ""] = body.split("\n\nSources\n");
  const readable = httpsOnly(listed.split("\n")).filter((url) => {
    const text = pages.find((page) => originalSource(page.url) === url)?.text ?? "";
    return text.replace(/\s+/g, " ").trim().length >= 80;
  });
  const clean = cleanProse(prose ?? "");
  if (!clean || readable.length === 0) return { ok: false };
  return {
    ok: true,
    sources: readable.map((url) => ({ url })),
    body: `${clean}\n\nSources\n${readable.join("\n")}`,
  };
}

export function isNewsQuery(query: string): boolean {
  return /\b(news|headline|headlines|noticias|noticia|titulares)\b/i.test(query);
}

export function spokenText(body: string): string {
  return stripMarkers(body.split(/\n\nSources\n/)[0] ?? "").replace(/\s+/g, " ").trim();
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
