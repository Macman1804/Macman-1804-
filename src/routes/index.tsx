import { createFileRoute } from "@tanstack/react-router";
import { SignInGate } from "@/lib/auth/gates";
import { DeskApp } from "@/components/desk-app";
import { SignInPanel } from "@/components/sign-in-panel";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="min-h-screen bg-ink text-cream">
      <SignInGate fallback={<SignInPanel />}>
        <DeskApp />
      </SignInGate>
    </main>
  );
}
