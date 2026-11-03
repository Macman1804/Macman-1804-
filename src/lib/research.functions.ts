import { createServerFn } from "@tanstack/react-start";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { fetchBoard, fetchQuote } from "@/lib/research/provider.server";
import type { LeagueId } from "@/lib/research/sports";
import { parseLang } from "@/lib/i18n/language";

const guards = [supabaseMiddleware] as const;
const LEAGUES = new Set<LeagueId>(["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab"]);

export const lookupSymbol = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { symbol?: string; language?: string }) => {
    const symbol = (input?.symbol ?? "").trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol) && !/^\^[A-Z]{1,5}$/.test(symbol)) throw new Error("Use a symbol such as AAPL.");
    return { symbol, language: parseLang(input?.language) };
  })
  .handler(async ({ data }) => {
    const text = await fetchQuote(data.symbol, data.language);
    if (!text) throw new Error("That quote could not be verified.");
    return { text };
  });

export const loadBoard = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { league?: string; language?: string }) => {
    const league = (input?.league ?? "") as LeagueId;
    if (!LEAGUES.has(league)) throw new Error("Choose a league.");
    return { league, language: parseLang(input?.language) };
  })
  .handler(async ({ data }) => {
    const text = await fetchBoard(data.league, data.language);
    if (!text) throw new Error("That board could not be verified.");
    return { text };
  });
