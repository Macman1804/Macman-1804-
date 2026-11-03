import { writeFileSync } from "node:fs";
import { requestTranslation } from "../src/lib/translate/engine.ts";
import { TRANSLATE_LANGUAGES } from "../src/lib/translate/languages.ts";
import { synthesizeSpeech, transcribeAudio } from "../src/lib/translate/speech.ts";

const key = process.env.XAI_API_KEY;
if (!key) {
  console.log(JSON.stringify({ ok: false, error: "no-key" }));
  process.exit(1);
}

const english = "Maria said the train leaves at 7.";
const native: Record<string, string> = {
  en: english,
  es: "María dijo que el tren sale a las 7.",
  "es-MX": "María dijo que el tren sale a las 7.",
  fr: "Marie a dit que le train part à 7 heures.",
  de: "Maria sagte, der Zug fährt um 7 Uhr ab.",
  it: "Maria ha detto che il treno parte alle 7.",
  pt: "Maria disse que o trem sai às 7.",
  "pt-PT": "A Maria disse que o comboio parte às 7.",
  zh: "玛丽亚说火车7点开。",
  ja: "マリアは電車が7時に出ると言いました。",
  ko: "마리아는 기차가 7시에 떠난다고 말했습니다.",
  ru: "Мария сказала, что поезд отправляется в 7.",
  ar: "قالت ماريا إن القطار يغادر عند الساعة 7.",
  hi: "मारिया ने कहा कि ट्रेन 7 बजे छूटती है।",
  id: "Maria berkata kereta berangkat pukul 7.",
  tr: "Maria trenin saat 7'de kalkacağını söyledi.",
  vi: "Maria nói chuyến tàu khởi hành lúc 7 giờ.",
};

function keepsNumber(text: string): boolean {
  return /7|７|七|٧/.test(text) || /\b(seven|siete|sept|sette|sete|sieben|yedi|tujuh)\b/i.test(text);
}

function keepsName(text: string): boolean {
  return /maria|marie|maría|玛丽|玛丽亚|マリア|마리|мария|ماريا|मारिया/i.test(text);
}

async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await run(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: size }, () => worker()));
  return out;
}

const textJobs = TRANSLATE_LANGUAGES.filter((language) => language.code !== "en").flatMap((language) => [
  { direction: "to-english" as const, code: language.code, text: native[language.code] ?? english },
  { direction: "from-english" as const, code: language.code, text: english },
]);

const translations = await pool(textJobs, 4, async (job) => {
  const source = job.direction === "to-english" ? job.code : "en";
  const target = job.direction === "to-english" ? "en" : job.code;
  const result = await requestTranslation({ source, target, text: job.text }, { apiKey: key });
  if (!result.ok) return { ...job, pass: false, error: result.error };
  const same = result.translation.trim().toLowerCase() === job.text.trim().toLowerCase();
  const number = keepsNumber(result.translation);
  const name = keepsName(result.translation);
  const englishSense = target !== "en" || /train|leaves|maria/i.test(result.translation);
  const pass = !same && number && name && englishSense && !result.translation.includes("http");
  return {
    ...job,
    pass,
    confident: result.confident,
    number,
    name,
    same,
    preview: result.translation.slice(0, 140),
  };
});

const first = await requestTranslation({ source: "en", target: "es", text: "Hello, my name is Maria." }, { apiKey: key });
const second = first.ok
  ? await requestTranslation(
      {
        source: "es",
        target: "en",
        text: "Mucho gusto. El tren sale a las 7.",
        earlier: [{ original: "Hello, my name is Maria.", translation: first.translation }],
      },
      { apiKey: key },
    )
  : null;

const detected = await requestTranslation(
  { source: "auto", target: "en", text: "Hola, buenos días. ¿Dónde está la estación?" },
  { apiKey: key },
);

async function loadAudio(spoken: Awaited<ReturnType<typeof synthesizeSpeech>>): Promise<Uint8Array | null> {
  if (!spoken.ok) return null;
  if ("audio" in spoken) return spoken.audio;
  const res = await fetch(spoken.url);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

const speech: { code: string; pass: boolean; bytes?: number; heard?: string; error?: string; status?: number }[] = [];
for (const language of TRANSLATE_LANGUAGES) {
  const spoken = await synthesizeSpeech({ text: native[language.code] ?? "Maria 7", language: language.code }, { apiKey: key });
  if (!spoken.ok) {
    speech.push({ code: language.code, pass: false, error: spoken.error, status: spoken.status });
    continue;
  }
  const audio = await loadAudio(spoken);
  const bytes = audio?.byteLength ?? 0;
  if (language.code !== "en" && language.code !== "es") {
    speech.push({ code: language.code, pass: bytes > 1000, bytes });
    continue;
  }
  if (!audio) {
    speech.push({ code: language.code, pass: false, error: "no-audio" });
    continue;
  }
  const mime = "audio" in spoken ? spoken.mime || "audio/mpeg" : "audio/mpeg";
  const heard = await transcribeAudio({ audio, mime: mime.includes("mpeg") || mime.includes("mp3") ? "audio/mpeg" : mime, speechLanguage: language.code }, { apiKey: key });
  speech.push({
    code: language.code,
    pass: heard.ok && keepsNumber(heard.text) && /train|tren|maria|maría/i.test(heard.text),
    bytes,
    heard: heard.ok ? heard.text.slice(0, 160) : undefined,
    error: heard.ok ? undefined : heard.error,
    status: heard.ok ? undefined : heard.status,
  });
}

function silenceWav(): Uint8Array {
  const rate = 16000;
  const samples = 8000;
  const data = Buffer.alloc(44 + samples * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples * 2, 4);
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

const silent = await transcribeAudio({ audio: silenceWav(), mime: "audio/wav", speechLanguage: "en" }, { apiKey: key });

const report = {
  translations,
  conversation: {
    firstOk: first.ok,
    secondOk: Boolean(second?.ok),
    secondPass: Boolean(second?.ok && keepsNumber(second.translation) && /train|maria/i.test(second.translation) && !second.translation.includes("http")),
    preview: second?.ok ? second.translation.slice(0, 160) : null,
  },
  detect: {
    pass: Boolean(detected.ok && detected.detected === "es" && detected.confident && /station|where/i.test(detected.translation)),
    detected: detected.ok ? detected.detected : null,
    confident: detected.ok ? detected.confident : false,
    preview: detected.ok ? detected.translation.slice(0, 140) : detected.error,
  },
  speech,
  silence: {
    invented: silent.ok,
    error: silent.ok ? silent.text.slice(0, 80) : silent.error,
  },
};

const textPass = translations.filter((item) => item.pass).length;
const speechPass = speech.filter((item) => item.pass).length;
const summary = {
  text: `${textPass}/${translations.length}`,
  speech: `${speechPass}/${speech.length}`,
  conversation: report.conversation.secondPass,
  detect: report.detect.pass,
  silenceDidNotInvent: !silent.ok,
};
writeFileSync("/tmp/translator-live-report.json", JSON.stringify({ summary, report }, null, 2));
console.log(JSON.stringify({ summary, failures: {
  text: translations.filter((item) => !item.pass),
  speech: speech.filter((item) => !item.pass),
  conversation: report.conversation,
  detect: report.detect,
  silence: report.silence,
} }, null, 2));
