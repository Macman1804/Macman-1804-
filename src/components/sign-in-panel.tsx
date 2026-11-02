import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export function SignInPanel() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <p className="font-serif text-5xl tracking-wide text-cream">MACMAN</p>
      <p className="mt-3 font-serif text-2xl text-copper">A private desk</p>
      <p className="mt-6 max-w-sm text-base leading-relaxed text-mute">
        Continue with Google or X. The desk opens immediately after.
      </p>
      {authEnabled ? (
        <div className="mt-10 flex flex-col gap-3">
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
              className="min-h-12 rounded-2xl border border-edge bg-card px-4 text-base font-medium text-cream transition hover:border-copper"
            >
              Continue with {provider.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-8 text-sm text-mute">Sign-in is not available.</p>
      )}
    </div>
  );
}
