import assert from "node:assert/strict";
import test from "node:test";
import { isNewsQuery, presentNews, spokenText, verifiedReply } from "./live.ts";
import { isWeatherQuery, presentWeather, weatherPlace, NAME_A_CITY } from "./weather.ts";

test("weather uses a named city and the feed's own temperature and zone", () => {
  assert.equal(isWeatherQuery("What is the weather in Boston today?"), true);
  assert.equal(weatherPlace("What is the weather in Boston today?"), "Boston");
  assert.equal(weatherPlace("What is the weather?"), null);
  assert.equal(NAME_A_CITY.includes("http"), false);
  const shown = presentWeather({
    name: "Boston",
    region: "Massachusetts",
    payload: {
      timezone: "America/New_York",
      current: { time: "2026-11-03T14:05", temperature_2m: 55.2, weather_code: 3 },
    },
  });
  assert.equal(shown.ok, true);
  if (!shown.ok) return;
  assert.match(shown.body, /Boston, Massachusetts at 55\.2°F and overcast/);
  assert.match(shown.body, /2:05 p\.m\. America\/New_York/);
  assert.match(shown.body, /not a live station reading/);
  assert.equal(shown.sources[0]?.url, "https://open-meteo.com/");
  assert.equal(spokenText(shown.body).includes("https://"), false);
  assert.equal(presentWeather({ name: "Boston", region: null, payload: { current: {} } }).ok, false);
});

test("news keeps only a page that was actually read", () => {
  assert.equal(isNewsQuery("What is the latest news about the port?"), true);
  const drafted = verifiedReply("The port reopened after the storm. Ships are moving again.", [
    "https://news.example/port",
    "https://r.jina.ai/https://empty.example/story",
  ]);
  assert.equal(drafted.ok, true);
  if (!drafted.ok) return;
  const shown = presentNews(drafted.body, [
    { url: "https://news.example/port", text: "The port reopened after the storm and ships are moving again this afternoon across the harbor." },
    { url: "https://empty.example/story", text: "" },
  ]);
  assert.equal(shown.ok, true);
  if (!shown.ok) return;
  assert.match(shown.body, /https:\/\/news\.example\/port/);
  assert.equal(shown.body.includes("empty.example"), false);
  assert.equal(shown.body.includes("r.jina.ai"), false);
  assert.equal(spokenText(shown.body).includes("https://"), false);
  const refused = presentNews(drafted.body, [{ url: "https://news.example/port", text: "short" }]);
  assert.equal(refused.ok, false);
});
