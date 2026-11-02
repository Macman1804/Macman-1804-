const DATE_QUESTION =
  /\b(today'?s date|what(?:'s| is) the date|what day is it|what(?:'s| is) today)\b/i;

export function calendarReply(body: string, now: Date, timeZone: string): string | null {
  if (!DATE_QUESTION.test(body)) return null;
  let zone = timeZone || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(now);
  } catch {
    zone = "America/New_York";
  }
  const clock = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: zone,
  }).format(now);
  return `Today is ${clock}.`;
}
