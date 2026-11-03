export type SearchStage =
  | "no_key"
  | "provider_http"
  | "provider_parse"
  | "page_unreadable"
  | "price_not_on_page"
  | "market_ok"
  | "market_unavailable"
  | "verified";

/** A stage name and an HTTP status only. No query, key, or page text. */
export function searchEvent(stage: SearchStage, status: number | null = null) {
  return { macman: "search", stage, status };
}
