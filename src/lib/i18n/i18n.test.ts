import assert from "node:assert/strict";
import test from "node:test";
import { copy } from "./catalog.ts";
import { parseLang } from "./language.ts";
import { askedSymbol } from "../research/quote.ts";
import { askedLeague } from "../research/sports.ts";
import { weatherPlace } from "../search/weather.ts";
import { calendarReply } from "../voice/calendar.ts";
import { parlay } from "../research/bets.ts";
import { needsLiveLookup, isNewsQuery } from "../search/live.ts";
import { publicError } from "../security/public-error.ts";

test("both languages expose the same controls", () => {
  assert.deepEqual(Object.keys(copy("en")).sort(), Object.keys(copy("es")).sort());
  assert.equal(parseLang("es"), "es");
  assert.equal(parseLang("nope"), "en");
  assert.equal(copy("es").signIn, "Entrar");
  assert.equal(copy("es").privateDesk, "Un escritorio privado");
  assert.equal(copy("es").practiceDesk, "Practicar en el escritorio");
});

test("Spanish questions reach weather and news without leaving private facts on the web", () => {
  assert.equal(needsLiveLookup("¿Qué clima hace en Madrid?"), true);
  assert.equal(needsLiveLookup("¿Cuáles son las noticias de hoy?"), true);
  assert.equal(isNewsQuery("noticias de hoy"), true);
  assert.equal(needsLiveLookup("La bicicleta se llama Piloto."), false);
  assert.equal(
    publicError("Invalid login credentials", "No.", "es"),
    "Ese correo o esa contraseña no son correctos.",
  );
  assert.equal(publicError("Invalid login credentials", "No."), "That email or password is not right.");
});

test("a Spanish question still reaches the verified feeds", () => {
  assert.equal(askedSymbol("¿Cuál es el precio de AAPL?"), "AAPL");
  assert.equal(askedLeague("¿Cuál es el marcador de la NFL?"), "nfl");
  assert.equal(weatherPlace("¿Qué clima hace en Boston?"), "Boston");
  const day = calendarReply("¿Qué fecha es hoy?", new Date("2026-11-03T18:00:00Z"), "UTC", "es");
  assert.match(day ?? "", /^Hoy es /);
  const slip = parlay({ legs: [-110, -110], stake: 10, sameGame: true, lang: "es" });
  assert.equal(slip.ok, true);
  if (slip.ok) {
    assert.match(slip.text, /correlacionadas/);
    assert.equal(slip.text.includes("https://"), false);
  }
});
