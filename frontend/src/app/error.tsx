"use client";

import Link from "next/link";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";
import { BTN_SECONDARY } from "@/lib/button";

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
    <main className="max-w-md mx-auto px-6 py-20">
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-8 text-center`}>
        <h1 className="font-display text-2xl text-ink">This page hit a snag</h1>
        <p className="text-[14px] text-ink-soft mt-2.5 leading-relaxed">
          We couldn&apos;t load this right now. It&apos;s us, not you — try again in a moment.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          {/* One thing to press (retry), one way out. The way out is the
              quiet one — it isn't what you came here to do. */}
          <GlassCard
            as="button"
            onClick={reset}
            surfaceClassName="glow-btn px-5 py-2.5 bg-accent text-white font-display text-sm hover:bg-accent-dark transition-colors"
          >
            Try again
          </GlassCard>
          <Link href="/deals" className={BTN_SECONDARY}>
            Back to deals
          </Link>
        </div>
      </GlassCard>
    </main>
  );
}
