"use client";

import Link from "next/link";
import GlassCard from "@/components/GlassCard";

/**
 * Route-level error boundary — replaces Next's unstyled crash screen.
 * Catches server-component fetch failures (e.g. the backend being down
 * while rendering /item/[id]) and anything a page throws.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <span className="stamp text-sale-dark text-lg">Something tore</span>
      <h1 className="font-display text-3xl text-ink mt-6">
        This page hit a snag
      </h1>
      {/* No card behind this paragraph — it sits directly on the page's
          coral gradient, so it needs the darker --color-ink, not
          --color-ink-soft (which only clears ~2:1 there). */}
      <p className="text-ink mt-3">
        We couldn&apos;t load this right now. It&apos;s us, not you — try again in a moment.
      </p>
      <div className="flex items-center justify-center gap-3 mt-8">
        {/* Co-equal actions, not primary/secondary — both wear the same
            glow. */}
        <GlassCard
          as="button"
          onClick={reset}
          surfaceClassName="glow-btn px-5 py-2.5 bg-produce text-paper font-mono font-bold text-sm"
        >
          Try again
        </GlassCard>
        <GlassCard
          as={Link}
          href="/"
          surfaceClassName="glow-btn px-5 py-2.5 bg-card text-ink font-mono font-bold text-sm"
        >
          ← Back to deals
        </GlassCard>
      </div>
    </main>
  );
}
