import { useState, type FormEvent } from "react";
import { lookupSymbol } from "@/lib/research.functions";
import { optionScenario } from "@/lib/research/bets";

export function TradingDesk({ onBack }: { onBack: () => void }) {
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
      const result = await lookupSymbol({ data: { symbol } });
      setNote(result.text);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That quote could not be verified.");
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
    });
    setLesson(shown.ok ? shown.text : "Enter a strike and a premium you already know. No contract is quoted.");
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-10">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm text-mute">
        Desk
      </button>
      <p className="mt-4 text-xs font-medium tracking-widest text-copper uppercase">Trading</p>
      <h1 className="mt-3 font-serif text-4xl text-cream">Markets</h1>
      <p className="mt-3 text-sm leading-relaxed text-mute">
        Daily prices come from Yahoo Finance. Bitcoin, Ethereum, Solana, XRP, and Cardano still come from CoinGecko. This does not place a trade.
      </p>
      <form onSubmit={(event) => void lookup(event)} className="mt-6 flex flex-col gap-3">
        <label className="text-sm text-mute" htmlFor="symbol">
          Symbol
        </label>
        <input
          id="symbol"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          maxLength={6}
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <button type="submit" disabled={busy} className="min-h-12 rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50">
          {busy ? "Checking…" : "Look up"}
        </button>
      </form>
      {note ? <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-cream">{note}</p> : null}
      <form onSubmit={teach} className="mt-8 flex flex-col gap-3">
        <p className="text-xs tracking-widest text-copper uppercase">Option lesson</p>
        <p className="text-sm text-mute">No chain is loaded. The numbers below are the ones you type.</p>
        <input
          value={strike}
          onChange={(event) => setStrike(event.target.value)}
          inputMode="decimal"
          aria-label="Strike"
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <input
          value={premium}
          onChange={(event) => setPremium(event.target.value)}
          inputMode="decimal"
          aria-label="Premium"
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <button type="submit" className="min-h-12 rounded-full border border-copper text-base text-copper">
          Explain a long call
        </button>
      </form>
      {lesson ? <p className="mt-4 text-sm leading-relaxed text-cream">{lesson}</p> : null}
    </div>
  );
}
