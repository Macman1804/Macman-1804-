const DATE_QUESTION =
  /\b(today'?s date|what(?:'s| is) the date|what day is it|what(?:'s| is) today|fecha de hoy|qu[eé] d[ií]a es|qu[eé] fecha|d[ií]a de hoy)\b/i;

export function calendarReply(body: string, now: Date, timeZone: string, language: "en" | "es" = "en"): string | null {
  if (!DATE_QUESTION.test(body)) return null;
  let zone = timeZone || "America/New_York";
  const locale = language === "es" ? "es-ES" : "en-US";
  try {
    new Intl.DateTimeFormat(locale, { timeZone: zone }).format(now);
  } catch {
    zone = "America/New_York";
  }
  const clock = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: zone,
  }).format(now);
  return language === "es" ? `Hoy es ${clock}.` : `Today is ${clock}.`;
}
