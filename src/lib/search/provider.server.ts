import { SEARCH_MODEL, parseSearchPayload, type LiveSource } from "@/lib/search/live";

export async function liveSearch(
  query: string,
): Promise<{ ok: true; body: string; sources: LiveSource[] } | { ok: false }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || !query) return { ok: false };
  try {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(25000),
      body: JSON.stringify({
        model: SEARCH_MODEL,
        max_output_tokens: 400,
        input: [
          {
            role: "system",
            content:
              "Answer from web search only. Two short sentences. If sources disagree, say they disagree. Do not invent a URL, a price, a score, or a date. If you cannot verify it, say you could not verify it.",
          },
          { role: "user", content: query },
        ],
        tools: [{ type: "web_search" }],
      }),
    });
    if (!res.ok) return { ok: false };
    return parseSearchPayload(await res.json());
  } catch {
    return { ok: false };
  }
}
