import Link from "next/link";
import GlassCard from "@/components/GlassCard";

/** Styled 404 — dead item links (expired deals get pruned) land here. */
export default function NotFound() {
  return (
    <main className="max-w-md mx-auto px-6 py-20 text-center">
      <span className="stamp text-sale-dark text-lg">Sold out</span>
      <h1 className="font-display text-3xl text-ink mt-6">
        This deal is gone
      </h1>
      {/* No card behind this paragraph — same raw-gradient case as
          error.tsx, so --color-ink, not --color-ink-soft. */}
      <p className="text-ink mt-3">
        It probably expired and got swept out with last week&apos;s flyer. The current
        deals are still on the board.
      </p>
      <GlassCard
        as={Link}
        href="/"
        wrapperClassName="inline-block mt-8"
        surfaceClassName="glow-btn px-5 py-2.5 bg-sale text-paper font-display text-sm"
      >
        ← Back to this week&apos;s deals
      </GlassCard>
    </main>
  );
}
