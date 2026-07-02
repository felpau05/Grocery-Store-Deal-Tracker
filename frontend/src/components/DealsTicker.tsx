import type { Deal } from "@/lib/api";

/**
 * A flyer-style ticker tape of this week's deals scrolling across the
 * page — a nod to a newspaper/stock ticker, but for groceries. The
 * strip is duplicated so the marquee loops seamlessly (translateX(-50%)
 * lands exactly one copy over). Pauses on hover so you can actually read.
 */
export default function DealsTicker({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null;

  const strip = deals.slice(0, 16);

  return (
    <div className="group relative overflow-hidden border-y border-border-tan bg-card/50">
      {/* fade edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10 bg-gradient-to-r from-paper to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10 bg-gradient-to-l from-paper to-transparent" />

      <div className="ticker-track flex w-max gap-8 py-2 group-hover:[animation-play-state:paused]">
        {[...strip, ...strip].map((d, i) => (
          <span
            key={i}
            className="flex items-center gap-2 font-mono text-[12px] whitespace-nowrap"
          >
            <span className="text-sale">●</span>
            <span className="text-ink font-medium">{d.name}</span>
            <span className="text-ink-soft">${d.price.toFixed(2)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
