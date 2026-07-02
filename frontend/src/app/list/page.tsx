"use client";

import { useState } from "react";
import {
  optimizeTrip,
  type OptimizeMode,
  type OptimizeResult,
} from "@/lib/api";
import ReceiptCard from "@/components/ReceiptCard";
import CountUp from "@/components/CountUp";

const SEEDS = ["milk", "eggs", "bread", "chicken", "bananas", "coffee"];

const MODES: { id: OptimizeMode; label: string; blurb: string }[] = [
  { id: "cheapest", label: "Cheapest total", blurb: "Lowest price, even if it means more stops" },
  { id: "fewest", label: "Fewest stops", blurb: "Fewest stores to visit, then cheapest" },
];

export default function ListPage() {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<OptimizeMode>("cheapest");
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  function addItem(raw: string) {
    const value = raw.trim().toLowerCase();
    if (!value || items.includes(value)) {
      setDraft("");
      return;
    }
    setItems((prev) => [...prev, value]);
    setDraft("");
  }

  function removeItem(value: string) {
    setItems((prev) => prev.filter((i) => i !== value));
  }

  async function buildTrip() {
    if (items.length === 0) return;
    setLoading(true);
    setError(false);
    try {
      const res = await optimizeTrip(items, mode);
      setResult(res);
    } catch {
      setError(true);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const modeIndex = MODES.findIndex((m) => m.id === mode);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sale mb-1">
          Plan a trip
        </p>
        <h1 className="font-display font-black text-4xl text-ink tracking-tight leading-none">
          Build your list, we&apos;ll route the cart
        </h1>
        <p className="text-ink-soft mt-2">
          Add what you need. We check every flyer and tell you exactly which store has each item cheapest — or how to grab everything in the fewest stops.
        </p>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] gap-8">
        {/* ── Builder ──────────────────────────────────────────── */}
        <section className="lg:sticky lg:top-20 lg:self-start">
          <div className="bg-card border border-border-tan rounded-sm p-5">
            <label className="block font-display font-bold text-ink text-sm mb-2">
              Your list
            </label>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addItem(draft);
              }}
              className="flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add an item…"
                className="flex-1 bg-paper border border-border-tan rounded-sm px-3 py-2 text-ink placeholder:text-ink-soft/70 focus:border-sale outline-none text-sm"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-ink text-paper rounded-sm text-sm font-medium hover:bg-ink/90 active:scale-95 transition-transform"
              >
                Add
              </button>
            </form>

            {items.length === 0 ? (
              <div className="mt-4">
                <p className="text-[12px] text-ink-soft mb-2">Quick add:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => addItem(s)}
                      className="text-[12px] px-2.5 py-1 rounded-full border border-border-tan text-ink-soft hover:border-ink hover:text-ink transition-colors capitalize"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {items.map((item, i) => (
                  <li
                    key={item}
                    className="animate-in flex items-center justify-between bg-paper border border-border-tan rounded-sm px-3 py-1.5 group"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <span className="text-sm text-ink capitalize">{item}</span>
                    <button
                      onClick={() => removeItem(item)}
                      aria-label={`Remove ${item}`}
                      className="text-ink-soft/60 hover:text-sale text-lg leading-none transition-colors"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Mode toggle — sliding segmented control */}
            <div className="mt-5">
              <div className="relative flex bg-paper border border-border-tan rounded-sm p-1">
                <span
                  className="absolute top-1 bottom-1 rounded-sm bg-ink transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
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
                    className={`relative z-10 flex-1 text-[12px] font-medium py-1.5 rounded-sm transition-colors ${
                      mode === m.id ? "text-paper" : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-soft mt-1.5 px-1">
                {MODES[modeIndex].blurb}
              </p>
            </div>

            <button
              onClick={buildTrip}
              disabled={items.length === 0 || loading}
              className="mt-5 w-full bg-sale text-paper font-display font-bold py-2.5 rounded-sm shadow-[2px_3px_0_rgba(28,26,22,0.18)] hover:bg-sale-dark active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0"
            >
              {loading ? "Ringing it up…" : "Build my trip"}
            </button>
          </div>
        </section>

        {/* ── Results ──────────────────────────────────────────── */}
        <section>
          {error && (
            <p className="text-sale-dark">
              Couldn&apos;t reach the optimizer. Is the backend running on{" "}
              <code className="font-mono">localhost:8000</code>?
            </p>
          )}

          {!error && !result && !loading && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center border border-dashed border-border-tan rounded-sm p-8">
              <span className="text-4xl mb-3" aria-hidden>🧾</span>
              <p className="font-display font-bold text-ink">No trip planned yet</p>
              <p className="text-ink-soft text-sm mt-1 max-w-xs">
                Add a few items and hit <span className="font-medium">Build my trip</span> — your receipts will print out here.
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
              <div className="flex items-center justify-between gap-4 mb-6 pb-5 border-b border-border-tan">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                    Estimated total · {result.mode === "cheapest" ? "cheapest" : "fewest stops"}
                  </div>
                  <div className="font-display font-black text-4xl text-ink leading-none mt-1 tabular-nums">
                    <CountUp value={result.total_cost} prefix="$" decimals={2} />
                  </div>
                  <div className="text-sm text-ink-soft mt-1">
                    across {result.stops} {result.stops === 1 ? "store" : "stores"}
                  </div>
                </div>
                <div
                  className="animate-stamp font-display font-black text-produce border-2 border-produce rounded-sm px-3 py-1.5 text-center leading-none"
                  aria-hidden
                >
                  <div className="text-[10px] tracking-widest">PLAN</div>
                  <div className="text-xl">{result.stops}🛒</div>
                </div>
              </div>

              {result.store_plans.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-x-5 gap-y-8 items-start">
                  {result.store_plans.map((plan, i) => (
                    <ReceiptCard key={plan.merchant_id} plan={plan} index={i} />
                  ))}
                </div>
              )}

              {result.unmatched.length > 0 && (
                <div className="mt-8 bg-tag/15 border border-tag/50 rounded-sm px-4 py-3">
                  <p className="font-display font-bold text-ink text-sm">
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
