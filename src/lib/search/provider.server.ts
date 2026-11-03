import { SEARCH_MODEL, checkAgainstSources, isMarketQuote, parseSearchPayload, type LiveSource } from "@/lib/search/live";

function safeHttps(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "169.254.169.254" ||
      host === "metadata.google.internal"
    ) {
      return null;
    }
    if (/^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function readPublicPage(start: string): Promise<string | null> {
  let current = safeHttps(start);
  if (!current) return null;
  try {
    for (let hop = 0; hop < 3; hop += 1) {
      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "text/html,text/plain", "User-Agent": "Macman" },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = safeHttps(new URL(res.headers.get("location") ?? "", current).toString());
        if (!next) return null;
        current = next;
        continue;
      }
      if (!res.ok) return null;
      const type = res.headers.get("content-type") ?? "";
      if (!/text\/html|text\/plain|application\/json/i.test(type)) return null;
      const raw = await res.text();
      return raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 80_000);
    }
  } catch {
    return null;
  }
  return null;
}

export async function liveSearch(
  query: string,
): Promise<{ ok: true; body: string; sources: LiveSource[] } | { ok: false }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || !query) return { ok: false };
  const market = isMarketQuote(query);
  try {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: SEARCH_MODEL,
        max_output_tokens: 400,
        input: [
          {
            role: "system",
            content: market
              ? "Answer from web search only. Prefer Yahoo Finance, CoinGecko, Coinbase, Reuters, Nasdaq, or the exchange itself. Quote a price or a time only if the page states it. Do not invent a time zone or call a quote live unless the page says so. Two short sentences."
              : "Answer from web search only. Two short sentences. If sources disagree, say they disagree. Do not invent a URL, a price, a score, or a date. If you cannot verify it, say you could not verify it.",
          },
          { role: "user", content: query },
        ],
        tools: [{ type: "web_search" }],
      }),
    });
    if (!res.ok) return { ok: false };
    const parsed = parseSearchPayload(await res.json());
    if (!parsed.ok) return parsed;
    const pages = await Promise.all(
      parsed.sources.slice(0, 3).map(async (source) => ({
        url: source.url,
        text: (await readPublicPage(source.url)) ?? "",
      })),
    );
    return checkAgainstSources(parsed.body, pages);
  } catch {
    return { ok: false };
  }
}
