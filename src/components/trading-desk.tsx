import { useState, type FormEvent } from "react";
import { lookupSymbol } from "@/lib/research.functions";
import { optionScenario } from "@/lib/research/bets";
import { useI18n } from "@/lib/i18n/provider";

export function TradingDesk({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const [symbol, setSymbol] = useState("AAPL");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [strike, setStrike] = useState("100");
  const [premium, setPremium] = useState("2");
  const [lesson, setLesson] = useState<string | null>(null);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await lookupSymbol({ data: { symbol, language: lang } });
      setNote(result.text);
    } catch (error) {
      setNote(error instanceof Error ? error.message : t.quoteFailed);
    } finally {
      setBusy(false);
    }
  }

  function teach(event: FormEvent) {
    event.preventDefault();
    const shown = optionScenario({
      side: "call",
      strike: Number(strike),
      premium: Number(premium),
      sharePrice: null,
      lang,
    });
    setLesson(shown.ok ? shown.text : t.optionInvalid);
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-10">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm text-mute">
        {t.desk}
      </button>
      <p className="mt-4 text-xs font-medium tracking-widest text-copper uppercase">{t.trading}</p>
      <h1 className="mt-3 font-serif text-4xl text-cream">{t.markets}</h1>
      <p className="mt-3 text-sm leading-relaxed text-mute">{t.tradingIntro}</p>
      <form onSubmit={(event) => void lookup(event)} className="mt-6 flex flex-col gap-3">
        <label className="text-sm text-mute" htmlFor="symbol">
          {t.symbol}
        </label>
        <input
          id="symbol"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          maxLength={6}
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <button type="submit" disabled={busy} className="min-h-12 rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50">
          {busy ? t.checking : t.lookUp}
        </button>
      </form>
      {note ? <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-cream">{note}</p> : null}
      <form onSubmit={teach} className="mt-8 flex flex-col gap-3">
        <p className="text-xs tracking-widest text-copper uppercase">{t.optionLesson}</p>
        <p className="text-sm text-mute">{t.optionHelp}</p>
        <input
          value={strike}
          onChange={(event) => setStrike(event.target.value)}
          inputMode="decimal"
          aria-label={t.strike}
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <input
          value={premium}
          onChange={(event) => setPremium(event.target.value)}
          inputMode="decimal"
          aria-label={t.premium}
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <button type="submit" className="min-h-12 rounded-full border border-copper text-base text-copper">
          {t.explainCall}
        </button>
      </form>
      {lesson ? <p className="mt-4 text-sm leading-relaxed text-cream">{lesson}</p> : null}
    </div>
  );
}
