export type SearchStage =
  | "no_key"
  | "provider_http"
  | "provider_parse"
  | "page_unreadable"
  | "price_not_on_page"
  | "market_ok"
  | "market_unavailable"
  | "weather_ok"
  | "weather_unavailable"
  | "news_unreadable"
  | "verified";

/** A stage name and an HTTP status only. No query, key, or page text. */
export function searchEvent(stage: SearchStage, status: number | null = null) {
  return { macman: "search", stage, status };
}
