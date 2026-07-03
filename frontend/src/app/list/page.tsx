"use client";

import Link from "next/link";
import { useState } from "react";
import type { OptimizeMode } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { useCart } from "@/lib/cart";
import { useOptimize } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import ReceiptCard from "@/components/ReceiptCard";
import CountUp from "@/components/CountUp";

const SEEDS = ["milk", "eggs", "bread", "chicken", "bananas", "coffee"];

const MODES: { id: OptimizeMode; label: string; blurb: string }[] = [
  { id: "cheapest", label: "Cheapest total", blurb: "Lowest price, even if it means more stops" },
  { id: "fewest", label: "Fewest stops", blurb: "Fewest stores to visit, then cheapest" },
];

function formatOptionSize(size: number | null, unit: string | null): string | null {
  if (!size || !unit) return null;
  if (size >= 1000) return `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)} ${unit === "g" ? "kg" : "L"}`;
  return `${size} ${unit}`;
}

export default function ListPage() {
  const { entries, add, remove, restore, clear } = useCart();
  const { user, merchantIds, loading: sessionLoading } = useAccount();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<OptimizeMode>("cheapest");
  const {
    result, loading, error, build, retry,
    picks, setPick, plans, totalCost, swappable,
  } = useOptimize();

  function onRemove(query: string) {
    const removed = remove(query);
    if (removed) {
      toast(`Removed "${removed.label}"`, {
        action: { label: "Undo", onClick: () => restore(removed) },
      });
    }
  }

  function onClearAll() {
    const removed = clear();
    if (removed.length > 0) {
      toast(`Cleared ${removed.length} ${removed.length === 1 ? "item" : "items"}`, {
        action: { label: "Undo", onClick: () => restore(removed) },
      });
    }
  }

  const modeIndex = MODES.findIndex((m) => m.id === mode);
  // A signed-in account with zero stores gets NO trip planning against
  // the example set — same rule as the deals grid. Anonymous visitors
  // still get the example area, with a nudge to sign up.
  const isSignedInNoStores = !!user && !merchantIds;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <span className="sticker text-[11px] text-ink">Plan a trip</span>
        <h1 className="font-display text-4xl sm:text-5xl text-ink leading-[0.95] mt-3">
          Build your list,{" "}
          <span className="inline-block text-paper bg-produce px-2 rotate-1">we&apos;ll route the cart</span>
        </h1>
        <p className="text-ink-soft mt-3 max-w-xl font-medium">
          Add what you need — here or straight from any deal card. Your list sticks around in this browser. We check every flyer, pick the cheapest spot for each item, and let you swap any pick.
        </p>
      </header>

      {/* A real account never plans against the example set — trip
          building is disabled below until stores are picked. Anonymous
          visitors still get the example area, same as the deals grid. */}
      {!sessionLoading && !merchantIds && (
        <div className="brut bg-tag/30 px-4 py-3 mb-8 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[13px] text-ink">
            <span className="font-mono font-bold uppercase tracking-[0.1em] mr-2">
              {user ? "No stores yet" : "Example data"}
            </span>
            {user
              ? "Your account isn't tracking any stores — pick your stores to plan a trip."
              : "Trips route through our default area's stores — sign in to plan against the stores near you."}
          </p>
          <Link
            href={user ? "/settings" : "/login"}
            className="btn-brut px-3.5 py-1.5 bg-sale-dark text-paper font-mono font-bold text-[12px] uppercase shrink-0"
          >
            {user ? "Pick my stores →" : "Sign in →"}
          </Link>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] gap-8">
        {/* ── Builder ──────────────────────────────────────────── */}
        <section className="lg:sticky lg:top-20 lg:self-start">
          <div className="brut p-5">
            <div className="flex items-baseline justify-between mb-2">
              <label className="font-display text-ink text-sm">
                Your list
              </label>
              {entries.length > 0 && (
                <button
                  onClick={onClearAll}
                  className="text-[11px] font-mono font-bold uppercase text-ink-soft/70 hover:text-sale transition-colors"
                >
                  clear all
                </button>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) {
                  add(draft);
                  setDraft("");
                }
              }}
              className="flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="ADD AN ITEM…"
                className="flex-1 min-w-0 bg-paper border-2 border-ink px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
              />
              <button
                type="submit"
                className="btn-brut px-3 py-2 bg-ink text-paper text-sm font-mono font-bold"
              >
                Add
              </button>
            </form>

            {entries.length === 0 ? (
              <div className="mt-4">
                <p className="text-[12px] text-ink-soft mb-2">Quick add:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => add(s)}
                      className="text-[12px] font-mono font-bold px-2.5 py-1 border-2 border-ink/25 text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/40 transition-all capitalize"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {entries.map((entry, i) => (
                  <li
                    key={entry.id}
                    className="animate-in flex items-center justify-between gap-2 bg-paper border-2 border-ink px-3 py-1.5 group"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="min-w-0">
                      <span className="block text-sm text-ink capitalize truncate" title={entry.label}>
                        {entry.label}
                      </span>
                      {entry.source && (
                        <span className="block font-mono text-[10px] text-ink-soft/70 truncate">
                          {entry.source.merchantName} · ${entry.source.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onRemove(entry.query)}
                      aria-label={`Remove ${entry.label}`}
                      className="text-ink-soft/60 hover:text-sale text-lg leading-none transition-colors shrink-0"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Mode toggle — sliding segmented control */}
            <div className="mt-5">
              <div className="relative flex bg-paper border-2 border-ink p-1">
                <span
                  className="absolute top-1 bottom-1 bg-ink transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
                  style={{
                    width: `calc(${100 / MODES.length}% - 4px)`,
                    transform: `translateX(calc(${modeIndex * 100}% + ${modeIndex * 4}px))`,
                  }}
                  aria-hidden
                />
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`relative z-10 flex-1 text-[12px] font-mono font-bold py-1.5 transition-colors ${
                      mode === m.id ? "text-paper" : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-mono text-ink-soft mt-1.5 px-1">
                {MODES[modeIndex].blurb}
              </p>
            </div>

            <button
              onClick={() => build(entries.map((e) => e.query), mode, merchantIds ?? undefined, user?.postal_code ?? undefined)}
              disabled={entries.length === 0 || loading || isSignedInNoStores}
              className="btn-brut mt-5 w-full bg-sale-dark text-paper font-display py-3 hover:bg-produce transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading ? "Ringing it up…" : isSignedInNoStores ? "Pick your stores first" : "Build my trip"}
            </button>
            {merchantIds && user && (
              <p className="font-mono text-[10px] text-ink-soft mt-2 text-center">
                only checking {user.name}&apos;s {merchantIds.length} {merchantIds.length === 1 ? "store" : "stores"}
              </p>
            )}
          </div>
        </section>

        {/* ── Results ──────────────────────────────────────────── */}
        <section>
          {error && (
            <div className="border-2 border-sale bg-sale/10 shadow-[4px_4px_0_var(--color-sale)] p-6 text-center">
              <p className="stamp text-sale-dark text-sm">Trip planner unavailable</p>
              <p className="text-ink-soft text-sm mt-3">
                We couldn&apos;t build your trip right now — give it another try.
              </p>
              <button
                onClick={retry}
                className="btn-brut mt-4 px-4 py-2 bg-ink text-paper text-sm font-mono font-bold"
              >
                Retry
              </button>
            </div>
          )}

          {!error && !result && !loading && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center border-2 border-dashed border-ink/40 p-8">
              <span className="text-4xl mb-3" aria-hidden>🧾</span>
              <p className="font-display text-ink">No trip planned yet</p>
              <p className="text-ink-soft text-sm mt-1 max-w-xs">
                Add a few items and hit <span className="font-bold">Build my trip</span> — your receipts will print out here.
              </p>
            </div>
          )}

          {loading && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-ink-soft">
              <div className="font-mono text-sm animate-pulse">printing receipts…</div>
            </div>
          )}

          {result && !loading && (
            <div className="animate-in">
              {/* Summary stamp */}
              <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b-2 border-ink">
                <div>
                  <div className="font-mono font-bold text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                    Estimated total · {result.mode === "cheapest" ? "cheapest" : "fewest stops"}
                  </div>
                  <div className="font-display text-5xl text-ink leading-none mt-1 tabular-nums">
                    <CountUp value={totalCost} prefix="$" decimals={2} />
                  </div>
                  <div className="text-sm font-mono text-ink-soft mt-1.5">
                    across {plans.length} {plans.length === 1 ? "store" : "stores"}
                  </div>
                </div>
                <div
                  className="animate-stamp font-display text-produce border-[3px] border-produce px-3 py-1.5 text-center leading-none"
                  aria-hidden
                >
                  <div className="text-[10px] tracking-widest">PLAN</div>
                  <div className="text-xl">{plans.length}🛒</div>
                </div>
              </div>

              {plans.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-x-5 gap-y-8 items-start">
                  {plans.map((plan, i) => (
                    <ReceiptCard key={plan.merchant_id} plan={plan} index={i} />
                  ))}
                </div>
              )}

              {/* Swap panel — the other cheap options per list item */}
              {swappable.length > 0 && (
                <div className="mt-10">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-display text-ink text-lg">Swap your picks</h2>
                    <div className="tear-line flex-1" />
                  </div>
                  <div className="space-y-4">
                    {swappable.map(([query, rows]) => (
                      <div key={query}>
                        <p className="font-mono font-bold text-[11px] uppercase tracking-[0.15em] text-ink mb-1.5 capitalize">
                          ▸ {query}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {rows.map((row) => {
                            const selected = picks[query] === row.item_id;
                            const size = formatOptionSize(row.size, row.size_unit);
                            return (
                              <button
                                key={row.item_id}
                                onClick={() => setPick(query, row.item_id)}
                                title={row.name}
                                className={`text-left text-[12px] px-2.5 py-1.5 border-2 transition-all max-w-full ${
                                  selected
                                    ? "bg-ink text-paper border-ink shadow-[3px_3px_0_var(--color-tag)]"
                                    : "bg-card border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
                                }`}
                              >
                                <span className="font-medium truncate inline-block max-w-[220px] align-bottom">
                                  {row.name}
                                </span>
                                <span className={`font-mono ml-2 ${selected ? "text-tag" : "text-ink"}`}>
                                  ${row.price.toFixed(2)}
                                </span>
                                <span className={`block font-mono text-[10px] mt-0.5 ${selected ? "text-paper/70" : "text-ink-soft/70"}`}>
                                  {row.merchant_name}
                                  {size ? ` · ${size}` : ""}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.unmatched.length > 0 && (
                <div className="mt-8 bg-tag/25 border-2 border-ink shadow-[3px_3px_0_var(--color-ink)] px-4 py-3">
                  <p className="font-display text-ink text-sm">
                    Couldn&apos;t find a deal for:
                  </p>
                  <p className="text-ink-soft text-sm mt-0.5 capitalize">
                    {result.unmatched.join(", ")}
                  </p>
                  <p className="text-[12px] text-ink-soft/80 mt-1">
                    These aren&apos;t on sale anywhere we track this week — or try a simpler word.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
