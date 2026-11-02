import { createFileRoute } from "@tanstack/react-router";
import { SignInPanel } from "@/components/sign-in-panel";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  return (
    <main className="min-h-screen bg-ink text-cream">
      <SignInPanel />
    </main>
  );
}
