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

test("a market quote keeps a real source and drops a proxy, a marker, and a pageless price", () => {
  const drafted = verifiedReply("Bitcoin is $67,234.50 at 3:15 p.m. [1] [[2]]", [
    "https://r.jina.ai/https://finance.yahoo.com/quote/BTC-USD",
    "https://r.jina.ai/https://blog.example/no-price",
    "https://finance.yahoo.com/quote/BTC-USD/?utm_source=macman",
  ]);
  assert.equal(drafted.ok, true);
  if (!drafted.ok) return;
  assert.equal(drafted.body.includes("r.jina.ai"), false);
  assert.equal(drafted.body.includes("[1]"), false);
  assert.equal(drafted.body.includes("[[2]]"), false);
  assert.match(drafted.body, /https:\/\/finance\.yahoo\.com\/quote\/BTC-USD/);
  assert.equal(drafted.sources.filter((source) => source.url.includes("finance.yahoo.com")).length, 1);

  const checked = checkAgainstSources(drafted.body, [
    {
      url: "https://finance.yahoo.com/quote/BTC-USD",
      text: "Bitcoin 67234.50 as of 3:15 p.m. ET. Quotes are delayed 15 minutes.",
    },
    { url: "https://blog.example/no-price", text: "No figure on this page." },
  ]);
  assert.equal(checked.ok, true);
  if (!checked.ok) return;
  assert.match(checked.body, /The quoted price is \$67,234\.50 as of 3:15 p\.m\./);
  assert.match(checked.body, /The time zone is ET/);
  assert.match(checked.body, /That quote is delayed/);
  assert.equal(checked.body.includes("blog.example"), false);
  assert.equal(checked.body.includes("left out"), false);
  assert.equal(checked.body.includes("r.jina.ai"), false);
  assert.equal(spokenText(checked.body).includes("https://"), false);
  assert.equal(spokenText(checked.body).includes("[1]"), false);

  const missing = checkAgainstSources(drafted.body, [
    { url: "https://finance.yahoo.com/quote/BTC-USD", text: "Bitcoin was discussed. Eastern Time." },
  ]);
  assert.equal(missing.ok, false);

  const broken = verifiedReply("Bitcoin is $ . [1]", ["https://finance.yahoo.com/quote/BTC-USD"]);
  assert.equal(broken.ok, true);
  if (!broken.ok) return;
  const unread = checkAgainstSources(broken.body, [
    { url: "https://finance.yahoo.com/quote/BTC-USD", text: "67234.50" },
  ]);
  assert.equal(unread.ok, false);
});


