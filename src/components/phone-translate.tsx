import { useRef, useState } from "react";
import { CORE_LANGUAGES, TRANSLATE_LANGUAGES } from "@/lib/translate/languages";
import { practicePhoneTranslation } from "@/lib/telephony/phone-translate.functions";
import { useI18n } from "@/lib/i18n/provider";

type Speaker = "a" | "b";

export function PhoneTranslate() {
  const { t } = useI18n();
  const [more, setMore] = useState(false);
  const [languageA, setLanguageA] = useState("en");
  const [languageB, setLanguageB] = useState("es");
  const [consent, setConsent] = useState(false);
  const [speaker, setSpeaker] = useState<Speaker>("a");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const started = useRef<number | null>(null);
  const languages = more ? TRANSLATE_LANGUAGES : CORE_LANGUAGES;

  async function play(audio: string | null, mime: string | null) {
    if (!audio) return;
    const source = audio.startsWith("http") ? audio : URL.createObjectURL(new Blob([Uint8Array.from(atob(audio), (char) => char.charCodeAt(0))], { type: mime || "audio/mpeg" }));
    const player = new Audio(source);
    try {
      await player.play();
    } catch {
      setNotice(t.phonePlaybackFailed);
    } finally {
      if (!audio.startsWith("http")) URL.revokeObjectURL(source);
    }
  }

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    if (started.current === null) started.current = Date.now();
    setBusy(true);
    setNotice(null);
    setTranslation(null);
    try {
      const result = await practicePhoneTranslation({
        data: {
          simulated: true,
          languageA,
          languageB,
          consentA: consent,
          consentB: consent,
          speaker,
          text,
          startedAt: started.current,
        },
      });
      setNotice(result.notice || t.phoneNotStored);
      setTranslation(result.translation);
      setUsage(t.phoneUsage.replace("{seconds}", String(Math.round(result.usage.durationMs / 1000))).replace("{calls}", String(result.usage.translateCalls + result.usage.sttCalls + result.usage.ttsCalls)));
      if (result.ok) {
        setDraft("");
        setSpeaker(result.nextSpeaker);
        await play(result.audio, result.mime);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.phoneTurnFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-edge bg-card px-4 py-3">
      <p className="text-xs font-medium tracking-widest text-copper uppercase">{t.phoneTranslateTitle}</p>
      <p className="mt-2 text-sm leading-relaxed text-mute">{t.phoneTranslateDetail}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-sm text-mute">
          {t.callerA}
          <select value={languageA} onChange={(event) => setLanguageA(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-edge bg-card px-3 text-base text-cream">
            {languages.map((item) => (
              <option key={item.code} value={item.code}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-mute">
          {t.callerB}
          <select value={languageB} onChange={(event) => setLanguageB(event.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-edge bg-card px-3 text-base text-cream">
            {languages.map((item) => (
              <option key={item.code} value={item.code}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" onClick={() => setMore((value) => !value)} className="mt-2 min-h-11 text-sm text-copper">
        {more ? t.fewerLanguages : t.moreLanguages}
      </button>
      <label className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-mute">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4" />
        {t.phoneConsent}
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setSpeaker("a")} className={"min-h-12 rounded-full text-sm " + (speaker === "a" ? "bg-copper text-ink" : "border border-edge text-cream")}>
          {t.callerA}{speaker === "a" ? ` · ${t.yourTurn}` : ""}
        </button>
        <button type="button" onClick={() => setSpeaker("b")} className={"min-h-12 rounded-full text-sm " + (speaker === "b" ? "bg-copper text-ink" : "border border-edge text-cream")}>
          {t.callerB}{speaker === "b" ? ` · ${t.yourTurn}` : ""}
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={t.phoneTurnPlaceholder}
        className="mt-3 min-h-12 w-full resize-none rounded-2xl border border-edge bg-card px-4 py-3 text-base text-cream outline-none placeholder:text-mute"
      />
      <button
        type="button"
        disabled={busy || !draft.trim() || !consent || languageA === languageB}
        onClick={() => void submit()}
        className="mt-2 min-h-12 w-full rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
      >
        {busy ? t.translating : t.phoneTranslateTurn}
      </button>
      {translation ? <p className="mt-3 text-base leading-relaxed text-cream">{translation}</p> : null}
      {notice ? <p className="mt-2 text-sm leading-relaxed text-copper">{notice}</p> : null}
      {usage ? <p className="mt-1 text-sm text-mute">{usage}</p> : null}
      <p className="mt-2 text-sm leading-relaxed text-mute">{t.phoneTranslateStays}</p>
    </div>
  );
}
