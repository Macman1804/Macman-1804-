import assert from "node:assert/strict";
import test from "node:test";
import { checkAgainstSources, spokenText, verifiedReply } from "./live.ts";
import { searchEvent } from "./diagnose.ts";
import { marketCoin, presentMarketFeed } from "./market.ts";

test("a verified coin quote uses the feed number, UTC, and CoinGecko only", () => {
  assert.equal(marketCoin("What is the bitcoin price?"), "bitcoin");
  assert.equal(marketCoin("What is the weather?"), null);
  const shown = presentMarketFeed(
    "bitcoin",
    { bitcoin: { usd: 67234.5, last_updated_at: 1762160000 }, ethereum: { usd: 1 } },
    1762161000 * 1000,
  );
  assert.equal(shown.ok, true);
  if (!shown.ok) return;
  assert.match(shown.body, /CoinGecko lists Bitcoin at \$67,234\.50/);
  assert.match(shown.body, /UTC/);
  assert.match(shown.body, /not a live exchange quote/);
  assert.equal(shown.sources.length, 1);
  assert.equal(shown.sources[0]?.url, "https://www.coingecko.com/en/coins/bitcoin");
  assert.equal(shown.body.includes("ethereum"), false);
  assert.equal(spokenText(shown.body).includes("https://"), false);
});

test("a feed without a usable price fails closed", () => {
  assert.equal(presentMarketFeed("bitcoin", {}).ok, false);
  assert.equal(presentMarketFeed("bitcoin", { bitcoin: { usd: 0, last_updated_at: 1762160000 } }).ok, false);
  assert.equal(presentMarketFeed("bitcoin", { bitcoin: { usd: "67234" } }).ok, false);
  assert.equal(presentMarketFeed("ethereum", { bitcoin: { usd: 10 } }).ok, false);
});

test("a web page that lacks the quoted price is still refused", () => {
  const drafted = verifiedReply("Bitcoin is $67,234.50. [1]", ["https://finance.yahoo.com/quote/BTC-USD"]);
  assert.equal(drafted.ok, true);
  if (!drafted.ok) return;
  const missing = checkAgainstSources(drafted.body, [
    { url: "https://finance.yahoo.com/quote/BTC-USD", text: "The page loaded without a figure." },
  ]);
  assert.equal(missing.ok, false);
});

test("a search log cannot carry a query or a key", () => {
  const event = searchEvent("price_not_on_page", 200);
  assert.deepEqual(event, { macman: "search", stage: "price_not_on_page", status: 200 });
  assert.equal(JSON.stringify(event).includes("bitcoin"), false);
  assert.equal(JSON.stringify(event).includes("key"), false);
});
