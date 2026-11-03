import { createServerFn } from "@tanstack/react-start";
import { supabaseMiddleware } from "@/lib/supabase/middleware";
import { fetchBoard, fetchQuote } from "@/lib/research/provider.server";
import type { LeagueId } from "@/lib/research/sports";

const guards = [supabaseMiddleware] as const;
const LEAGUES = new Set<LeagueId>(["nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab"]);

export const lookupSymbol = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { symbol?: string }) => {
    const symbol = (input?.symbol ?? "").trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol) && !/^\^[A-Z]{1,5}$/.test(symbol)) throw new Error("Use a symbol such as AAPL.");
    return { symbol };
  })
  .handler(async ({ data }) => {
    const text = await fetchQuote(data.symbol);
    if (!text) throw new Error("That quote could not be verified.");
    return { text };
  });

export const loadBoard = createServerFn({ method: "POST" })
  .middleware(guards)
  .validator((input: { league?: string }) => {
    const league = (input?.league ?? "") as LeagueId;
    if (!LEAGUES.has(league)) throw new Error("Choose a league.");
    return { league };
  })
  .handler(async ({ data }) => {
    const text = await fetchBoard(data.league);
    if (!text) throw new Error("That board could not be verified.");
    return { text };
  });
