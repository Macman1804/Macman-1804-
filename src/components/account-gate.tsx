import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/browser";

export function useMacmanSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const configured = browserSupabase() !== null;

  useEffect(() => {
    const client = browserSupabase();
    if (!client) {
      setSession(null);
      return;
    }
    let cancel = false;
    client.auth.getSession().then(({ data }) => {
      if (!cancel) setSession(data.session);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancel = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return { configured, session, ready: session !== undefined };
}

export function AccountGate({ children }: { children: ReactNode }) {
  const { configured, session, ready } = useMacmanSession();
  if (!configured) {
    return (
      <p className="px-5 py-10 text-sm leading-relaxed text-mute">
        Supabase is not configured for this build.
      </p>
    );
  }
  if (!ready) return <p className="px-5 py-10 text-sm text-mute">Opening your account…</p>;
  if (!session) return <AccountPanel />;
  return children;
}

export function signOutMacman() {
  const client = browserSupabase();
  if (!client) return;
  return client.auth.signOut();
}

function AccountPanel() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const client = browserSupabase();
    if (!client || busy) return;
    setBusy(true);
    setNote(null);
    const credentials = { email: email.trim(), password };
    const result =
      mode === "up"
        ? await client.auth.signUp(credentials)
        : await client.auth.signInWithPassword(credentials);
    setBusy(false);
    if (result.error) {
      setNote(result.error.message);
      return;
    }
    if (mode === "up" && !result.data.session) {
      setNote("Account created. Confirm the email, then sign in.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-medium tracking-widest text-copper uppercase">Your account</p>
      <h1 className="mt-4 font-serif text-4xl leading-none text-cream">
        {mode === "up" ? "Create the desk." : "Open the desk."}
      </h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-cream/90">
        Email and password stay with Supabase. This does not send mail, texts, or calls.
      </p>
      <label className="mt-8 text-sm text-mute" htmlFor="macman-email">
        Email
      </label>
      <input
        id="macman-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-2 min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
      />
      <label className="mt-4 text-sm text-mute" htmlFor="macman-password">
        Password
      </label>
      <input
        id="macman-password"
        type="password"
        autoComplete={mode === "up" ? "new-password" : "current-password"}
        required
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-2 min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
      />
      {note ? <p className="mt-4 text-sm text-copper">{note}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 min-h-12 rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
      >
        {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
      </button>
      <button
        type="button"
        className="mt-3 min-h-11 text-sm text-mute"
        onClick={() => {
          setMode(mode === "up" ? "in" : "up");
          setNote(null);
        }}
      >
        {mode === "up" ? "I already have an account" : "Create an account"}
      </button>
    </form>
  );
}
