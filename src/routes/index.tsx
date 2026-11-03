import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/desk-app";
import { SignInPanel } from "@/components/sign-in-panel";
import { useMacmanSession } from "@/components/account-gate";
import { useI18n } from "@/lib/i18n/provider";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { t } = useI18n();
  const account = useMacmanSession();
  if (!account.ready) {
    return (
      <main className="min-h-screen bg-ink text-cream">
        <p className="px-6 py-16 text-sm text-mute">{t.openingAccount}</p>
      </main>
    );
  }
  if (account.configured && account.session && !account.recovery) {
    return (
      <main className="min-h-screen bg-ink text-cream">
        <DeskApp />
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-ink text-cream">
      <SignInPanel />
    </main>
  );
}
