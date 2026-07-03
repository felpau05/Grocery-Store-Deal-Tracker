"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { googleLoginUrl } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { useToast } from "@/lib/toast";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const { user, meta, signIn, signUp, adoptToken } = useAccount();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google's callback redirects here with #token=… (or #error=…) — adopt
  // the session and clean the hash off the URL.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#token=")) {
      const token = decodeURIComponent(hash.slice("#token=".length));
      window.history.replaceState(null, "", window.location.pathname);
      adoptToken(token)
        .then(() => {
          toast("Signed in with Google");
          router.replace("/settings");
        })
        .catch(() => setError("Google sign-in failed — try again."));
    } else if (hash.startsWith("#error=")) {
      window.history.replaceState(null, "", window.location.pathname);
      setError(
        hash.includes("storage")
          ? "Couldn't create the account — storage limit reached."
          : "Google sign-in failed — try again.",
      );
    }
  }, [adoptToken, router, toast]);

  // Already signed in → nothing to do here.
  useEffect(() => {
    if (user) router.replace("/settings");
  }, [user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signUp(name.trim(), email.trim(), password);
        toast("Account created — set your postal code and stores");
        router.replace("/settings");
      } else {
        const account = await signIn(email.trim(), password);
        // A user who never finished setup goes to settings, not to a
        // home page full of example data.
        if (account.merchants.length === 0) {
          toast("Signed in — pick your stores to personalize your deals");
          router.replace("/settings");
        } else {
          toast("Signed in");
          router.replace("/");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  const googleEnabled = meta?.google_auth_enabled ?? false;

  return (
    <main className="max-w-md mx-auto px-6 py-14">
      <header className="mb-8 text-center">
        <span className="sticker text-[11px] text-ink">Members only</span>
        <h1 className="font-display text-4xl text-ink leading-[0.95] mt-4">
          {mode === "signin" ? "Welcome back" : "Join the club"}
        </h1>
        <p className="text-ink-soft mt-3 font-medium">
          Your postal code, your stores, your deals — private to your account.
        </p>
      </header>

      <div className="brut p-6">
        {/* Mode toggle */}
        <div className="flex border-2 border-ink p-1 mb-5 bg-paper">
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 text-[12px] font-mono font-bold py-1.5 transition-colors ${
                mode === m ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="YOUR NAME"
              required
              maxLength={40}
              className="w-full bg-paper border-2 border-ink px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="EMAIL"
            required
            className="w-full bg-paper border-2 border-ink px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "PASSWORD (8+ CHARACTERS)" : "PASSWORD"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            className="w-full bg-paper border-2 border-ink px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
          />

          {error && (
            <p className="font-mono text-[12px] text-sale-dark border-2 border-sale/40 bg-sale/10 px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-brut w-full bg-sale-dark text-paper font-display py-3 hover:bg-produce transition-colors disabled:opacity-40"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="tear-line flex-1" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">or</span>
          <div className="tear-line flex-1" />
        </div>

        <button
          onClick={() => {
            if (googleEnabled) window.location.href = googleLoginUrl;
          }}
          disabled={!googleEnabled}
          title={googleEnabled ? undefined : "Google sign-in isn't configured yet (GOOGLE_CLIENT_ID pending)"}
          className="btn-brut w-full bg-card text-ink font-mono font-bold text-sm py-2.5 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <span className="font-display mr-2" aria-hidden>G</span>
          Continue with Google
          {!googleEnabled && (
            <span className="block font-mono font-normal text-[10px] text-ink-soft mt-0.5">
              coming soon — keys not configured
            </span>
          )}
        </button>
      </div>

      <p className="text-center mt-6">
        <Link href="/" className="font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink-soft hover:text-sale transition-colors">
          ← Keep browsing the example flyer
        </Link>
      </p>
    </main>
  );
}
