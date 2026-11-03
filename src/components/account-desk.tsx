import { useEffect, useState } from "react";
import { getAccountDesk } from "@/lib/desk.functions";

type Account = Awaited<ReturnType<typeof getAccountDesk>>;

export function AccountDesk({ onBack }: { onBack: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    getAccountDesk()
      .then((next) => {
        if (!cancel) setAccount(next);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "The account could not be opened.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col px-5 pt-5 pb-10">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm text-mute">
        Desk
      </button>
      <p className="mt-4 text-xs font-medium tracking-widest text-copper uppercase">Account</p>
      <h1 className="mt-3 font-serif text-4xl text-cream">Your desk</h1>
      {error ? <p className="mt-4 text-sm text-copper">{error}</p> : null}
      {!account && !error ? <p className="mt-4 text-sm text-mute">Opening…</p> : null}
      {account ? (
        <div className="mt-6 flex flex-col gap-5 text-sm leading-relaxed">
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">Signed in</p>
            <p className="mt-1 break-all text-cream">{account.email ?? "Email is hidden"}</p>
            <p className="text-mute">{account.alias}</p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">Connected services</p>
            <p className="mt-1 text-mute">Gmail is not connected. Outlook is not connected.</p>
            <p className="text-mute">An outside letter can be drafted here. Sending it needs your confirmation, and that step is off.</p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">Phone</p>
            <p className="mt-1 text-mute">
              {account.phone.configured
                ? "Twilio names are present. Calls and texts are still off."
                : "No Twilio credentials are stored. No number is attached."}
            </p>
            <p className="text-mute">Simulated texts stay on this account. Nothing is sent to a phone.</p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">Usage</p>
            <p className="mt-1 text-mute">
              {account.usage.available
                ? `${account.usage.count} recorded line${account.usage.count === 1 ? "" : "s"} on this account.`
                : "Usage is kept on this account. A count is not available from this sign-in yet."}
            </p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">Memory</p>
            <p className="mt-1 text-mute">
              {account.memories.length === 0
                ? "Nothing is saved yet."
                : `${account.memories.length} saved. Remove any of them from the desk.`}
            </p>
          </section>
          <section>
            <p className="text-xs tracking-widest text-copper uppercase">Subscription</p>
            <p className="mt-1 text-mute">Plan not chosen. Price not set. No card is stored. Billing is off.</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
