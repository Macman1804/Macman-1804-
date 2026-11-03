import { assess, atr, ema, macd, rsi, vwap, type Bar } from "./candles.ts";
import { localeOf, parseLang, type Lang } from "../i18n/language.ts";

export type Quote = {
  symbol: string;
  exchange: string;
  price: number;
  previous: number | null;
  volume: number | null;
  time: number;
  bars: Bar[];
};

function money(value: number, lang: Lang): string {
  return value.toLocaleString(localeOf(lang), { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function parseYahooChart(payload: unknown): Quote | null {
  if (!payload || typeof payload !== "object") return null;
  const result = (payload as { chart?: { result?: unknown[] } }).chart?.result?.[0];
  if (!result || typeof result !== "object") return null;
  const row = result as {
    meta?: Record<string, unknown>;
    timestamp?: unknown[];
    indicators?: { quote?: Record<string, unknown[]>[] };
  };
  const meta = row.meta;
  const price = meta?.regularMarketPrice;
  const time = meta?.regularMarketTime;
  const symbol = meta?.symbol;
  if (typeof price !== "number" || typeof time !== "number" || typeof symbol !== "string") return null;
  const opens = row.indicators?.quote?.[0]?.open ?? [];
  const highs = row.indicators?.quote?.[0]?.high ?? [];
  const lows = row.indicators?.quote?.[0]?.low ?? [];
  const closes = row.indicators?.quote?.[0]?.close ?? [];
  const volumes = row.indicators?.quote?.[0]?.volume ?? [];
  const stamps = row.timestamp ?? [];
  const bars: Bar[] = [];
  for (let i = 0; i < stamps.length; i += 1) {
    const stamp = stamps[i];
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i];
    if (
      typeof stamp !== "number" ||
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number"
    ) {
      continue;
    }
    bars.push({ time: stamp, open, high, low, close, volume: typeof volume === "number" ? volume : 0 });
  }
  return {
    symbol,
    exchange: typeof meta?.fullExchangeName === "string" ? meta.fullExchangeName : "the source exchange",
    price,
    previous: typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : null,
    volume: typeof meta?.regularMarketVolume === "number" ? meta.regularMarketVolume : null,
    time,
    bars,
  };
}

export function presentQuote(quote: Quote, language: Lang = "en"): string {
  const lang = parseLang(language);
  const when = new Intl.DateTimeFormat(localeOf(lang), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(quote.time * 1000));
  const change =
    quote.previous && quote.previous > 0 ? ((quote.price - quote.previous) / quote.previous) * 100 : null;
  const closes = quote.bars.map((bar) => bar.close);
  const line = macd(closes);
  const average = vwap(quote.bars);
  const range = atr(quote.bars);
  const bits = [
    `${quote.symbol} ${lang === "es" ? "en" : "on"} ${quote.exchange} ${lang === "es" ? "está en" : "is"} ${money(quote.price, lang)}. ${lang === "es" ? "Actualizado" : "Updated"} ${when}.`,
    change === null ? "" : lang === "es" ? `Cambio diario ${change >= 0 ? "+" : ""}${change.toFixed(1)}% frente al cierre anterior.` : `Daily change ${change >= 0 ? "+" : ""}${change.toFixed(1)}% from the prior close.`,
    quote.volume === null ? "" : lang === "es" ? `Volumen ${quote.volume.toLocaleString(localeOf(lang))}.` : `Volume ${quote.volume.toLocaleString("en-US")}.`,
    lang === "es"
      ? "Este es el último precio disponible de Yahoo Finance, no una cotización de bolsa en tiempo real confirmada. La capitalización y las cadenas de opciones no están en esta fuente."
      : "This is Yahoo Finance's latest available price, not a confirmed real-time exchange feed. Market cap and options chains are not in this feed.",
    quote.bars.length ? (lang === "es" ? `Velas diarias usadas: ${quote.bars.length}.` : `Daily bars used: ${quote.bars.length}.`) : "",
    ema(closes, 9) === null ? "" : `EMA 9 ${money(ema(closes, 9) ?? 0, lang)}.`,
    ema(closes, 21) === null ? "" : `EMA 21 ${money(ema(closes, 21) ?? 0, lang)}.`,
    ema(closes, 50) === null ? "" : `EMA 50 ${money(ema(closes, 50) ?? 0, lang)}.`,
    ema(closes, 200) === null ? (lang === "es" ? "La EMA 200 necesita más historial diario del que devolvió esta fuente." : "EMA 200 needs more daily history than this feed returned.") : `EMA 200 ${money(ema(closes, 200) ?? 0, lang)}.`,
    rsi(closes) === null ? "" : `RSI ${rsi(closes)?.toFixed(0)}.`,
    line
      ? lang === "es"
        ? `Línea MACD ${line.line.toFixed(2)}. Señal ${line.signal.toFixed(2)}.`
        : `MACD line ${line.line.toFixed(2)}. Signal ${line.signal.toFixed(2)}.`
      : "",
    range === null ? "" : `ATR ${money(range, lang)}.`,
    average === null ? "" : lang === "es" ? `VWAP de estas velas diarias ${money(average, lang)}. No es un VWAP de la sesión intradía.` : `VWAP across these daily bars ${money(average, lang)}. This is not an intraday session VWAP.`,
    assess(quote.bars, lang),
    lang === "es"
      ? "Los gráficos de cinco minutos, quince minutos, una hora y cuatro horas no están disponibles sin una cuenta de datos de pago."
      : "Five-minute, 15-minute, hourly, and 4-hour charts are not available without a paid data account.",
  ];
  const page = `https://finance.yahoo.com/quote/${encodeURIComponent(quote.symbol)}`;
  return `${bits.filter(Boolean).join(" ")}\n\nSources\n${page}`;
}

const SKIP = new Set(["THE", "A", "PRICE", "STOCK", "QUOTE", "OF", "WHAT", "IS", "USD", "SHARE", "SHARES", "PRECIO", "DE", "LA", "EL"]);

export function askedSymbol(text: string): string | null {
  if (/\b(bitcoin|btc|ethereum|ether|solana|xrp|ripple|cardano)\b/i.test(text)) return null;
  if (/\b(s&p 500|s&p|spx)\b/i.test(text) && /\b(price|quote|index|precio|índice|indice)\b/i.test(text)) return "^GSPC";
  if (/\b(dow|dow jones)\b/i.test(text) && /\b(price|quote|index|precio|índice|indice)\b/i.test(text)) return "^DJI";
  if (/\bnasdaq\b/i.test(text) && /\b(price|quote|index|composite|precio|índice|indice)\b/i.test(text)) return "^IXIC";
  const of = text.match(/\b(?:price|quote|stock|precio|cotizaci[oó]n|acci[oó]n)\s+(?:of\s+|de\s+)?([A-Za-z]{1,5})\b/i);
  const before = text.match(/\b([A-Za-z]{1,5})\s+(?:price|quote|stock|precio)\b/i);
  const raw = (of?.[1] ?? before?.[1] ?? "").toUpperCase();
  if (!raw || SKIP.has(raw) || !/^[A-Z]{1,5}$/.test(raw)) return null;
  return raw;
}
