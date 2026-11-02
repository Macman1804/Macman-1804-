export type PublicSupabaseEnv = { url: string; key: string };

/** Publishable project URL and key. No service-role key is read or shipped. */
export function publicSupabaseEnv(): PublicSupabaseEnv | null {
  const url = (import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const key = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  if (!url || !key) return null;
  return { url, key };
}
