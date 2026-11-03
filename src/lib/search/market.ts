export type MarketCoin = "bitcoin" | "ethereum";

const COINS: { id: MarketCoin; pattern: RegExp; name: string; page: string }[] = [
  { id: "bitcoin", pattern: /\b(bitcoin|btc)\b/i, name: "Bitcoin", page: "https://www.coingecko.com/en/coins/bitcoin" },
  { id: "ethereum", pattern: /\b(ethereum|ether)\b/i, name: "Ethereum", page: "https://www.coingecko.com/en/coins/ethereum" },
];

/** A known coin price can use a structured feed. Other markets stay on page checks. */
export function marketCoin(query: string): MarketCoin | null {
  return COINS.find((coin) => coin.pattern.test(query))?.id ?? null;
}

function money(usd: number): string {
  return usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function utcClock(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(unixSeconds * 1000));
}

/** Uses only the number and time the feed returned. A missing number is a failed lookup. */
export function presentMarketFeed(
  coin: MarketCoin,
  payload: unknown,
  now = Date.now(),
): { ok: true; body: string; sources: { url: string }[] } | { ok: false } {
  const known = COINS.find((item) => item.id === coin);
  if (!known || !payload || typeof payload !== "object") return { ok: false };
  const row = (payload as Record<string, unknown>)[coin];
  if (!row || typeof row !== "object") return { ok: false };
  const usd = (row as { usd?: unknown }).usd;
  const updated = (row as { last_updated_at?: unknown }).last_updated_at;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return { ok: false };
  const price = `CoinGecko lists ${known.name} at ${money(usd)}.`;
  const notes = ["This is not a live exchange quote."];
  if (typeof updated === "number" && Number.isFinite(updated) && updated > 0) {
    notes.unshift(`Updated ${utcClock(updated)}.`);
    if (now / 1000 - updated > 86_400) notes.unshift("That update is more than a day old.");
  }
  return {
    ok: true,
    sources: [{ url: known.page }],
    body: `${price} ${notes.join(" ")}\n\nSources\n${known.page}`,
  };
}
