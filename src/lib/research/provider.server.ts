import { UNVERIFIED } from "@/lib/search/live";
import { parseYahooChart, presentQuote, askedSymbol } from "@/lib/research/quote";
import { askedLeague, leaguePath, presentBoard, type LeagueId } from "@/lib/research/sports";

const headers = { Accept: "application/json", "User-Agent": "Macman" };

export async function fetchQuote(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`,
      { headers, signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const quote = parseYahooChart(await res.json());
    return quote ? presentQuote(quote) : null;
  } catch {
    return null;
  }
}

export async function fetchBoard(id: LeagueId): Promise<string | null> {
  try {
    const res = await fetch(leaguePath(id), { headers, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return presentBoard(id, await res.json(), new Date());
  } catch {
    return null;
  }
}

/** A verified quote or scoreboard. Null means this was not a trading or sports question. */
export async function researchReply(text: string): Promise<string | null> {
  const league = askedLeague(text);
  if (league) return (await fetchBoard(league)) ?? UNVERIFIED;
  const symbol = askedSymbol(text);
  if (!symbol) return null;
  return (await fetchQuote(symbol)) ?? UNVERIFIED;
}
