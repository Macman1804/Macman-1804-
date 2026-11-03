import assert from "node:assert/strict";
import test from "node:test";
import { needsLiveLookup, parseSearchPayload, searchQuery, spokenText, verifiedReply } from "./live.ts";

test("a private question stays off the web and a current one does not", () => {
  assert.equal(needsLiveLookup("The bicycle is named Pilot."), false);
  assert.equal(needsLiveLookup("What is today's date?"), false);
  assert.equal(needsLiveLookup("What is the weather in Boston today?"), true);
  assert.equal(needsLiveLookup("What is the latest news about the port?"), true);
  assert.equal(needsLiveLookup("What is the price of copper right now?"), true);
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
