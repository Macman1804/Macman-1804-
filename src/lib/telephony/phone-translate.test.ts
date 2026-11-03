import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runPhoneTurn } from "./phone-translate-run.ts";
import { beginTurn, callDuration, consentNotice, translatorTwiml } from "./phone-translate.ts";

const now = 1_700_000_000_000;

function turn(overrides: Partial<Parameters<typeof beginTurn>[0]> = {}) {
  return beginTurn({
    languageA: "en",
    languageB: "es",
    consentA: true,
    consentB: true,
    speaker: "a",
    text: "The train leaves at 7.",
    audioBytes: 0,
    overlap: false,
    interrupt: false,
    startedAt: now - 1000,
    now,
    ...overrides,
  });
}

test("a translated turn waits for two languages and both agreements", () => {
  const missing = turn({ consentA: false, consentB: false, text: "Hello" });
  assert.equal(missing.proceed, false);
  assert.equal(missing.code, "consent");
  assert.match(missing.notice, /AI translation/);
  assert.match(missing.notice, /traducción con IA/);
  assert.equal(turn({ languageA: "en", languageB: "en" }).code, "same");
  assert.equal(turn({ languageA: "nope", languageB: "es" }).code, "unsupported");
  assert.equal(consentNotice("en", "en").includes("\n"), false);
});

test("silence, overlap, and an interruption are not translated", () => {
  assert.equal(turn({ text: "   ", audioBytes: 0 }).code, "silence");
  assert.equal(turn({ text: "", audioBytes: 2499 }).code, "silence");
  assert.equal(turn({ text: "", audioBytes: 2500 }).needsStt, true);
  assert.equal(turn({ overlap: true }).proceed, false);
  assert.equal(turn({ overlap: true }).code, "overlap");
  assert.equal(turn({ interrupt: true }).code, "interrupt");
  assert.equal(turn({ speaker: "b", text: "" }).notice.includes("No se oyó nada"), true);
});

test("duration is counted and a price is never invented", () => {
  assert.equal(callDuration(now - 1500, now), 1500);
  assert.equal(callDuration(now + 10, now), 0);
  assert.equal(callDuration(null, now), 0);
  assert.equal(callDuration(now - 5 * 60 * 60 * 1000, now), 0);
  assert.equal(turn().durationMs, 1000);
});

test("prepared telephone speech does not record, dial, or use an open address", () => {
  const ready = translatorTwiml({
    say: `5 < 7 & "ok"`,
    sayLanguage: "es",
    gather: true,
    actionUrl: "https://example.com/api/twilio/voice",
  });
  const escaped = "5 " + "&" + "lt; 7 " + "&" + "amp; " + "&" + "quot;ok" + "&" + "quot;";
  assert.match(ready.xml ?? "", new RegExp(`<Say language="es-ES">${escaped}</Say>`));
  assert.match(ready.xml ?? "", /<Gather input="speech"/);
  assert.equal((ready.xml ?? "").includes("<Record"), false);
  assert.equal((ready.xml ?? "").includes("<Dial"), false);
  assert.equal(translatorTwiml({ say: "Hello", sayLanguage: "en", gather: true, actionUrl: "http://example.com" }).xml, null);
  assert.equal(translatorTwiml({ say: "Bonjour", sayLanguage: "fr" }).xml, null);
  assert.equal(translatorTwiml({ say: "Hello", sayLanguage: "en", playUrl: "http://cdn.example/a.mp3" }).xml, null);
});

test("a simulated turn speaks the translation and stores nothing", async () => {
  let tts = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/chat/completions")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "CONFIDENT: yes\nEl tren sale a las 7." } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/tts")) {
      tts += 1;
      return new Response(new Uint8Array(64), { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    return new Response("no", { status: 500 });
  };
  const result = await runPhoneTurn(
    { languageA: "en", languageB: "es", consentA: true, consentB: true, speaker: "a", text: "The train leaves at 7.", startedAt: now - 1000, now },
    { apiKey: "test", fetchImpl },
  );
  assert.equal(result.ok, true);
  assert.equal(result.live, "off");
  assert.equal(result.dialed, false);
  assert.equal(result.stored, false);
  assert.equal(result.recording, null);
  assert.equal(result.transcript, null);
  assert.equal(result.translation, "El tren sale a las 7.");
  assert.equal(result.nextSpeaker, "b");
  assert.equal(result.audio?.byteLength, 64);
  assert.equal(result.usage.sttCalls, 0);
  assert.equal(result.usage.translateCalls, 1);
  assert.equal(result.usage.ttsCalls, 1);
  assert.equal(result.usage.characters, "El tren sale a las 7.".length);
  assert.equal(result.usage.estimatedCostUsd, null);
  assert.equal(tts, 1);
});

test("a failed translation is not spoken and silence is not invented", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    calls += 1;
    const url = String(input);
    if (url.includes("/stt")) {
      return new Response(JSON.stringify({ text: "" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("no", { status: 500 });
  };
  const refused = await runPhoneTurn(
    { languageA: "en", languageB: "es", consentA: false, consentB: true, speaker: "a", text: "Hello", now },
    { apiKey: "test", fetchImpl },
  );
  assert.equal(refused.code, "consent");
  assert.equal(refused.translation, null);
  const failed = await runPhoneTurn(
    { languageA: "fr", languageB: "en", consentA: true, consentB: true, speaker: "a", text: "Marie 7", now },
    { apiKey: "test", fetchImpl },
  );
  assert.equal(failed.code, "failed");
  assert.equal(failed.translation, null);
  assert.equal(failed.usage.translateCalls, 1);
  assert.equal(failed.usage.ttsCalls, 0);
  const silent = await runPhoneTurn(
    {
      languageA: "en",
      languageB: "es",
      consentA: true,
      consentB: true,
      speaker: "b",
      audio: new Uint8Array(2500),
      mime: "audio/wav",
      now,
    },
    { apiKey: "test", fetchImpl },
  );
  assert.equal(silent.code, "silence");
  assert.equal(silent.translation, null);
  assert.equal(silent.usage.sttCalls, 1);
  assert.equal(silent.usage.translateCalls, 0);
  assert.equal(calls, 2);
});

test("the live voice route still refuses, and this practice does not write a memory", () => {
  const route = readFileSync(new URL("../../routes/api/twilio/voice.ts", import.meta.url), "utf8");
  const source = readFileSync(new URL("./phone-translate.functions.ts", import.meta.url), "utf8");
  assert.match(route, /handleInboundVoice/);
  assert.equal(route.includes("translatorTwiml"), false);
  assert.equal(source.includes("writeMemory"), false);
  assert.equal(source.includes("insertLine"), false);
  assert.equal(source.includes("api.twilio.com"), false);
});
