const SKIP = new Set([
  "this",
  "that",
  "with",
  "from",
  "your",
  "have",
  "about",
  "what",
  "when",
  "where",
  "which",
  "would",
  "could",
  "should",
  "there",
  "their",
  "desk",
  "just",
  "like",
  "been",
  "were",
  "they",
  "them",
  "into",
  "over",
  "then",
  "than",
  "some",
]);

export type PastLine = { channel: string; role: string; body: string };

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !SKIP.has(word));
}

/** Prefer earlier lines that share a word with the question. Fall back to the latest few. */
export function pickRelevant(lines: PastLine[], question: string, limit = 6): PastLine[] {
  const wanted = new Set(words(question));
  const scored = lines.map((line, index) => ({
    line,
    index,
    hits: words(line.body).filter((word) => wanted.has(word)).length,
  }));
  const matched = scored.filter((item) => item.hits > 0).sort((a, b) => b.hits - a.hits || a.index - b.index);
  const chosen = (matched.length > 0 ? matched.slice(0, limit) : scored.slice(-limit)).slice();
  return chosen.sort((a, b) => a.index - b.index).map((item) => item.line);
}
