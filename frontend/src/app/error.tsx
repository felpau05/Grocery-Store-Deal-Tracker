"use client";

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
      <p className="text-ink-soft mt-3">
        We couldn&apos;t load this right now. It&apos;s us, not you — try again in a moment.
      </p>
      <div className="flex items-center justify-center gap-3 mt-8">
        <button
          onClick={reset}
          className="btn-brut px-5 py-2.5 bg-ink text-paper font-mono font-bold text-sm"
        >
          Try again
        </button>
        <a
          href="/"
          className="btn-brut px-5 py-2.5 bg-card text-ink font-mono font-bold text-sm"
        >
          ← Back to deals
        </a>
      </div>
    </main>
  );
}
