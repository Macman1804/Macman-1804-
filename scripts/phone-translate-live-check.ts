import { writeFileSync } from "node:fs";
import { runPhoneTurn } from "../src/lib/telephony/phone-translate-run.ts";

const key = process.env.XAI_API_KEY;
if (!key) {
  console.log(JSON.stringify({ ok: false, error: "no-key" }));
  process.exit(1);
}

function keepsNumber(text: string): boolean {
  return /7|siete|seven/i.test(text);
}

function silenceWav(): Uint8Array {
  const rate = 16000;
  const samples = 8000;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples * 2, 40);
  return new Uint8Array(data);
}

const started = Date.now() - 2000;
const english = await runPhoneTurn(
  {
    languageA: "en",
    languageB: "es",
    consentA: true,
    consentB: true,
    speaker: "a",
    text: "Maria said the train leaves at 7.",
    startedAt: started,
  },
  { apiKey: key },
);
const spanish = await runPhoneTurn(
  {
    languageA: "en",
    languageB: "es",
    consentA: true,
    consentB: true,
    speaker: "b",
    text: "María dijo que el tren sale a las 7.",
    startedAt: started,
  },
  { apiKey: key },
);
const silent = await runPhoneTurn(
  {
    languageA: "en",
    languageB: "es",
    consentA: true,
    consentB: true,
    speaker: "a",
    audio: silenceWav(),
    mime: "audio/wav",
    startedAt: started,
  },
  { apiKey: key },
);
const blocked = await runPhoneTurn(
  {
    languageA: "en",
    languageB: "es",
    consentA: false,
    consentB: false,
    speaker: "a",
    text: "This must not be translated.",
    startedAt: started,
  },
  { apiKey: key },
);

let roundTrip: { pass: boolean; heard?: string; error?: string } = { pass: false, error: "no-audio" };
if (english.audio && english.mime) {
  const heard = await runPhoneTurn(
    {
      languageA: "es",
      languageB: "en",
      consentA: true,
      consentB: true,
      speaker: "a",
      audio: english.audio,
      mime: english.mime,
      startedAt: started,
    },
    { apiKey: key },
  );
  roundTrip = {
    pass: Boolean(heard.ok && heard.translation && /train|maria|7|seven/i.test(heard.translation) && heard.stored === false),
    heard: heard.translation?.slice(0, 160),
    error: heard.ok ? undefined : heard.code,
  };
}

const report = {
  english: {
    pass: Boolean(english.ok && english.translation && keepsNumber(english.translation) && /tren|sale|maría|maria/i.test(english.translation) && english.stored === false && english.dialed === false && english.usage.estimatedCostUsd === null && (english.audio?.byteLength ?? 0) > 1000),
    preview: english.translation?.slice(0, 160) ?? english.notice,
    bytes: english.audio?.byteLength ?? 0,
    code: english.code,
  },
  spanish: {
    pass: Boolean(spanish.ok && spanish.translation && keepsNumber(spanish.translation) && /train|maria/i.test(spanish.translation) && spanish.nextSpeaker === "a" && spanish.transcript === null),
    preview: spanish.translation?.slice(0, 160) ?? spanish.notice,
    bytes: spanish.audio?.byteLength ?? 0,
  },
  silence: { pass: silent.translation === null && silent.code === "silence", code: silent.code },
  consent: { pass: blocked.code === "consent" && blocked.translation === null && blocked.usage.translateCalls === 0 },
  roundTrip,
};

const summary = {
  english: report.english.pass,
  spanish: report.spanish.pass,
  silence: report.silence.pass,
  consent: report.consent.pass,
  roundTrip: report.roundTrip.pass,
};
writeFileSync("/tmp/phone-translate-live-report.json", JSON.stringify({ summary, report }, null, 2));
console.log(JSON.stringify({ summary, report }, null, 2));
if (!summary.english || !summary.spanish || !summary.silence || !summary.consent) process.exit(1);
