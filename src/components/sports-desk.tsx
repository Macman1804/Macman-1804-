import { useState, type FormEvent } from "react";
import { loadBoard } from "@/lib/research.functions";
import { parlay } from "@/lib/research/bets";
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
      const result = await loadBoard({ data: { league: id } });
      setNote(result.text);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That board could not be verified.");
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
    });
    setSlip(shown.ok ? shown.text : "Enter two American prices, such as -110 and +150. No odds were fetched.");
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-10">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm text-mute">
        Desk
      </button>
      <p className="mt-4 text-xs font-medium tracking-widest text-copper uppercase">Sports</p>
      <h1 className="mt-3 font-serif text-4xl text-cream">Scores</h1>
      <p className="mt-3 text-sm leading-relaxed text-mute">
        Scores come from ESPN. Odds, injuries, and lineups are not included. This is not a wager. You must be of legal age where you live.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        {LEAGUES.map((league) => (
          <button
            key={league.id}
            type="button"
            onClick={() => void board(league.id)}
            disabled={Boolean(busy)}
            className="min-h-12 rounded-2xl border border-edge bg-card px-3 text-sm text-cream disabled:opacity-50"
          >
            {busy === league.id ? "Checking…" : league.label}
          </button>
        ))}
      </div>
      {note ? <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-cream">{note}</p> : null}
      <form onSubmit={price} className="mt-8 flex flex-col gap-3">
        <p className="text-xs tracking-widest text-copper uppercase">Parlay math</p>
        <p className="text-sm text-mute">Type the prices from your book. Nothing is sent to a sportsbook.</p>
        <input
          value={first}
          onChange={(event) => setFirst(event.target.value)}
          inputMode="text"
          aria-label="First American price"
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <input
          value={second}
          onChange={(event) => setSecond(event.target.value)}
          inputMode="text"
          aria-label="Second American price"
          className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
        />
        <label className="flex min-h-11 items-center gap-3 text-sm text-cream">
          <input type="checkbox" checked={sameGame} onChange={(event) => setSameGame(event.target.checked)} />
          Same game
        </label>
        <button type="submit" className="min-h-12 rounded-full border border-copper text-base text-copper">
          Price a $10 slip
        </button>
      </form>
      {slip ? <p className="mt-4 text-sm leading-relaxed text-cream">{slip}</p> : null}
    </div>
  );
}
