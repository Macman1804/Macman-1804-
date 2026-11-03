import assert from "node:assert/strict";
import test from "node:test";
import { checkAgainstSources, needsLiveLookup, parseSearchPayload, searchQuery, spokenText, verifiedReply } from "./live.ts";

test("a private question stays off the web and a current one does not", () => {
  assert.equal(needsLiveLookup("The bicycle is named Pilot."), false);
  assert.equal(needsLiveLookup("What is today's date?"), false);
  assert.equal(needsLiveLookup("What is the weather in Boston today?"), true);
  assert.equal(needsLiveLookup("What is the latest news about the port?"), true);
  assert.equal(needsLiveLookup("What is the price of copper right now?"), true);
  assert.equal(needsLiveLookup("What is the bitcoin price?"), true);
});

test("the search query drops an email and does not grow a second account into it", () => {
  const query = searchQuery("Weather for ada@example.com and +15551212000. Owner b is not included.");
  assert.equal(query.includes("@"), false);
  assert.equal(query.includes("555"), false);
  assert.equal(query.toLowerCase().includes("owner-b@"), false);
});

test("a failed or unsourced lookup cannot invent a link", () => {
  assert.equal(parseSearchPayload({ output: [{ content: [{ type: "output_text", text: "Copper is $9." }] }] }).ok, false);
  const invented = verifiedReply("Copper is up. See https://fake.example/price", ["https://news.example/copper"]);
  assert.equal(invented.ok, true);
  if (!invented.ok) return;
  assert.equal(invented.body.includes("fake.example"), false);
  assert.equal(invented.sources.length, 1);
  assert.equal(invented.sources[0]?.url, "https://news.example/copper");
});

test("disagreeing sources are both kept and a date is not added", () => {
  const parsed = parseSearchPayload({
    citations: ["https://a.example/story", "https://b.example/story"],
    output: [
      {
        content: [
          {
            type: "output_text",
            text: "One source says the bill passed. Another says it stalled.",
          },
        ],
      },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.match(parsed.body, /https:\/\/a\.example\/story/);
  assert.match(parsed.body, /https:\/\/b\.example\/story/);
  assert.equal(parsed.body.includes("2026"), false);
  assert.equal(spokenText(parsed.body).includes("https://"), false);
});

test("a market quote keeps only a figure that is on the page, once", () => {
  const drafted = verifiedReply("Bitcoin is $67,234.50 at 3:15 p.m. See https://news.example/btc", [
    "https://blog.example/story",
    "https://finance.yahoo.com/quote/BTC-USD/",
    "https://finance.yahoo.com/quote/BTC-USD/?utm_source=macman",
  ]);
  assert.equal(drafted.ok, true);
  if (!drafted.ok) return;
  assert.equal(drafted.sources.length, 2);
  assert.equal(drafted.sources[0]?.url, "https://finance.yahoo.com/quote/BTC-USD");
  assert.equal(drafted.body.split("https://finance.yahoo.com/quote/BTC-USD").length, 2);

  const checked = checkAgainstSources(drafted.body, [
    "Bitcoin 67234.50 as of 3:15 p.m. ET. Quotes are delayed 15 minutes.",
  ]);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  assert.match(checked.body, /\$67,234\.50/);
  assert.match(checked.body, /3:15 p\.m\./);
  assert.match(checked.body, /time zone as ET/);
  assert.match(checked.body, /quote delayed/);
  assert.equal(spokenText(checked.body).includes("https://"), false);

  const missing = checkAgainstSources(drafted.body, ["Bitcoin was discussed. No quote on this page. Eastern Time."]);
  assert.equal(missing.ok, true);
  if (!missing.ok) return;
  assert.equal(missing.body.includes("67,234"), false);
  assert.match(missing.body, /not on the source page/);
});

