"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { googleLoginUrl } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { BTN_PRIMARY_CTA } from "@/lib/button";
import { useToast } from "@/lib/toast";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";

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
  // meta (and so googleEnabled) resolves from an effect-driven fetch —
  // on a fast/local backend it can finish before hydration completes,
  // so the very first client render already disagrees with the server's
  // (meta-less) render of the Google button's `disabled` attribute. Same
  // isMounted-gate list/page.tsx's "Build my trip" button already uses:
  // render the SSR-safe value until mount is confirmed, only switch to
  // the real one afterward, once any mismatch can't matter anymore.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
        {/*<span className="sticker text-[11px] text-ink">Members only</span>*/}
        <h1 className="font-display text-4xl text-ink leading-[0.95] mt-4">
          {mode === "signin" ? "Welcome back" : "Join the club"}
        </h1>
        {/* No card behind this — raw gradient background. */}
        <p className="text-ink mt-3 font-medium">
          Your postal code, your stores, your deals.
        </p>
      </header>

      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-6`}>
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
                mode === m ? "bg-produce text-paper" : "text-ink-soft hover:text-ink"
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

          <GlassCard
            as="button"
            type="submit"
            disabled={busy}
            surfaceClassName={BTN_PRIMARY_CTA}
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </GlassCard>
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
          disabled={isMounted ? !googleEnabled : false}
          title={isMounted && !googleEnabled ? "Google sign-in isn't configured yet (GOOGLE_CLIENT_ID pending)" : undefined}
          suppressHydrationWarning
          className="btn-brut-ink w-full bg-card text-ink font-mono font-bold text-sm py-2.5 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
        >
          {/* Google's official "G" mark — brand guidelines require it stay
              full-color, not tinted to match button text/disabled state. */}
          <svg aria-hidden className="inline-block w-[18px] h-[18px] mr-2 -mt-0.5 align-middle shrink-0" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.68 9c0-.593.102-1.17.284-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
          </svg>
          Continue with Google
          {isMounted && !googleEnabled && (
            <span className="block font-mono font-normal text-[10px] text-ink-soft mt-0.5">
              coming soon — keys not configured
            </span>
          )}
        </button>
      </GlassCard>

      {/* No card behind this — raw gradient background. */}
      <p className="text-center mt-6">
        <Link href="/" className="font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink hover:text-sale transition-colors">
          ← Keep browsing the example flyer
        </Link>
      </p>
    </main>
  );
}
