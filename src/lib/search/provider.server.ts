import { SEARCH_MODEL, checkAgainstSources, isMarketQuote, isNewsQuery, parseSearchPayload, presentNews, type LiveSource } from "@/lib/search/live";
import { searchEvent, type SearchStage } from "@/lib/search/diagnose";
import { marketCoin, presentMarketFeed } from "@/lib/search/market";
import { NAME_A_CITY, isWeatherQuery, presentWeather, weatherPlace } from "@/lib/search/weather";
import { parseLang, type Lang } from "@/lib/i18n/language";

function note(stage: SearchStage, status: number | null = null) {
  console.info(JSON.stringify(searchEvent(stage, status)));
}

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

async function weatherLookup(query: string, language: Lang): Promise<{ ok: true; body: string; sources: LiveSource[] } | { ok: false }> {
  const place = weatherPlace(query);
  if (!place) {
    note("weather_ok");
    return {
      ok: true,
      body: language === "es" ? "Nombra una ciudad y puedo consultar el clima." : NAME_A_CITY,
      sources: [],
    };
  }
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=${language}&format=json`,
      { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } },
    );
    if (!geoRes.ok) {
      note("weather_unavailable", geoRes.status);
      return { ok: false };
    }
    const geo = (await geoRes.json()) as { results?: { name?: unknown; admin1?: unknown; latitude?: unknown; longitude?: unknown }[] };
    const hit = geo.results?.[0];
    if (!hit || typeof hit.latitude !== "number" || typeof hit.longitude !== "number" || typeof hit.name !== "string") {
      note("weather_unavailable", geoRes.status);
      return { ok: false };
    }
    const forecast = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`,
      { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } },
    );
    if (!forecast.ok) {
      note("weather_unavailable", forecast.status);
      return { ok: false };
    }
    const shown = presentWeather({
      name: hit.name,
      region: typeof hit.admin1 === "string" ? hit.admin1 : null,
      payload: await forecast.json(),
      lang: language,
    });
    note(shown.ok ? "weather_ok" : "weather_unavailable", forecast.status);
    return shown;
  } catch {
    note("weather_unavailable");
    return { ok: false };
  }
}

export async function liveSearch(
  query: string,
  language: Lang = "en",
): Promise<{ ok: true; body: string; sources: LiveSource[] } | { ok: false }> {
  const lang = parseLang(language);
  if (isWeatherQuery(query)) return weatherLookup(query, lang);
  const coin = marketCoin(query);
  if (coin) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&include_last_updated_at=true`,
        { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } },
      );
      if (!res.ok) {
        note("market_unavailable", res.status);
        return { ok: false };
      }
      const shown = presentMarketFeed(coin, await res.json(), Date.now(), lang);
      note(shown.ok ? "market_ok" : "market_unavailable", res.status);
      return shown;
    } catch {
      note("market_unavailable");
      return { ok: false };
    }
  }
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || !query) {
    note("no_key");
    return { ok: false };
  }
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
            content:
              (market
                ? "Answer from web search only. Prefer Yahoo Finance, CoinGecko, Coinbase, Reuters, Nasdaq, or the exchange itself. Quote a price or a time only if the page states it. Do not invent a time zone or call a quote live unless the page says so. Two short sentences."
                : "Answer from web search only. Two short sentences. If sources disagree, say they disagree. Do not invent a URL, a price, a score, or a date. If you cannot verify it, say you could not verify it.") +
              (lang === "es" ? " Reply in Spanish." : " Reply in English."),
          },
          { role: "user", content: query },
        ],
        tools: [{ type: "web_search" }],
      }),
    });
    if (!res.ok) {
      note("provider_http", res.status);
      return { ok: false };
    }
    const parsed = parseSearchPayload(await res.json());
    if (!parsed.ok) {
      note("provider_parse", res.status);
      return parsed;
    }
    const pages = await Promise.all(
      parsed.sources.slice(0, 3).map(async (source) => ({
        url: source.url,
        text: (await readPublicPage(source.url)) ?? "",
      })),
    );
    if (pages.every((page) => !page.text.trim())) note("page_unreadable");
    const checked = isNewsQuery(query) ? presentNews(parsed.body, pages) : checkAgainstSources(parsed.body, pages);
    if (!checked.ok) note(isNewsQuery(query) ? "news_unreadable" : isMarketQuote(query) ? "price_not_on_page" : "provider_parse");
    else note("verified");
    return checked;
  } catch {
    note("provider_http");
    return { ok: false };
  }
}
