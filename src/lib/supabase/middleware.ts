import { createMiddleware } from "@tanstack/react-start";

/**
 * Verifies the caller's Supabase access token and scopes later queries to that
 * user. The publishable key never bypasses row level security.
 */
export const supabaseMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { browserSupabase } = await import("./browser");
    const client = browserSupabase();
    const session = client ? (await client.auth.getSession()).data.session : null;
    return next({
      sendContext: { supabaseAccessToken: session?.access_token },
    });
  })
  .server(async ({ next, context }) => {
    const token = context.supabaseAccessToken;
    if (!token) throw new Error("Sign in to your Macman account.");
    const { requireSupabaseUser, userSupabase } = await import("./user-client");
    const user = await requireSupabaseUser(token);
    return next({
      context: {
        supabaseUserId: user.id,
        supabaseEmail: user.email ?? null,
        supabase: userSupabase(token),
      },
    });
  });
