import Link from "next/link";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";

/** 404 for the item segment only. Next resolves the NEAREST not-found
 *  boundary, so `notFound()` in this segment's page.tsx lands here and a
 *  mistyped URL anywhere else gets the neutral root one — this copy is a
 *  confident statement about an expired deal and is only true here. */
export default function NotFound() {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-8 text-center`}>
        <h1 className="font-display text-2xl text-ink">This deal is gone</h1>
        <p className="text-[14px] text-ink-soft mt-2.5 leading-relaxed">
          It probably expired and got swept out with last week&apos;s flyer. This week&apos;s deals
          are still up.
        </p>
        <GlassCard
          as={Link}
          href="/deals"
          wrapperClassName="inline-block mt-6"
          surfaceClassName="glow-btn inline-block px-5 py-2.5 bg-accent text-white font-display text-sm hover:bg-accent-dark transition-colors"
        >
          Back to this week&apos;s deals
        </GlassCard>
      </GlassCard>
    </main>
  );
}
