import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "@/lib/supabase/public-env";

let client: SupabaseClient | null | undefined;

export function browserSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const env = publicSupabaseEnv();
  client = env
    ? createClient(env.url, env.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
  return client;
}
