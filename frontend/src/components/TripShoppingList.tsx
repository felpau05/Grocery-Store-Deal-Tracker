import Link from "next/link";
import type { PlanItem } from "@/lib/api";
import { BTN_SECONDARY } from "@/lib/button";
import { CHIP_ACTIVE_LIGHT, CHIP_QUIET_LIGHT, CHIP_SOFT } from "@/lib/chip";
import { tripName, useTrips, type Trip } from "@/lib/trips";
import BackLink from "@/components/BackLink";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";

/**
 * The built shopping trip as the list you actually shop from: every
 * item you're buying, grouped by store, with the product's FULL name
 * and its photo.
 *
 * This exists because the receipts can't do this job. A receipt is a
 * narrow column with a leader line, so the name has to truncate
 * ("Compliments Cozy C…") — which is fine for "what's the damage" and
 * useless for "which box do I take off the shelf". Rather than widen
 * the receipts and lose what makes them readable, the two questions get
 * two views: receipts for the money, this for the shopping.
 *
 * It renders from the trip's SAVED plans, not from a fresh optimize
 * call — signed in, those are re-priced server-side on every load
 * (backend/db/cart.py's _assemble_plan); locally they're the snapshot
 * the last build wrote. Either way this view never has to rebuild
 * anything to open.
 */
export default function TripShoppingList({ trip }: { trip: Trip }) {
  const { trips } = useTrips();
  const { plans } = trip;
  const itemCount = plans.reduce((n, p) => n + p.items.length, 0);
  const total = Math.round(plans.reduce((sum, p) => sum + p.subtotal, 0) * 100) / 100;

  // Anything on the list that no store plan covers — no deal matched it
  // this week. You still have to buy it, so it belongs on a list that
  // claims to be the full trip.
  const planned = new Set(plans.flatMap((p) => p.items.map((i) => i.query)));
  const missing = trip.items.filter((i) => !planned.has(i.query));

  return (
    <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16">
      <BackLink href="/list" label="Plan a shopping trip" />

      <header className="mt-3 mb-6 border-b border-line pb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {/* The trip's own name is the heading — this view is only
                ever one trip's list, and with the switcher below it has
                to be obvious WHICH. */}
            <h1 className="font-display text-3xl text-ink leading-tight">{tripName(trip)}</h1>
            <p className="text-[13px] text-ink-soft mt-1.5">
              Shopping list · <span className="font-mono tabular-nums">{itemCount}</span>{" "}
              {itemCount === 1 ? "item" : "items"} ·{" "}
              <span className="font-mono tabular-nums">{plans.length}</span>{" "}
              {plans.length === 1 ? "store" : "stores"}
            </p>
          </div>
          {plans.length > 0 && (
            <div className="shrink-0 text-right">
              <div className="text-[12px] font-semibold text-ink-soft">Estimated total</div>
              <div className="font-display text-3xl text-accent leading-none mt-1 tabular-nums">
                ${total.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Switch which trip you're looking at without going back out to
            the planner. Chips rather than a dropdown: every name is
            visible at a glance and each one is a plain link, so there's
            no open/close state to get stuck. */}
        {trips.length > 1 && (
          <nav className="flex flex-wrap items-center gap-2 mt-4" aria-label="Choose a shopping trip">
            <span className="text-[12px] text-ink-muted mr-0.5">Viewing</span>
            {trips.map((t) => {
              const current = t.id === trip.id;
              return (
                <Link
                  key={t.id}
                  href={`/list?trip=${encodeURIComponent(t.id)}&view=full`}
                  aria-current={current ? "page" : undefined}
                  className={`${CHIP_SOFT} ${current ? CHIP_ACTIVE_LIGHT : CHIP_QUIET_LIGHT} max-w-[220px] truncate`}
                >
                  {tripName(t)}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {plans.length === 0 ? (
        <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-8 text-center`}>
          <p className="font-display text-ink text-base">Nothing priced yet</p>
          <p className="text-[14px] text-ink-soft mt-2">
            Build this shopping trip and the list of what to pick up — and where — shows up here.
          </p>
          <Link
            href={`/list?trip=${encodeURIComponent(trip.id)}`}
            className={`${BTN_SECONDARY} inline-block mt-5`}
          >
            Open the planner →
          </Link>
        </GlassCard>
      ) : (
        <div className="space-y-10">
          {plans.map((plan, i) => (
            <section key={plan.merchant_id} aria-label={plan.merchant_name}>
              <div className="flex items-end justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <h2 className="font-display text-[20px] text-ink leading-tight">{plan.merchant_name}</h2>
                  <p className="text-[12px] text-ink-muted mt-0.5">
                    Stop <span className="font-mono tabular-nums">{i + 1}</span> ·{" "}
                    <span className="font-mono tabular-nums">{plan.items.length}</span>{" "}
                    {plan.items.length === 1 ? "item" : "items"}
                  </p>
                </div>
                <span className="font-mono tabular-nums font-semibold text-ink shrink-0">
                  ${plan.subtotal.toFixed(2)}
                </span>
              </div>

              <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {plan.items.map((item) => (
                  <li key={item.item_id}>
                    <ItemRow item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <section className="mt-10 pt-6 border-t border-line">
          <h2 className="font-display text-[17px] text-ink leading-tight">Not in this plan</h2>
          {/* Deliberately covers both cases: an item with no matching
              deal, and one added since the last build. The trip doesn't
              record which, and claiming "not on sale anywhere" about an
              item nobody has priced yet would just be wrong. */}
          <p className="text-[13px] text-ink-soft mt-1">
            No deal matched {missing.length === 1 ? "this" : "these"} at your stores — or{" "}
            {missing.length === 1 ? "it was" : "they were"} added after the last build. Rebuilding
            the shopping trip re-checks {missing.length === 1 ? "it" : "them"}.
          </p>
          <ul className="flex flex-wrap gap-2 mt-3">
            {missing.map((item) => (
              <li
                key={item.id}
                className="rounded-control bg-surface-2 border border-line px-3 py-1.5 text-[13px] text-ink-soft capitalize"
              >
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ItemRow({ item }: { item: PlanItem }) {
  return (
    <GlassCard
      as={Link}
      href={`/item/${item.item_id}`}
      interactive
      // h-full on BOTH: the surface fills the wrapper, the wrapper fills
      // the grid cell. Without the wrapper half, a two-line product name
      // makes its card taller than the one beside it.
      wrapperClassName="h-full"
      surfaceClassName={`group ${GLASS_SURFACE_DENSE} flex items-center gap-3.5 p-3 h-full`}
    >
      <Thumb src={item.product_image} />
      <div className="min-w-0 flex-1">
        {/* The whole point of this view: the name wraps in full rather
            than truncating the way the receipt line has to. */}
        <span className="block font-display text-[15px] leading-snug text-ink transition-colors group-hover:text-accent">
          {item.name}
        </span>
        {/* capitalize on the query ONLY — on the whole line it also
            shouts the "for". */}
        <span className="block text-[12px] text-ink-muted mt-1">
          for <span className="capitalize">{item.query}</span>
        </span>
      </div>
      <span className="font-mono tabular-nums font-semibold text-ink shrink-0">
        ${item.price.toFixed(2)}
      </span>
    </GlassCard>
  );
}

/** Square product thumb. Same "placeholder underneath, hide a broken
 *  img on error" trick DealCard's image well uses, so a missing photo
 *  and a dead URL land in the same place and rows keep one height. */
function Thumb({ src }: { src?: string | null }) {
  return (
    <span className="relative shrink-0 w-16 h-16 rounded-control bg-surface-2 overflow-hidden">
      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-ink-muted/30">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.75" cy="9.25" r="1.4" />
          <path d="M20.5 15.5 16 11l-5.25 5.25L8.25 13.75 3.5 18.5" />
        </svg>
      </span>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain p-1.5"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </span>
  );
}
