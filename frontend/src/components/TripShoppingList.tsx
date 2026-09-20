"use client";

import Link from "next/link";
import { useState } from "react";
import type { OptimizeOption, StorePlan } from "@/lib/api";
import { BTN_SECONDARY } from "@/lib/button";
import { tripName, type Trip } from "@/lib/trips";
import { useToast } from "@/lib/toast";
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
  const { toast } = useToast();
  const { plans } = trip;
  const itemCount = plans.reduce((n, p) => n + p.items.length, 0);
  const total = Math.round(plans.reduce((sum, p) => sum + p.subtotal, 0) * 100) / 100;

  // Anything on the list that no store plan covers — no deal matched it
  // this week. You still have to buy it, so it belongs on a list that
  // claims to be the full trip.
  const planned = new Set(plans.flatMap((p) => p.items.map((i) => i.query)));
  const missing = trip.items.filter((i) => !planned.has(i.query));

  return (
    // Same shape as the trip planner: at `wide:` one fixed screen under
    // the header, a name card across the top, the overview pinned on the
    // left and the store cards as the only scrolling region. Below
    // `wide:` it's one ordinary scrolling column.
    <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16 wide:pb-6 wide:h-[calc(100svh-var(--header-h))] wide:flex wide:flex-col wide:overflow-hidden">
      <header className="shrink-0 mb-5">
        <BackLink href="/list" label="Back" />
        <GlassCard
          wrapperClassName="mt-2"
          surfaceClassName={`${GLASS_SURFACE_DENSE} px-5 py-3.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3`}
        >
          {/* The trip's own name is the heading — this view is only ever
              one trip's list, deliberately with no switcher to others. */}
          <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
            <h1 className="font-display text-[26px] sm:text-[30px] text-ink leading-tight">{tripName(trip)}</h1>
            <span className="text-[13px] text-ink-muted">Shopping list</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href={`/list?trip=${encodeURIComponent(trip.id)}`} className={BTN_SECONDARY}>
              Edit trip
            </Link>
            <button type="button" onClick={() => toast("Emailing your plan is coming soon")} className={BTN_SECONDARY}>
              Email
            </button>
          </div>
        </GlassCard>
      </header>

      <div className="grid grid-cols-1 wide:grid-cols-[minmax(0,400px)_1fr] wide:grid-rows-[minmax(0,1fr)] gap-6 wide:flex-1 wide:min-h-0">
        {/* ── Left panel: the trip at a glance ─────────────────────── */}
        <GlassCard
          wrapperClassName="wide:min-h-0 wide:h-full"
          surfaceClassName={`${GLASS_SURFACE_DENSE} flex flex-col wide:h-full`}
        >
          <div className="shrink-0 px-5 py-5 border-b border-line bg-accent-soft/40">
            <div className="text-[12px] font-semibold text-ink-soft">Estimated total</div>
            <div className="font-display text-5xl text-accent leading-none mt-2 tabular-nums">${total.toFixed(2)}</div>
            <p className="text-[13px] text-ink-soft mt-2">
              <span className="font-mono tabular-nums">{itemCount}</span> {itemCount === 1 ? "item" : "items"} ·{" "}
              <span className="font-mono tabular-nums">{plans.length}</span> {plans.length === 1 ? "store" : "stores"}
            </p>
          </div>

          <div className="wide:flex-1 wide:min-h-0 wide:overflow-y-auto">
            {/* The route: each stop jumps to its store card. */}
            {plans.length > 0 && (
              <ol className="px-5 py-3" aria-label="Route">
                {plans.map((plan, i) => (
                  <li key={plan.merchant_id} className="relative">
                    {/* The line joining this stop to the next, running
                        through the badges' centres. */}
                    {i < plans.length - 1 && (
                      <span aria-hidden className="absolute left-[13px] top-[38px] -bottom-[6px] w-px bg-line-strong" />
                    )}
                    <a
                      href={`#stop-${plan.merchant_id}`}
                      className="group relative flex items-center gap-3 py-2 -mx-2 px-2 rounded-control hover:bg-surface-2 transition-colors"
                    >
                      <StopBadge n={i + 1} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink truncate transition-colors group-hover:text-accent-dark">
                          {plan.merchant_name}
                        </span>
                        <span className="block text-[11px] text-ink-muted">
                          <span className="font-mono tabular-nums">{plan.items.length}</span>{" "}
                          {plan.items.length === 1 ? "item" : "items"}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-sm font-semibold text-ink">
                        ${plan.subtotal.toFixed(2)}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}

            {missing.length > 0 && (
              <section className="px-5 py-4 border-t border-line">
                <h2 className="text-[13px] font-semibold text-ink-soft">Not in this plan</h2>
                <ul className="flex flex-wrap gap-2 mt-2">
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

          </div>
        </GlassCard>

        {/* ── Right panel: the list you shop from ──────────────────── */}
        <div className="min-w-0 wide:min-h-0 wide:overflow-y-auto wide:-mx-2 wide:px-2 wide:pb-2">
          {plans.length === 0 ? (
            <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-8 text-center`}>
              <p className="font-display text-ink text-base">Nothing priced yet</p>
              <Link
                href={`/list?trip=${encodeURIComponent(trip.id)}`}
                className={`${BTN_SECONDARY} inline-block mt-5`}
              >
                Open shopping trip →
              </Link>
            </GlassCard>
          ) : (
            <StoreSections plans={plans} />
          )}
        </div>
      </div>
    </main>
  );
}

function formatOptionSize(size: number | null | undefined, unit: string | null | undefined): string | null {
  if (!size || !unit) return null;
  if (size >= 1000) return `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)} ${unit === "g" ? "kg" : "L"}`;
  return `${size} ${unit}`;
}

type Swaps = {
  /** query → every cheap option for it (only queries with more than one). */
  options: Map<string, OptimizeOption[]>;
  picks: Record<string, number>;
  onPick: (query: string, itemId: number) => void;
};

/** The trip grouped by store — one card per stop, each item a row with
 *  its photo, full name and size. Shared by this page and the trip
 *  planner; the planner passes `swaps`, which adds a Swap toggle whose
 *  alternatives open right under the item they'd replace. */
export function StoreSections({ plans, swaps }: { plans: StorePlan[]; swaps?: Swaps }) {
  // Keyed by query, not by store: a swap can move an item to another
  // store's card, and its open panel should move with it.
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (query: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(query)) next.delete(query);
      else next.add(query);
      return next;
    });

  return (
    <div className="space-y-5">
      {plans.map((plan, i) => (
        <GlassCard key={plan.merchant_id} surfaceClassName={`${GLASS_SURFACE_DENSE} p-0 overflow-hidden`}>
          <section id={`stop-${plan.merchant_id}`} aria-label={plan.merchant_name} className="scroll-mt-2">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line">
              <div className="min-w-0 flex items-center gap-3">
                <StopBadge n={i + 1} />
                <div className="min-w-0">
                  <h2 className="font-display text-[19px] text-ink leading-tight">{plan.merchant_name}</h2>
                  <p className="text-[12px] text-ink-muted mt-0.5">
                    <span className="font-mono tabular-nums">{plan.items.length}</span>{" "}
                    {plan.items.length === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
              <span className="font-mono tabular-nums font-semibold text-ink text-[17px] shrink-0">
                ${plan.subtotal.toFixed(2)}
              </span>
            </div>

            <ul className="divide-y divide-line">
              {plan.items.map((item) => {
                const options = swaps?.options.get(item.query);
                const isOpen = !!options && open.has(item.query);
                const size = formatOptionSize(item.size, item.size_unit);
                // "<product> for <query>" earns its place when the
                // optimiser picked something you didn't literally ask
                // for ("Burnbrae Omega-3 Eggs for eggs"). An item added
                // from a deal card carries the product's own name as
                // its query, so the same template restates it:
                // "Green Cabbage for Green Cabbage".
                const echoesName =
                  item.name.trim().toLowerCase() === item.query.trim().toLowerCase();
                return (
                  // Keyed by query: two queries ("milk", "2% milk") can
                  // land on the same deal, so item_id isn't unique here.
                  <li key={item.query} className="px-5 py-3">
                    <div className="flex items-center gap-3.5">
                      <Link href={`/item/${item.item_id}`} className="group flex items-center gap-3.5 min-w-0 flex-1">
                        <Thumb src={item.product_image} />
                        <div className="min-w-0 flex-1">
                          <span className="block font-display text-[15px] leading-snug text-ink transition-colors group-hover:text-accent-dark">
                            {item.name}
                          </span>
                          {(!echoesName || size) && (
                            <span className="block text-[12px] text-ink-muted mt-1">
                              {!echoesName && (
                                <>
                                  for <span className="capitalize">{item.query}</span>
                                </>
                              )}
                              {size ? (echoesName ? size : ` · ${size}`) : ""}
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <span className="font-mono tabular-nums font-semibold text-ink">${item.price.toFixed(2)}</span>
                        {options && (
                          <button
                            type="button"
                            onClick={() => toggle(item.query)}
                            aria-expanded={isOpen}
                            className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-soft hover:text-accent transition-colors"
                          >
                            Swap · <span className="font-mono tabular-nums">{options.length - 1}</span>
                            <svg
                              aria-hidden
                              viewBox="0 0 16 16"
                              className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="m4 6 4 4 4-4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {isOpen && swaps && (
                      <ul className="animate-in grid grid-cols-1 sm:grid-cols-2 ultra:grid-cols-3 gap-2 mt-3 pl-[78px] max-sm:pl-0">
                        {options.map((row) => {
                          const selected = swaps.picks[item.query] === row.item_id;
                          const size = formatOptionSize(row.size, row.size_unit);
                          return (
                            <li key={row.item_id}>
                              {/* The same card as the item rows — photo,
                                  full name, meta, price — just smaller.
                                  Selected is the accent TINT, not a filled
                                  accent block: the border does the selecting. */}
                              <button
                                type="button"
                                onClick={() => swaps.onPick(item.query, row.item_id)}
                                title={row.name}
                                aria-pressed={selected}
                                className={`group w-full h-full flex items-center gap-3 p-2.5 text-left rounded-card border shadow-soft transition-colors ${
                                  selected ? "bg-accent-soft border-accent" : "bg-surface border-line hover:border-line-strong"
                                }`}
                              >
                                <Thumb src={row.product_image} size="sm" />
                                <span className="min-w-0 flex-1">
                                  <span className="block font-display text-[13px] leading-snug text-ink line-clamp-2 transition-colors group-hover:text-accent-dark">
                                    {row.name}
                                  </span>
                                  <span className={`block text-[11px] mt-0.5 truncate ${selected ? "text-ink-soft" : "text-ink-muted"}`}>
                                    {row.merchant_name}
                                    {size ? ` · ${size}` : ""}
                                  </span>
                                </span>
                                <span className={`font-mono tabular-nums text-[13px] font-semibold shrink-0 ${selected ? "text-accent-dark" : "text-ink"}`}>
                                  ${row.price.toFixed(2)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </GlassCard>
      ))}
    </div>
  );
}

/** A stop's number, the same mark on the route and on its store card so
 *  the two read as one thing. */
function StopBadge({ n }: { n: number }) {
  return (
    <span className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-pill bg-accent text-white font-mono tabular-nums text-[12px] font-semibold shadow-soft">
      {n}
    </span>
  );
}

/** Square product thumb. Same "placeholder underneath, hide a broken
 *  img on error" trick DealCard's image well uses, so a missing photo
 *  and a dead URL land in the same place and rows keep one height. */
function Thumb({ src, size = "md" }: { src?: string | null; size?: "sm" | "md" }) {
  return (
    <span className={`relative shrink-0 ${size === "sm" ? "w-12 h-12" : "w-16 h-16"} rounded-control bg-surface-2 overflow-hidden`}>
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
