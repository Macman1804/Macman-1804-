import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Languages, Mic, Square } from "lucide-react";
import { useMacmanSession } from "@/components/account-gate";
import { useI18n } from "@/lib/i18n/provider";
import type { Copy } from "@/lib/i18n/catalog";
import { publicError } from "@/lib/security/public-error";
import { speakTranslation, transcribeTranslation, translateLine } from "@/lib/translate.functions";
import {
  CORE_LANGUAGES,
  TRANSLATE_LANGUAGES,
  languageName,
  sameLanguage,
  swapLanguages,
  ttsCode,
  type TranslateCode,
} from "@/lib/translate/languages";
import { historyStorageKey, packSavedTurns, readSavedTurns, formatShare, type SavedTurn } from "@/lib/translate/parse";
import { directionFor, micBlocked, canSaveTranslation, type Speaker } from "@/lib/translate/talk";
import { MIN_BYTES } from "@/lib/voice/utterance";

type Mode = "text" | "talk";

type Turn = SavedTurn & { detected: string | null; audio: string | null };

function failNote(code: string, t: Copy): string {
  if (code === "pace") return t.paceWait;
  if (code === "unavailable") return t.translateOff;
  if (code === "empty") return t.notClear;
  if (code === "same") return t.sameLanguage;
  if (code === "quiet") return t.speechQuiet;
  if (code === "short") return t.translateFailed;
  return t.translateFailed;
}

function recorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").slice(String(reader.result ?? "").indexOf(",") + 1));
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.readAsDataURL(blob);
  });
}

function shareBody(turn: Turn, t: Copy): string {
  return formatShare(turn, { original: t.originalLabel, translation: t.translationLabel });
}

export function TranslatorDesk({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const account = useMacmanSession();
  const userId = account.session?.user.id ?? "";
  const [mode, setMode] = useState<Mode>("text");
  const [source, setSource] = useState("en");
  const [target, setTarget] = useState("es");
  const [personA, setPersonA] = useState("en");
  const [personB, setPersonB] = useState("es");
  const [touched, setTouched] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [saved, setSaved] = useState<SavedTurn[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<Speaker | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [turn, setTurn] = useState<"a" | "b">("a");
  const [note, setNote] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  useEffect(() => {
    if (touched) return;
    const mine = lang === "es" ? "es" : "en";
    const other = mine === "es" ? "en" : "es";
    setSource(mine);
    setTarget(other);
    setPersonA(mine);
    setPersonB(other);
  }, [lang, touched]);

  useEffect(() => {
    const key = historyStorageKey(userId);
    if (!key) return;
    setSaved(readSavedTurns(window.localStorage.getItem(key)));
  }, [userId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      audioRef.current?.pause();
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(null);
  }

  async function play(id: string, src: string) {
    stopAudio();
    const audio = new Audio(src);
    audioRef.current = audio;
    setSpeaking(id);
    await new Promise<void>((resolve) => {
      const done = () => {
        if (audioRef.current === audio) setSpeaking(null);
        resolve();
      };
      audio.onended = done;
      audio.onpause = done;
      void audio.play().catch(() => {
        setNote(t.speechQuiet);
        done();
      });
    });
  }

  async function speak(id: string, text: string, language: string, existing: string | null) {
    if (existing) {
      await play(id, existing);
      return existing;
    }
    if (!ttsCode(language)) {
      setNote(t.speechQuiet);
      return null;
    }
    setBusy(true);
    try {
      const result = await speakTranslation({ data: { text, language } });
      if (!result.ok) {
        setNote(failNote(result.error, t));
        return null;
      }
      const src = "url" in result && result.url ? result.url : `data:audio/mpeg;base64,${result.audio}`;
      setTurns((current) => current.map((item) => (item.id === id ? { ...item, audio: src } : item)));
      await play(id, src);
      return src;
    } catch (error) {
      setNote(publicError(error instanceof Error ? error.message : "", t.translateFailed, lang));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function translate(text: string, from: string, to: string, nextTurn: "a" | "b" | null) {
    if (sameLanguage(from, to)) {
      setNote(t.sameLanguage);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const earlier = turnsRef.current.slice(-4).map((item) => ({ original: item.original, translation: item.translation }));
      const result = await translateLine({ data: { source: from, target: to, text, earlier } });
      if (!result.ok) {
        setNote(failNote(result.error, t));
        return;
      }
      const id = crypto.randomUUID();
      const item: Turn = {
        id,
        at: new Date().toISOString(),
        source: from,
        target: to,
        original: text,
        translation: result.translation,
        uncertain: !result.confident,
        detected: result.detected,
        audio: null,
      };
      setTurns((current) => [...current, item].slice(-20));
      if (nextTurn) setTurn(nextTurn);
      setBusy(false);
      await speak(id, result.translation, to, null);
    } catch (error) {
      setNote(publicError(error instanceof Error ? error.message : "", t.translateFailed, lang));
    } finally {
      setBusy(false);
    }
  }

  function stopTimer() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  async function finishRecording(blob: Blob, speaker: Speaker) {
    if (blob.size < MIN_BYTES) {
      setNote(t.notClear);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const audio = await blobToBase64(blob);
      const heard = await transcribeTranslation({
        data: { audio, mime: blob.type || "audio/webm", speechLanguage: directionFor(speaker, personA, personB, source, target).from },
      });
      if (!heard.ok) {
        setNote(failNote(heard.error, t));
        return;
      }
      if (!heard.text.trim()) {
        setNote(t.notClear);
        return;
      }
      const way = directionFor(speaker, personA, personB, source, target);
      await translate(heard.text, way.from, way.to, way.next);
    } catch (error) {
      setNote(publicError(error instanceof Error ? error.message : "", t.translateFailed, lang));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic(speaker: Speaker) {
    if (busy) return;
    if (recording) {
      stopTimer();
      recorderRef.current?.stop();
      return;
    }
    stopAudio();
    if (typeof MediaRecorder === "undefined") {
      setNote(t.noRecorder);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = recorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || "audio/webm" });
        chunksRef.current = [];
        setRecording(null);
        void finishRecording(blob, speaker);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(speaker);
      setNote(t.recordingNow);
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 20000);
    } catch {
      setNote(t.micDenied);
    }
  }

  async function copyTurn(item: Turn) {
    try {
      await navigator.clipboard.writeText(shareBody(item, t));
      setNote(t.copied);
    } catch {
      setNote(t.translateFailed);
    }
  }

  async function shareTurn(item: Turn) {
    const text = shareBody(item, t);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        setNote(t.sharedDone);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote(t.shareCopied);
    } catch {
      setNote(t.translateFailed);
    }
  }

  function saveConversation() {
    const key = historyStorageKey(userId);
    const packed = packSavedTurns(
      userId,
      turns.map(({ detected: _detected, audio: _audio, ...item }) => item),
    );
    if (!consent || !key || !packed) return;
    window.localStorage.setItem(key, packed);
    setSaved(readSavedTurns(packed));
    setNote(t.savedDevice);
  }

  function clearSaved() {
    const key = historyStorageKey(userId);
    if (key) window.localStorage.removeItem(key);
    setSaved([]);
  }

  const choices = expanded ? TRANSLATE_LANGUAGES : CORE_LANGUAGES;

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-10">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm text-mute">
        {t.desk}
      </button>
      <p className="mt-4 text-xs font-medium tracking-widest text-copper uppercase">{t.translator}</p>
      <h1 className="mt-3 flex items-center gap-3 font-serif text-4xl text-cream">
        <Languages className="size-8 text-copper" strokeWidth={1.75} />
        {t.translatorTitle}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-mute">{t.translatorIntro}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={mode === "text"}
          onClick={() => setMode("text")}
          className={"min-h-12 rounded-full text-sm " + (mode === "text" ? "bg-copper text-ink" : "border border-edge text-cream")}
        >
          {t.textMode}
        </button>
        <button
          type="button"
          aria-pressed={mode === "talk"}
          onClick={() => setMode("talk")}
          className={"min-h-12 rounded-full text-sm " + (mode === "talk" ? "bg-copper text-ink" : "border border-edge text-cream")}
        >
          {t.talkMode}
        </button>
      </div>

      {mode === "text" ? (
        <div className="mt-5 flex flex-col gap-3">
          <LanguageField
            id="from-language"
            label={t.fromLanguage}
            value={source}
            allowAuto
            choices={choices}
            autoLabel={t.detectLanguage}
            onChange={(value) => {
              setTouched(true);
              setSource(value);
            }}
          />
          <button
            type="button"
            aria-label={t.swapLanguages}
            onClick={() => {
              setTouched(true);
              const next = swapLanguages(source, target);
              setSource(next.source);
              setTarget(next.target);
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full border border-copper px-4 text-sm text-copper"
          >
            <ArrowLeftRight className="size-4" />
            {t.swapLanguages}
          </button>
          <LanguageField
            id="to-language"
            label={t.toLanguage}
            value={target}
            choices={choices}
            onChange={(value) => {
              setTouched(true);
              setTarget(value);
            }}
          />
          <button type="button" onClick={() => setExpanded((value) => !value)} className="min-h-11 self-start text-sm text-copper">
            {expanded ? t.fewerLanguages : t.moreLanguages}
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            maxLength={2000}
            className="min-h-28 w-full resize-none rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || recording !== null || !draft.trim()}
              onClick={() => {
                const text = draft.trim();
                if (!text) return;
                setDraft("");
                void translate(text, source, target, null);
              }}
              className="min-h-12 rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
            >
              {busy ? t.translating : t.translate}
            </button>
            <button
              type="button"
              disabled={(busy && recording !== "text") || micBlocked(recording, "text")}
              onClick={() => void toggleMic("text")}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-copper text-base text-copper disabled:opacity-50"
            >
              {recording === "text" ? <Square className="size-4" /> : <Mic className="size-4" />}
              {recording === "text" ? t.stopAndTranslate : t.speakLine}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-mute">{t.notSimultaneous}</p>
          <PersonCard
            title={t.personA}
            active={turn === "a"}
            turnLabel={t.yourTurn}
            value={personA}
            choices={choices}
            recording={recording === "a"}
            busy={busy}
            onChange={(value) => {
              setTouched(true);
              setPersonA(value);
            }}
            onMic={() => void toggleMic("a")}
            blocked={micBlocked(recording, "a")}
            tapLabel={t.tapToSpeak}
            stopLabel={t.stopAndTranslate}
          />
          <button
            type="button"
            aria-label={t.swapLanguages}
            onClick={() => {
              setTouched(true);
              setPersonA(personB);
              setPersonB(personA);
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-full border border-copper px-4 text-sm text-copper"
          >
            <ArrowLeftRight className="size-4" />
            {t.swapLanguages}
          </button>
          <PersonCard
            title={t.personB}
            active={turn === "b"}
            turnLabel={t.yourTurn}
            value={personB}
            choices={choices}
            recording={recording === "b"}
            busy={busy}
            onChange={(value) => {
              setTouched(true);
              setPersonB(value);
            }}
            onMic={() => void toggleMic("b")}
            blocked={micBlocked(recording, "b")}
            tapLabel={t.tapToSpeak}
            stopLabel={t.stopAndTranslate}
          />
          <button type="button" onClick={() => setExpanded((value) => !value)} className="min-h-11 self-start text-sm text-copper">
            {expanded ? t.fewerLanguages : t.moreLanguages}
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder={turn === "a" ? t.personA : t.personB}
            className="min-h-16 w-full resize-none rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none placeholder:text-mute"
          />
          <button
            type="button"
            disabled={busy || recording !== null || !draft.trim()}
            onClick={() => {
              const text = draft.trim();
              if (!text) return;
              setDraft("");
              const way = directionFor(turn, personA, personB, personA, personB);
              void translate(text, way.from, way.to, way.next);
            }}
            className="min-h-12 rounded-full border border-copper text-base text-copper disabled:opacity-50"
          >
            {busy ? t.translating : t.translate}
          </button>
        </div>
      )}

      {note ? <p className="mt-4 text-sm leading-relaxed text-copper">{note}</p> : null}

      <div className="mt-6 flex flex-col gap-4">
        {[...turns].reverse().map((item) => (
          <article key={item.id} className="rounded-3xl border border-edge bg-card px-4 py-4">
            <p className="text-xs tracking-widest text-copper uppercase">{t.originalLabel}</p>
            {item.source === "auto" && item.detected ? (
              <p className="mt-1 text-xs text-mute">
                {t.detectedAs}: {languageName(item.detected)}
              </p>
            ) : null}
            <p className="mt-2 text-base leading-relaxed text-cream">{item.original}</p>
            <p className="mt-4 text-xs tracking-widest text-copper uppercase">{t.translationLabel}</p>
            <p className="mt-2 text-base leading-relaxed text-cream">{item.translation}</p>
            {item.uncertain ? <p className="mt-2 text-sm text-copper">{t.uncertain}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy && speaking !== item.id}
                onClick={() => {
                  if (speaking === item.id) {
                    stopAudio();
                    return;
                  }
                  void speak(item.id, item.translation, item.target, item.audio);
                }}
                className="min-h-11 rounded-full border border-copper px-4 text-sm text-copper disabled:opacity-50"
              >
                {speaking === item.id ? t.stopSpeak : item.audio ? t.replay : t.speakTranslation}
              </button>
              <button type="button" onClick={() => void copyTurn(item)} className="min-h-11 rounded-full border border-edge px-4 text-sm text-cream">
                {t.copyText}
              </button>
              <button type="button" onClick={() => void shareTurn(item)} className="min-h-11 rounded-full border border-edge px-4 text-sm text-cream">
                {t.shareText}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed text-cream">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4" />
          {t.saveDevice}
        </label>
        <p className="text-sm leading-relaxed text-mute">{t.saveHelp}</p>
        <button
          type="button"
          disabled={!canSaveTranslation(consent, turns.length)}
          onClick={saveConversation}
          className="min-h-12 rounded-full border border-copper text-base text-copper disabled:opacity-50"
        >
          {t.saveNow}
        </button>
        {saved.length > 0 ? (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs tracking-widest text-copper uppercase">{t.savedHeading}</p>
              <button type="button" onClick={clearSaved} className="min-h-11 text-sm text-mute">
                {t.clearSaved}
              </button>
            </div>
            {saved.map((item) => (
              <p key={item.id} className="mt-3 text-sm leading-relaxed text-mute">
                {item.original} — {item.translation}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LanguageField({
  id,
  label,
  value,
  choices,
  allowAuto = false,
  autoLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  choices: readonly { code: string; name: string }[];
  allowAuto?: boolean;
  autoLabel?: string;
  onChange: (value: string) => void;
}) {
  const extra = choices.some((item) => item.code === value) || value === "auto" ? [] : TRANSLATE_LANGUAGES.filter((item) => item.code === value);
  return (
    <label className="text-sm text-mute" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-12 w-full rounded-2xl border border-edge bg-card px-4 text-base text-cream"
      >
        {allowAuto ? <option value="auto">{autoLabel}</option> : null}
        {[...extra, ...choices].map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PersonCard({
  title,
  active,
  turnLabel,
  value,
  choices,
  recording,
  blocked,
  busy,
  onChange,
  onMic,
  tapLabel,
  stopLabel,
}: {
  title: string;
  active: boolean;
  turnLabel: string;
  value: string;
  choices: readonly { code: TranslateCode; name: string }[];
  recording: boolean;
  blocked: boolean;
  busy: boolean;
  onChange: (value: string) => void;
  onMic: () => void;
  tapLabel: string;
  stopLabel: string;
}) {
  return (
    <div className={"rounded-3xl border px-4 py-4 " + (active ? "border-copper bg-card" : "border-edge bg-card")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-medium text-cream">{title}</p>
        {active ? <p className="text-xs tracking-widest text-copper uppercase">{turnLabel}</p> : null}
      </div>
      <label className="mt-3 block text-sm text-mute">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 min-h-12 w-full rounded-2xl border border-edge bg-ink px-4 text-base text-cream"
        >
          {choices.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
          {choices.some((item) => item.code === value) ? null : <option value={value}>{languageName(value)}</option>}
        </select>
      </label>
      <button
        type="button"
        disabled={blocked || (busy && !recording)}
        onClick={onMic}
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
      >
        {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
        {recording ? stopLabel : tapLabel}
      </button>
    </div>
  );
}
