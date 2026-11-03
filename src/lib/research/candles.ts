import { parseLang, type Lang } from "../i18n/language.ts";

export type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export function ema(values: number[], period: number): number | null {
  if (period < 1 || values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) prev = value * k + prev * (1 - k);
  return prev;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(closes: number[]): { line: number; signal: number } | null {
  if (closes.length < 35) return null;
  const fast: number[] = [];
  const slow: number[] = [];
  for (let i = 26; i <= closes.length; i += 1) {
    const slice = closes.slice(0, i);
    const emaFast = ema(slice, 12);
    const emaSlow = ema(slice, 26);
    if (emaFast === null || emaSlow === null) continue;
    fast.push(emaFast);
    slow.push(emaSlow);
  }
  const line = fast.map((value, index) => value - slow[index]);
  const signal = ema(line, 9);
  const last = line[line.length - 1];
  if (signal === null || last === undefined) return null;
  return { line: last, signal };
}

export function atr(bars: Bar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const ranges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const previous = bars[i - 1].close;
    ranges.push(Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous)));
  }
  if (ranges.length < period) return null;
  let value = ranges.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (const item of ranges.slice(period)) value = (value * (period - 1) + item) / period;
  return value;
}

export function vwap(bars: Bar[]): number | null {
  let total = 0;
  let volume = 0;
  for (const bar of bars) {
    if (bar.volume <= 0) continue;
    total += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
    volume += bar.volume;
  }
  return volume > 0 ? total / volume : null;
}

function money(value: number, lang: Lang = "en"): string {
  return value.toLocaleString(lang === "es" ? "es-ES" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function assess(bars: Bar[], language: Lang = "en"): string {
  const lang = parseLang(language);
  const closes = bars.map((bar) => bar.close);
  const price = closes[closes.length - 1];
  const ema50 = ema(closes, 50);
  const momentum = rsi(closes);
  if (price === undefined || ema50 === null || momentum === null || bars.length < 30) {
    return lang === "es"
      ? "ESPERA — NO HAY UNA CONFIGURACIÓN CONFIRMADA. No hay suficientes velas diarias."
      : "WAIT — NO CONFIRMED SETUP. There are not enough daily bars.";
  }
  const trendUp = price > ema50;
  const momentumUp = momentum >= 55;
  const momentumDown = momentum <= 45;
  if (!((trendUp && momentumUp) || (!trendUp && momentumDown))) {
    return lang === "es"
      ? "ESPERA — NO HAY UNA CONFIGURACIÓN CONFIRMADA. La tendencia diaria y el impulso no coinciden. Esto no es un resultado garantizado."
      : "WAIT — NO CONFIRMED SETUP. The daily trend and momentum disagree. This is not a guaranteed outcome.";
  }
  const recent = bars.slice(-20);
  const support = Math.min(...recent.map((bar) => bar.low));
  const resistance = Math.max(...recent.map((bar) => bar.high));
  const range = atr(bars);
  const lean = trendUp ? (lang === "es" ? "alcista" : "bullish") : lang === "es" ? "bajista" : "bearish";
  const stop = range === null ? null : trendUp ? support - range : resistance + range;
  const entry = trendUp ? support : resistance;
  const target = trendUp ? resistance : support;
  const reward = Math.abs(target - entry);
  const risk = stop === null ? null : Math.abs(entry - stop);
  const ratio = risk && risk > 0 ? (reward / risk).toFixed(1) : null;
  return lang === "es"
    ? [
        `La evidencia diaria es ${lean}. Esto no es un resultado garantizado ni una orden.`,
        `El soporte reciente es ${money(support, lang)}. La resistencia reciente es ${money(resistance, lang)}.`,
        stop === null
          ? "No se puede fijar un stop porque falta el rango promedio."
          : `Un escenario usa ${money(entry, lang)} como zona y ${money(stop, lang)} como invalidación.`,
        ratio ? `Si esos niveles se mantienen, el riesgo/beneficio ilustrado es ${ratio} a 1.` : "",
        "La idea queda invalidada si el siguiente cierre diario cruza la media de 50 días en sentido contrario.",
      ]
        .filter(Boolean)
        .join(" ")
    : [
    `The daily evidence is ${lean}. This is not a guaranteed outcome and it is not an order.`,
    `Recent support is ${money(support, lang)}. Recent resistance is ${money(resistance, lang)}.`,
    stop === null
      ? "A stop cannot be set because the average range is missing."
      : `A scenario uses ${money(entry, lang)} as the zone and ${money(stop, lang)} as the invalidation.`,
    ratio ? `If those levels hold, the illustrated risk/reward is ${ratio} to 1.` : "",
    "The setup is invalidated if the next daily close crosses the 50-day average the other way.",
  ]
    .filter(Boolean)
    .join(" ");
}
