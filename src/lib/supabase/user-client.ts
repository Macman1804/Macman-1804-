import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "@/lib/supabase/public-env";

export function userSupabase(accessToken: string): SupabaseClient {
  const env = publicSupabaseEnv();
  if (!env) throw new Error("Supabase is not configured.");
  return createClient(env.url, env.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Confirms the access token with Supabase Auth. Does not trust a client-supplied user id. */
export async function requireSupabaseUser(accessToken: string): Promise<User> {
  const client = userSupabase(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Sign in to your Macman account.");
  return data.user;
}
