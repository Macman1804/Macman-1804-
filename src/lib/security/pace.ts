/** Keeps the recent timestamps inside the window. Refuses when the limit is already met. */
export function admit(
  stamps: readonly number[],
  now: number,
  limit: number,
  windowMs: number,
): { ok: boolean; next: number[] } {
  const next = stamps.filter((stamp) => now - stamp < windowMs);
  if (next.length >= limit) return { ok: false, next };
  next.push(now);
  return { ok: true, next };
}

export function auditRecord(input: {
  actorId: string;
  action: string;
  outcome: "allowed" | "refused";
  detail?: string;
}): { actorId: string; action: string; outcome: "allowed" | "refused"; detail: string } {
  const detail = (input.detail ?? "").slice(0, 180);
  if (/token|secret|password|bearer|api[_-]?key/i.test(detail)) {
    return { actorId: input.actorId, action: input.action, outcome: "refused", detail: "A secret was left out of the audit note." };
  }
  return { actorId: input.actorId, action: input.action, outcome: input.outcome, detail };
}
