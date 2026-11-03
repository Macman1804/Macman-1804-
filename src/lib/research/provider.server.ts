import { UNVERIFIED } from "@/lib/search/live";
import { parseYahooChart, presentQuote, askedSymbol } from "@/lib/research/quote";
import { askedLeague, leaguePath, presentBoard, type LeagueId } from "@/lib/research/sports";
import { parseLang, type Lang } from "@/lib/i18n/language";

const headers = { Accept: "application/json", "User-Agent": "Macman" };

export async function fetchQuote(symbol: string, language: Lang = "en"): Promise<string | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`,
      { headers, signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const quote = parseYahooChart(await res.json());
    return quote ? presentQuote(quote, language) : null;
  } catch {
    return null;
  }
}

export async function fetchBoard(id: LeagueId, language: Lang = "en"): Promise<string | null> {
  try {
    const res = await fetch(leaguePath(id), { headers, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return presentBoard(id, await res.json(), new Date(), language);
  } catch {
    return null;
  }
}

/** A verified quote or scoreboard. Null means this was not a trading or sports question. */
export async function researchReply(text: string, language: Lang = "en"): Promise<string | null> {
  const lang = parseLang(language);
  const refused = lang === "es" ? "No pude verificar la información actual." : UNVERIFIED;
  const league = askedLeague(text);
  if (league) return (await fetchBoard(league, lang)) ?? refused;
  const symbol = askedSymbol(text);
  if (!symbol) return null;
  return (await fetchQuote(symbol, lang)) ?? refused;
}
