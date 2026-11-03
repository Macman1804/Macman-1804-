import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/browser";
import { LanguageSwitch, useI18n } from "@/lib/i18n/provider";
import { publicError } from "@/lib/security/public-error";

export function useMacmanSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
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
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(next);
    });
    return () => {
      cancel = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    configured,
    session,
    ready: session !== undefined,
    recovery,
    finishRecovery: () => setRecovery(false),
  };
}

export function AccountGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const account = useMacmanSession();
  if (!account.configured) {
    return <p className="px-5 py-10 text-sm leading-relaxed text-mute">{t.notConfigured}</p>;
  }
  if (!account.ready) return <p className="px-5 py-10 text-sm text-mute">{t.openingAccount}</p>;
  if (account.recovery) {
    return (
      <div>
        <div className="flex justify-end px-5 pt-4">
          <LanguageSwitch />
        </div>
        <NewPassword onDone={account.finishRecovery} />
      </div>
    );
  }
  if (!account.session) {
    return (
      <div>
        <div className="flex justify-end px-5 pt-4">
          <LanguageSwitch />
        </div>
        <AccountPanel />
      </div>
    );
  }
  return children;
}

export function signOutMacman() {
  const client = browserSupabase();
  if (!client) return;
  return client.auth.signOut();
}

export function AccountPanel() {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const client = browserSupabase();
    if (!client || busy) return;
    const address = email.trim();
    if (mode === "up" && password !== confirm) {
      setNote(t.mismatch);
      return;
    }
    setBusy(true);
    setNote(null);
    if (mode === "forgot") {
      const result = await client.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/`,
      });
      setBusy(false);
      setNote(result.error ? publicError(result.error.message, t.couldNot, lang) : t.recoverySent);
      return;
    }
    const result =
      mode === "up"
        ? await client.auth.signUp({ email: address, password, options: { data: { language: lang } } })
        : await client.auth.signInWithPassword({ email: address, password });
    setBusy(false);
    if (result.error) {
      setNote(publicError(result.error.message, t.couldNot, lang));
      return;
    }
    if (mode === "up" && !result.data.session) {
      setNote(t.confirmEmail);
    }
  }

  const title =
    mode === "up" ? t.createDesk : mode === "forgot" ? t.recoverDesk : t.openDesk;

  return (
    <form onSubmit={submit} className="flex flex-col px-5 pt-4 pb-10">
      <h1 className="font-serif text-4xl leading-none text-cream">{title}</h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-cream/90">
        {mode === "forgot" ? t.forgotHelp : t.signHelp}
      </p>
      <label className="mt-8 text-sm text-mute" htmlFor="macman-email">
        {t.email}
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
      {mode !== "forgot" ? (
        <>
          <label className="mt-4 text-sm text-mute" htmlFor="macman-password">
            {t.password}
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
        </>
      ) : null}
      {mode === "up" ? (
        <>
          <label className="mt-4 text-sm text-mute" htmlFor="macman-confirm">
            {t.confirmPassword}
          </label>
          <input
            id="macman-confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="mt-2 min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
          />
        </>
      ) : null}
      {note ? <p className="mt-4 text-sm leading-relaxed text-copper">{note}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 min-h-12 rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
      >
        {busy ? t.working : mode === "up" ? t.createAccount : mode === "forgot" ? t.sendRecovery : t.signIn}
      </button>
      <div className="mt-3 flex flex-col items-start gap-1">
        {mode === "in" ? (
          <button
            type="button"
            className="min-h-11 text-sm text-mute"
            onClick={() => {
              setMode("forgot");
              setNote(null);
            }}
          >
            {t.forgotPassword}
          </button>
        ) : null}
        <button
          type="button"
          className="min-h-11 text-sm text-mute"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setNote(null);
            setConfirm("");
          }}
        >
          {mode === "in" ? t.createAnAccount : t.backToSignIn}
        </button>
      </div>
    </form>
  );
}

export function NewPassword({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const client = browserSupabase();
    if (!client || busy) return;
    if (password !== confirm) {
      setNote(t.mismatch);
      return;
    }
    setBusy(true);
    setNote(null);
    const result = await client.auth.updateUser({ password });
    setBusy(false);
    if (result.error) {
      setNote(publicError(result.error.message, t.passwordFailed, lang));
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col px-5 pt-8 pb-10">
      <h1 className="font-serif text-4xl leading-none text-cream">{t.newPasswordTitle}</h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-cream/90">{t.newPasswordHelp}</p>
      <label className="mt-8 text-sm text-mute" htmlFor="macman-new-password">
        {t.newPassword}
      </label>
      <input
        id="macman-new-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-2 min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
      />
      <label className="mt-4 text-sm text-mute" htmlFor="macman-new-confirm">
        {t.confirmPassword}
      </label>
      <input
        id="macman-new-confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        className="mt-2 min-h-12 rounded-2xl border border-edge bg-card px-4 text-base text-cream outline-none"
      />
      {note ? <p className="mt-4 text-sm text-copper">{note}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 min-h-12 rounded-full bg-copper text-base font-medium text-ink disabled:opacity-50"
      >
        {busy ? t.working : t.savePassword}
      </button>
    </form>
  );
}
