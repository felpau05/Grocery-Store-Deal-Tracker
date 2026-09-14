"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { googleLoginUrl } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { BTN_PRIMARY_CTA, BTN_SECONDARY } from "@/lib/button";
import { useToast } from "@/lib/toast";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";

type Mode = "signin" | "signup";

/** A clean white field: hairline at rest, accent border on focus (the
 *  global :focus-visible outline supplies the ring). Sentence-case
 *  placeholders — the uppercase ones read as labels shouted into the
 *  box. */
const FIELD =
  "w-full rounded-control bg-surface border border-line px-3.5 py-2.5 text-sm text-ink " +
  "placeholder:text-ink-muted focus:border-accent transition-colors";

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
      <header className="mb-6 text-center">
        <h1 className="font-display text-3xl text-ink">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        {/* No card behind this — it sits on the page gradient, so
            --color-ink rather than --color-ink-soft. */}
        <p className="text-[14px] text-ink mt-2">Your postal code, your stores, your deals.</p>
      </header>

      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-6`}>
        {/* Mode toggle — a segmented control, not two competing
            buttons. The chosen half is the raised white one. */}
        <div className="flex gap-1 rounded-control border border-line bg-surface-2 p-1 mb-5">
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              aria-pressed={mode === m}
              className={`flex-1 rounded-[7px] py-1.5 text-[13px] font-semibold transition-colors ${
                mode === m
                  ? "bg-surface text-ink shadow-soft"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label htmlFor="login-name" className="label-soft block text-[13px] text-ink mb-1.5">
                Your name
              </label>
              <input
                id="login-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Chen"
                required
                maxLength={40}
                className={FIELD}
              />
            </div>
          )}
          <div>
            <label htmlFor="login-email" className="label-soft block text-[13px] text-ink mb-1.5">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="label-soft block text-[13px] text-ink mb-1.5">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              className={FIELD}
            />
          </div>

          {/* danger, not the old sale green — which is now the accent, so
              a failed sign-in used to render in exactly the colour a
              successful one would. */}
          {error && (
            <p
              role="alert"
              className="rounded-control border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger"
            >
              {error}
            </p>
          )}

          <GlassCard as="button" type="submit" disabled={busy} surfaceClassName={BTN_PRIMARY_CTA}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </GlassCard>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="rule-soft flex-1" />
          <span className="text-[12px] text-ink-muted">or</span>
          <div className="rule-soft flex-1" />
        </div>

        <button
          onClick={() => {
            if (googleEnabled) window.location.href = googleLoginUrl;
          }}
          disabled={isMounted ? !googleEnabled : false}
          title={isMounted && !googleEnabled ? "Google sign-in isn't configured yet (GOOGLE_CLIENT_ID pending)" : undefined}
          suppressHydrationWarning
          className={`${BTN_SECONDARY} w-full py-2.5`}
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
            <span className="block text-[11px] font-normal text-ink-muted mt-0.5">
              Coming soon — keys not configured
            </span>
          )}
        </button>
      </GlassCard>

      {/* No card behind this — raw page gradient, so --color-ink. */}
      <p className="text-center mt-6">
        <Link
          href="/deals"
          className="inline-flex items-center gap-1.5 rounded-control text-[13px] font-semibold text-ink hover:text-accent transition-colors"
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
          Keep browsing the example flyer
        </Link>
      </p>
    </main>
  );
}
