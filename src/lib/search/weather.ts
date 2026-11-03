export const NAME_A_CITY = "Name a city and I can check the weather.";
const SOURCE = "https://open-meteo.com/";

const CONDITIONS: Record<number, string> = {
  0: "clear",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "foggy",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  61: "rain",
  63: "rain",
  65: "rain",
  71: "snow",
  73: "snow",
  75: "snow",
  80: "rain showers",
  81: "rain showers",
  82: "rain showers",
  95: "a thunderstorm",
};

export function isWeatherQuery(query: string): boolean {
  return /\b(weather|forecast|temperature)\b/i.test(query);
}

function cleanPlace(value: string): string | null {
  const place = value
    .replace(/[?.!]+$/g, "")
    .replace(/\b(today|tonight|tomorrow|now|please|right now)\b/gi, "")
    .trim();
  if (place.length < 2 || /^(the|a|my|current|local|what|whats|what's)$/i.test(place)) return null;
  return place;
}

/** A city the person named. No city is invented. */
export function weatherPlace(query: string): string | null {
  const named = query.match(
    /\b(?:weather|forecast|temperature)\s+(?:in|for|at|near)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,3})/i,
  );
  if (named?.[1]) return cleanPlace(named[1]);
  const lead = query.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:weather|forecast|temperature)\b/);
  return lead?.[1] ? cleanPlace(lead[1]) : null;
}

function localClock(stamp: string): string | null {
  const match = stamp.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isInteger(hour) || hour > 23 || !minute) return null;
  const suffix = hour >= 12 ? "p.m." : "a.m.";
  const shown = hour % 12 || 12;
  return `${shown}:${minute} ${suffix}`;
}

export function presentWeather(input: {
  name: string;
  region: string | null;
  payload: unknown;
}): { ok: true; body: string; sources: { url: string }[] } | { ok: false } {
  if (!input.payload || typeof input.payload !== "object") return { ok: false };
  const record = input.payload as { timezone?: unknown; current?: { time?: unknown; temperature_2m?: unknown; weather_code?: unknown } };
  const current = record.current;
  const temperature = current?.temperature_2m;
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return { ok: false };
  const place = input.region && !input.name.includes(input.region) ? `${input.name}, ${input.region}` : input.name;
  const code = current?.weather_code;
  const condition = typeof code === "number" ? CONDITIONS[code] : undefined;
  const reading = condition
    ? `Open-Meteo lists ${place} at ${temperature}°F and ${condition}.`
    : `Open-Meteo lists ${place} at ${temperature}°F.`;
  const notes = ["This is not a live station reading."];
  const clock = typeof current?.time === "string" ? localClock(current.time) : null;
  const zone = typeof record.timezone === "string" && record.timezone.trim() ? record.timezone.trim() : null;
  if (clock && zone) notes.unshift(`Updated ${clock} ${zone}.`);
  return {
    ok: true,
    sources: [{ url: SOURCE }],
    body: `${reading} ${notes.join(" ")}\n\nSources\n${SOURCE}`,
  };
}
