export type LeagueId = "nfl" | "nba" | "mlb" | "nhl" | "ncaaf" | "ncaab";

const LEAGUES: Record<LeagueId, { sport: string; league: string; label: string; page: string }> = {
  nfl: { sport: "football", league: "nfl", label: "NFL", page: "https://www.espn.com/nfl/scoreboard" },
  nba: { sport: "basketball", league: "nba", label: "NBA", page: "https://www.espn.com/nba/scoreboard" },
  mlb: { sport: "baseball", league: "mlb", label: "MLB", page: "https://www.espn.com/mlb/scoreboard" },
  nhl: { sport: "hockey", league: "nhl", label: "NHL", page: "https://www.espn.com/nhl/scoreboard" },
  ncaaf: {
    sport: "football",
    league: "college-football",
    label: "College football",
    page: "https://www.espn.com/college-football/scoreboard",
  },
  ncaab: {
    sport: "basketball",
    league: "mens-college-basketball",
    label: "College basketball",
    page: "https://www.espn.com/mens-college-basketball/scoreboard",
  },
};

export function leaguePath(id: LeagueId): string {
  const league = LEAGUES[id];
  return `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/scoreboard`;
}

export function askedLeague(text: string): LeagueId | null {
  if (!/\b(score|scores|game|games|board|schedule|playing|matchup|who won)\b/i.test(text)) return null;
  if (/\b(college football|ncaaf)\b/i.test(text)) return "ncaaf";
  if (/\b(college basketball|ncaab)\b/i.test(text)) return "ncaab";
  if (/\bnfl\b/i.test(text)) return "nfl";
  if (/\bnba\b/i.test(text)) return "nba";
  if (/\bmlb\b/i.test(text)) return "mlb";
  if (/\bnhl\b/i.test(text)) return "nhl";
  return null;
}

type Side = { name: string; score: string; home: boolean; record: string | null };

function side(value: unknown): Side | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { homeAway?: unknown; score?: unknown; records?: { summary?: unknown }[]; team?: { displayName?: unknown } };
  const name = row.team?.displayName;
  if (typeof name !== "string") return null;
  return {
    name,
    score: typeof row.score === "string" || typeof row.score === "number" ? String(row.score) : "—",
    home: row.homeAway === "home",
    record: typeof row.records?.[0]?.summary === "string" ? row.records[0].summary : null,
  };
}

export function presentBoard(id: LeagueId, payload: unknown, fetchedAt: Date): string | null {
  if (!payload || typeof payload !== "object") return null;
  const events = (payload as { events?: unknown[] }).events;
  if (!Array.isArray(events)) return null;
  const league = LEAGUES[id];
  const when = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(fetchedAt);
  const lines = events.slice(0, 8).map((event) => {
    if (!event || typeof event !== "object") return "";
    const competition = (event as { competitions?: unknown[] }).competitions?.[0];
    if (!competition || typeof competition !== "object") return "";
    const row = competition as { status?: { type?: { description?: unknown; state?: unknown } }; competitors?: unknown[] };
    const teams = (row.competitors ?? []).map(side).filter((item): item is Side => Boolean(item));
    if (teams.length < 2) return "";
    const state = row.status?.type?.state;
    const label = state === "in" ? "In progress" : state === "post" ? "Final" : "Scheduled";
    const detail = typeof row.status?.type?.description === "string" ? row.status.type.description : label;
    const shown = teams
      .map((team) => `${team.name} ${team.score}${team.record ? ` (${team.record})` : ""}`)
      .join(", ");
    return `${shown}. ${detail}.`;
  }).filter(Boolean);
  const body = lines.length ? lines.join(" ") : "ESPN did not list a game on this board.";
  return [
    `${league.label} from ESPN. Retrieved ${when}.`,
    body,
    "Injury reports, confirmed lineups, and sportsbook odds are not on this board.",
    "A scheduled game is not a live result. This is not a wager, and it is not a guarantee.",
    "You must be of legal age where you live before using any betting math.",
    `\n\nSources\n${league.page}`,
  ].join(" ");
}
