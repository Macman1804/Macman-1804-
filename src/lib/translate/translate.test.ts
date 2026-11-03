import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { requestTranslation } from "./engine.ts";
import { sttCode, swapLanguages, ttsCode } from "./languages.ts";
import { detectLanguage, formatShare, historyStorageKey, packSavedTurns, parseTranslation, readSavedTurns, translationInstructions } from "./parse.ts";
import { synthesizeSpeech, transcribeAudio } from "./speech.ts";
import { canSaveTranslation, directionFor, micBlocked } from "./talk.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

test("english and spanish are detected only when the line is clear", () => {
  assert.equal(detectLanguage("Hello, where is the train station?").code, "en");
  assert.equal(detectLanguage("Hello, where is the train station?").confident, true);
  assert.equal(detectLanguage("Hola, buenos días. ¿Dónde está la estación?").code, "es");
  assert.equal(detectLanguage("ok").confident, false);
  assert.equal(detectLanguage("1234 Main").confident, false);
});

test("a translation without the confidence line is refused", () => {
  assert.equal(parseTranslation("Hola, buenos días."), null);
  const clear = parseTranslation("CONFIDENT: yes\nHola, buenos días.");
  assert.equal(clear?.confident, true);
  assert.equal(clear?.text, "Hola, buenos días.");
  const unsure = parseTranslation("CONFIDENT: no\nHola");
  assert.equal(unsure?.confident, false);
  assert.equal(parseTranslation("CONFIDENT: yes\n")?.text, "");
});

test("empty speech is not sent to the model and a same language is refused", async () => {
  let called = 0;
  const fetchImpl: typeof fetch = async () => {
    called += 1;
    return new Response("no");
  };
  const empty = await requestTranslation({ source: "en", target: "es", text: "   " }, { apiKey: "test", fetchImpl });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error, "empty");
  const same = await requestTranslation({ source: "en", target: "en", text: "Hello" }, { apiKey: "test", fetchImpl });
  assert.equal(same.ok, false);
  if (!same.ok) assert.equal(same.error, "same");
  assert.equal(called, 0);
});

test("the model sees the line and not a desk memory", async () => {
  let body = "";
  const fetchImpl: typeof fetch = async (_url, init) => {
    body = String(init?.body ?? "");
    return Response.json({
      choices: [{ message: { content: "CONFIDENT: yes\nBuenos días. El tren sale a las 7." } }],
    });
  };
  const result = await requestTranslation(
    { source: "en", target: "es", text: "Good morning. The train leaves at 7.", earlier: [{ original: "Hello", translation: "Hola" }] },
    { apiKey: "test-key", fetchImpl },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.translation, /tren/);
    assert.equal(result.translation.includes("7"), true);
    assert.equal(result.confident, true);
  }
  assert.match(body, /Good morning/);
  assert.equal(body.includes("Saved memories"), false);
  assert.equal(body.includes("MEMORY:"), false);
  assert.equal(body.includes("test-key"), false);
  assert.match(translationInstructions("English", "Español"), /Do not invent words/);
});

test("a clear line can be detected and translated", async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json({
      choices: [{ message: { content: "CONFIDENT: yes\nHola, ¿dónde está la estación de tren?" } }],
    });
  const result = await requestTranslation(
    { source: "auto", target: "es", text: "Hello, where is the train station?" },
    { apiKey: "test", fetchImpl },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.detected, "en");
    assert.equal(result.confident, true);
    assert.match(result.translation, /estación/);
  }
});

test("an uncertain detection stays labeled uncertain", async () => {
  const fetchImpl: typeof fetch = async () =>
    Response.json({ choices: [{ message: { content: "CONFIDENT: yes\nBonjour" } }] });
  const result = await requestTranslation({ source: "auto", target: "en", text: "Bonjour" }, { apiKey: "test", fetchImpl });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.confident, false);
    assert.equal(result.detected, null);
  }
});

test("speech codes and a swap stay inside the supported list", () => {
  assert.equal(ttsCode("es"), "es-ES");
  assert.equal(ttsCode("es-MX"), "es-MX");
  assert.equal(ttsCode("en"), "en");
  assert.equal(ttsCode("nope"), null);
  assert.equal(sttCode("auto"), null);
  assert.equal(sttCode("pt-PT"), "pt");
  assert.deepEqual(swapLanguages("en", "es"), { source: "es", target: "en" });
  assert.deepEqual(swapLanguages("auto", "es"), { source: "es", target: "en" });
});

test("a saved translation belongs to one account on this device", () => {
  assert.equal(historyStorageKey("not-a-user"), null);
  assert.notEqual(historyStorageKey(USER_A), historyStorageKey(USER_B));
  const packed = packSavedTurns(USER_A, [
    {
      id: "t1",
      at: "2026-11-03T00:00:00.000Z",
      source: "en",
      target: "es",
      original: "The bicycle is named Pilot.",
      translation: "La bicicleta se llama Pilot.",
      uncertain: false,
    },
  ]);
  const store = new Map<string, string>();
  store.set(historyStorageKey(USER_A) ?? "", packed ?? "");
  assert.equal(readSavedTurns(store.get(historyStorageKey(USER_B) ?? "") ?? null).length, 0);
  const own = readSavedTurns(store.get(historyStorageKey(USER_A) ?? "") ?? null);
  assert.equal(own[0]?.translation.includes("Pilot"), true);
  assert.equal(readSavedTurns("{").length, 0);
});

test("the translator route does not write desk memory", () => {
  const source = readFileSync(new URL("../translate.functions.ts", import.meta.url), "utf8");
  assert.equal(source.includes("writeMemory"), false);
  assert.equal(source.includes("listMemories"), false);
  assert.equal(source.includes("insertLine"), false);
});

test("two people take turns and a second microphone stays closed", () => {
  assert.deepEqual(directionFor("a", "en", "es", "en", "es"), { from: "en", to: "es", next: "b" });
  assert.deepEqual(directionFor("b", "en", "es", "en", "es"), { from: "es", to: "en", next: "a" });
  assert.deepEqual(directionFor("text", "en", "es", "fr", "de"), { from: "fr", to: "de", next: null });
  assert.equal(micBlocked("a", "b"), true);
  assert.equal(micBlocked("a", "a"), false);
  assert.equal(micBlocked(null, "b"), false);
  assert.equal(canSaveTranslation(false, 2), false);
  assert.equal(canSaveTranslation(true, 0), false);
  assert.equal(canSaveTranslation(true, 1), true);
});

test("copy text keeps both sides and does not add a link", () => {
  const shared = formatShare(
    { source: "en", target: "es", detected: null, original: "The train leaves at 7.", translation: "El tren sale a las 7." },
    { original: "Original", translation: "Translation" },
  );
  assert.match(shared, /train leaves at 7/);
  assert.match(shared, /El tren sale a las 7/);
  assert.equal(shared.includes("http"), false);
});

test("a failed speech endpoint does not invent a line", async () => {
  const fetchImpl: typeof fetch = async () => new Response("no", { status: 500 });
  const spoken = await synthesizeSpeech({ text: "Hello", language: "en" }, { apiKey: "test", fetchImpl });
  assert.equal(spoken.ok, false);
  const heard = await transcribeAudio(
    { audio: Uint8Array.from([1, 2, 3, 4]), mime: "audio/wav", speechLanguage: "es" },
    { apiKey: "test", fetchImpl },
  );
  assert.equal(heard.ok, false);
  const quiet = await transcribeAudio(
    { audio: Uint8Array.from([1, 2, 3, 4]), mime: "audio/wav", speechLanguage: "nope" },
    { apiKey: "test", fetchImpl },
  );
  assert.equal(quiet.ok, false);
  if (!quiet.ok) assert.equal(quiet.error, "unsupported");
});

test("an API failure and an oversized line are refused", async () => {
  const down: typeof fetch = async () => {
    throw new Error("network");
  };
  const failed = await requestTranslation({ source: "en", target: "es", text: "Hello there" }, { apiKey: "test", fetchImpl: down });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.error, "failed");
  const missing = await requestTranslation({ source: "en", target: "es", text: "Hello there" }, {});
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, "unavailable");
  const long = await requestTranslation({ source: "en", target: "es", text: "a".repeat(2001) }, { apiKey: "test" });
  assert.equal(long.ok, false);
  if (!long.ok) assert.equal(long.error, "short");
});

