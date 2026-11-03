import { useEffect, useState } from "react";
import { getAccountDesk } from "@/lib/desk.functions";
import { LanguageSwitch, useI18n } from "@/lib/i18n/provider";

type Account = Awaited<ReturnType<typeof getAccountDesk>>;

export function AccountDesk({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    getAccountDesk()
      .then((next) => {
        if (!cancel) setAccount(next);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : t.accountError);
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-10">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm text-mute">
        {t.desk}
      </button>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-copper uppercase">{t.account}</p>
          <h1 className="mt-3 font-serif text-4xl text-cream">{t.accountTitle}</h1>
        </div>
        <LanguageSwitch />
      </div>
      {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
      {!account && !error ? <p className="mt-4 text-sm text-mute">{t.opening}</p> : null}
      {account ? (
        <div className="mt-6 flex flex-col gap-5 text-sm leading-relaxed">
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">{t.signedIn}</p>
            <p className="mt-1 break-all text-cream">{account.email ?? t.email}</p>
            <p className="text-mute">{account.alias}</p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">{t.connected}</p>
            <p className="mt-1 text-mute">{t.gmailOff}</p>
            <p className="text-mute">{t.letterOff}</p>
            <p className="text-mute">{t.lookups}</p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">{t.phone}</p>
            <p className="mt-1 text-mute">{account.phone.configured ? t.phoneOn : t.phoneOff}</p>
            <p className="text-mute">{t.textsStay}</p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">{t.usage}</p>
            <p className="mt-1 text-mute">
              {account.usage.available
                ? `${account.usage.count} ${account.usage.count === 1 ? t.usageOne : t.usageCount}`
                : t.usageHidden}
            </p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">{t.memory}</p>
            <p className="mt-1 text-mute">
              {account.memories.length === 0 ? t.memoryEmpty : `${account.memories.length} ${t.memorySaved}`}
            </p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">{t.languageSetting}</p>
            <p className="mt-1 text-mute">{t.languageHelp}</p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">{t.subscription}</p>
            <p className="mt-1 text-mute">{t.planOff}</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
