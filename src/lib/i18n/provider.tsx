import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
import { copy, type Copy } from "./catalog";
import { parseLang, readStoredLang, writeStoredLang, type Lang } from "./language";

const LanguageContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: Copy }>({
  lang: "en",
  setLang: () => undefined,
  t: copy("en"),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = readStoredLang();
    setLangState(stored);
    writeStoredLang(stored);
    const client = browserSupabase();
    if (!client) return;
    let cancel = false;
    const apply = (raw: unknown) => {
      if (cancel || (raw !== "en" && raw !== "es")) return;
      const saved = parseLang(raw);
      setLangState(saved);
      writeStoredLang(saved);
    };
    client.auth.getUser().then(({ data }) => apply(data.user?.user_metadata?.language));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const raw = session?.user.user_metadata?.language;
      if (raw === "en" || raw === "es") {
        apply(raw);
        return;
      }
      if (session) void client.auth.updateUser({ data: { language: readStoredLang() } });
    });
    return () => {
      cancel = true;
      data.subscription.unsubscribe();
    };
  }, []);

  async function setLang(next: Lang) {
    setLangState(next);
    writeStoredLang(next);
    const client = browserSupabase();
    if (!client) return;
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    await client.auth.updateUser({ data: { language: next } });
  }

  return <LanguageContext.Provider value={{ lang, setLang, t: copy(lang) }}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  return useContext(LanguageContext);
}

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t.languageGroup} className="flex gap-2">
      <button
        type="button"
        aria-pressed={lang === "en"}
        onClick={() => void setLang("en")}
        className={
          "min-h-11 rounded-full px-3 text-sm " + (lang === "en" ? "bg-copper text-ink" : "text-mute")
        }
      >
        🇺🇸 English
      </button>
      <button
        type="button"
        aria-pressed={lang === "es"}
        onClick={() => void setLang("es")}
        className={
          "min-h-11 rounded-full px-3 text-sm " + (lang === "es" ? "bg-copper text-ink" : "text-mute")
        }
      >
        🇪🇸 Español
      </button>
    </div>
  );
}
