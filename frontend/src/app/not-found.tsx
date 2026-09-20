import Link from "next/link";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";
import { BTN_FOLLOWUP_CTA, BTN_SECONDARY } from "@/lib/button";

/** The global 404: any address that matches no route. A dead ITEM link is
 *  a different thing and has its own boundary at `item/[id]/not-found.tsx`
 *  — this one can't claim a deal expired, because whatever the visitor
 *  typed was very likely never a deal. */
export default function NotFound() {
  return (
    <main className="max-w-md mx-auto px-6 py-20">
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-8 text-center`}>
        <h1 className="font-display text-2xl text-ink">This page doesn&apos;t exist</h1>
        <p className="text-[14px] text-ink-soft mt-2.5 leading-relaxed">
          The address might be mistyped, or the page may have moved.
        </p>
        {/* Two ways out, not one: a lost visitor usually wants the front
            door, and the one who mistyped a deal URL wants the catalogue. */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/deals" className={BTN_FOLLOWUP_CTA}>
            Browse deals
          </Link>
          <Link href="/" className={BTN_SECONDARY}>
            Go home
          </Link>
        </div>
      </GlassCard>
    </main>
  );
}
