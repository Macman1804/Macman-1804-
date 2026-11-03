import { useState, type FormEvent } from "react";
import { loadBoard } from "@/lib/research.functions";
import { parlay } from "@/lib/research/bets";
import { useI18n } from "@/lib/i18n/provider";
import type { LeagueId } from "@/lib/research/sports";

const LEAGUES: { id: LeagueId; label: string }[] = [
  { id: "nfl", label: "NFL" },
  { id: "nba", label: "NBA" },
  { id: "mlb", label: "MLB" },
  { id: "nhl", label: "NHL" },
  { id: "ncaaf", label: "College football" },
  { id: "ncaab", label: "College basketball" },
];

export function SportsDesk({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<LeagueId | null>(null);
  const [first, setFirst] = useState("-110");
  const [second, setSecond] = useState("-110");
  const [sameGame, setSameGame] = useState(false);
  const [slip, setSlip] = useState<string | null>(null);

  async function board(id: LeagueId) {
    if (busy) return;
    setBusy(id);
    setNote(null);
    try {
      const result = await loadBoard({ data: { league: id, language: lang } });
      setNote(result.text);
    } catch (error) {
      setNote(error instanceof Error ? error.message : t.boardFailed);
    } finally {
      setBusy(null);
    }
  }

  function price(event: FormEvent) {
    event.preventDefault();
    const shown = parlay({
      legs: [Number(first), Number(second)],
      stake: 10,
      sameGame,
      lang,
    });
    setSlip(shown.ok ? shown.text : t.parlayInvalid);
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-10">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm text-mute">
        {t.desk}
      </button>
      <p className="mt-4 text-xs font-medium tracking-widest text-copper uppercase">{t.sports}</p>
      <h1 className="mt-3 font-serif text-4xl text-cream">{t.scores}</h1>
      <p className="mt-3 text-sm leading-relaxed text-mute">{t.sportsIntro}</p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        {LEAGUES.map((league) => (
          <button
            key={league.id}
            type="button"
            onClick={() => void board(league.id)}
            disabled={Boolean(busy)}
            className="min-h-12 rounded-2xl border border-edge bg-card px-3 text-sm text-cream disabled:opacity-50"
          >
            {busy === league.id ? t.checking : league.id === "ncaaf" ? t.collegeFootball : league.id === "ncaab" ? t.collegeBasketball : league.label}
          </button>
        ))}
      </div>
      {note ? <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-cream">{note}</p> : null}
      <form onSubmit={price} className="mt-8 flex flex-col gap-3">
        <p className="text-xs tracking-widest text-copper uppercase">{t.parlayMath}</p>
        <p className="text-sm text-mute">{t.parlayHelp}</p>
        <input
          value={first}
          onChange={(event) => setFirst(event.target.value)}
          inputMode="text"
          aria-label={t.firstPrice}
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <input
          value={second}
          onChange={(event) => setSecond(event.target.value)}
          inputMode="text"
          aria-label={t.secondPrice}
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <label className="flex min-h-11 items-center gap-3 text-sm text-cream">
          <input type="checkbox" checked={sameGame} onChange={(event) => setSameGame(event.target.checked)} />
          {t.sameGame}
        </label>
        <button type="submit" className="min-h-12 rounded-full border border-copper text-base text-copper">
          {t.priceSlip}
        </button>
      </form>
      {slip ? <p className="mt-4 text-sm leading-relaxed text-cream">{slip}</p> : null}
    </div>
  );
}
