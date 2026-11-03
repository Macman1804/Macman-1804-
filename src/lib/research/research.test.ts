import assert from "node:assert/strict";
import test from "node:test";
import { assess } from "./candles.ts";
import { askedSymbol, parseYahooChart } from "./quote.ts";
import { askedLeague, presentBoard } from "./sports.ts";
import { optionScenario, parlay } from "./bets.ts";
import type { Bar } from "./candles.ts";

function rising(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return { time: index, open: close - 1, high: close + 1, low: close - 2, close, volume: 1000 };
  });
}

test("a long rising series is bullish and a short one waits", () => {
  assert.match(assess(rising(60)), /bullish/);
  assert.match(assess(rising(10)), /WAIT — NO CONFIRMED SETUP/);
  assert.match(assess(rising(60)), /not a guaranteed outcome/);
});

test("a stock symbol is read and a coin or a plain sentence is not", () => {
  assert.equal(askedSymbol("What is the AAPL price?"), "AAPL");
  assert.equal(askedSymbol("price of spy"), "SPY");
  assert.equal(askedSymbol("What is the S&P 500 price?"), "^GSPC");
  assert.equal(askedSymbol("What is the bitcoin price?"), null);
  assert.equal(askedSymbol("What is the weather in Boston?"), null);
});

test("a scoreboard question is read and a preference is not", () => {
  assert.equal(askedLeague("What is the NFL score?"), "nfl");
  assert.equal(askedLeague("college football games today"), "ncaaf");
  assert.equal(askedLeague("I like the NFL"), null);
});

test("a yahoo chart without a price is refused", () => {
  const parsed = parseYahooChart({
    chart: {
      result: [
        {
          meta: { symbol: "AAPL", regularMarketPrice: 190.5, regularMarketTime: 1762160000, fullExchangeName: "NasdaqGS", chartPreviousClose: 188, regularMarketVolume: 1000 },
          timestamp: [1],
          indicators: { quote: [{ open: [189], high: [191], low: [188], close: [190.5], volume: [1000] }] },
        },
      ],
    },
  });
  assert.equal(parsed?.symbol, "AAPL");
  assert.equal(parsed?.price, 190.5);
  assert.equal(parseYahooChart({ chart: { result: [{ meta: { symbol: "AAPL" } }] } }), null);
});

test("a board uses the score it was given and does not add odds", () => {
  const text = presentBoard(
    "nfl",
    {
      events: [
        {
          competitions: [
            {
              status: { type: { state: "post", description: "Final" } },
              competitors: [
                { homeAway: "home", score: "27", team: { displayName: "Green Bay Packers" }, records: [{ summary: "5-2" }] },
                { homeAway: "away", score: "20", team: { displayName: "Chicago Bears" } },
              ],
            },
          ],
        },
      ],
    },
    new Date("2026-11-03T18:00:00Z"),
  );
  assert.ok(text);
  assert.match(text ?? "", /Green Bay Packers 27/);
  assert.match(text ?? "", /Final/);
  assert.match(text ?? "", /not a wager/);
  assert.equal((text ?? "").includes("moneyline"), false);
});

test("option and parlay math does not invent a contract or treat a same-game parlay as independent", () => {
  const call = optionScenario({ side: "call", strike: 100, premium: 2, sharePrice: null });
  assert.equal(call.ok, true);
  if (call.ok) assert.match(call.text, /Break-even is 102.00/);
  assert.equal(optionScenario({ side: "call", strike: 100, premium: 0, sharePrice: null }).ok, false);
  const same = parlay({ legs: [-110, -110], stake: 10, sameGame: true });
  assert.equal(same.ok, true);
  if (same.ok) {
    assert.match(same.text, /correlated/);
    assert.equal(same.text.includes("multiplied chance would be"), false);
  }
  const separate = parlay({ legs: [+150, -110], stake: 10, sameGame: false });
  assert.equal(separate.ok, true);
  if (separate.ok) assert.match(separate.text, /usually lowers the chance/);
});
