"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BTN_CART_ADD } from "@/lib/button";
import { useCart, type CartEntry } from "@/lib/cart";
import { formatSavedDate, usePlans, type SavedPlan } from "@/lib/plans";
import { useToast } from "@/lib/toast";
import CartGlyph from "./CartGlyph";

const SEEDS = ["milk", "eggs", "bread", "chicken", "bananas", "coffee"];

function EntryRow({ entry }: { entry: CartEntry }) {
  const { remove, restore, closeDrawer } = useCart();
  const { toast } = useToast();

  const onRemove = () => {
    const removed = remove(entry.query);
    if (removed) {
      toast(`Removed "${removed.label}"`, {
        action: { label: "Undo", onClick: () => restore(removed) },
      });
    }
  };

  return (
    <li className="flex items-center gap-3 px-5 py-2.5 hover:bg-card transition-colors group">
      {entry.source?.image ? (
        <img
          src={entry.source.image}
          alt=""
          className="w-10 h-10 object-contain bg-card border-2 border-ink/20 shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
        />
      ) : (
        <span className="w-10 h-10 bg-card border-2 border-ink/20 flex items-center justify-center text-ink-soft/40 shrink-0">
          <CartGlyph className="w-4 h-4" />
        </span>
      )}

      <div className="flex-1 min-w-0">
        {entry.source ? (
          <Link
            href={`/item/${entry.source.itemId}`}
            onClick={closeDrawer}
            className="block text-sm text-ink font-medium capitalize truncate hover:text-sale transition-colors"
            title={entry.label}
          >
            {entry.label}
          </Link>
        ) : (
          <span className="block text-sm text-ink font-medium capitalize truncate" title={entry.label}>
            {entry.label}
          </span>
        )}
        {entry.source && (
          <span className="block font-mono text-[11px] text-ink-soft/80 truncate">
            {entry.source.merchantName} · ${entry.source.price.toFixed(2)} when added
          </span>
        )}
      </div>

      <button
        onClick={onRemove}
        aria-label={`Remove ${entry.label}`}
        className="text-ink-soft/50 hover:text-sale text-lg leading-none px-1.5 py-1 transition-colors shrink-0"
      >
        ×
      </button>
    </li>
  );
}

/** A saved plan's compact row — name (or a fallback) with its date always
 *  shown alongside, never replaced by it; the date is metadata for
 *  tracking, not part of the name. Clicking the row hands off to /list,
 *  which has the room for the actual receipts and is where "Use this
 *  plan" already needs to trigger a fresh optimize call anyway. */
function PlanRow({ plan }: { plan: SavedPlan }) {
  const { removePlan, restorePlan } = usePlans();
  const { toast } = useToast();
  const { closeDrawer } = useCart();
  const router = useRouter();

  const onRemove = () => {
    const removed = removePlan(plan.id);
    if (removed) {
      toast(`Removed "${removed.name ?? "saved plan"}"`, {
        action: { label: "Undo", onClick: () => restorePlan(removed) },
      });
    }
  };

  return (
    <li className="flex items-center gap-3 px-5 py-2.5 hover:bg-card transition-colors group">
      <button
        onClick={() => {
          closeDrawer();
          router.push("/list");
        }}
        className="flex-1 min-w-0 text-left group/plan"
      >
        <span className="block text-sm text-ink font-medium truncate group-hover/plan:text-sale transition-colors">
          {plan.name ?? "Untitled plan"}
          <span className="font-mono text-[11px] text-ink-soft font-normal ml-1.5">
            {formatSavedDate(plan.updatedAt)}
          </span>
        </span>
        <span className="block font-mono text-[11px] text-ink-soft/80 truncate">
          {plan.itemCount} {plan.itemCount === 1 ? "item" : "items"} · ${plan.totalCost.toFixed(2)}
        </span>
      </button>

      <button
        onClick={onRemove}
        aria-label={`Remove saved plan ${plan.name ?? "untitled"}`}
        className="text-ink-soft/50 hover:text-sale text-lg leading-none px-1.5 py-1 transition-colors shrink-0"
      >
        ×
      </button>
    </li>
  );
}

/**
 * Slide-over grocery list panel: right-side drawer over a dimmed
 * backdrop. Rendered once in the layout so it's available on every
 * route. Focus is trapped while open and returned to the opener on
 * close; Esc / backdrop / ✕ all close it; body scroll locks.
 */
export default function CartDrawer() {
  const { entries, isDrawerOpen, closeDrawer, add, clear, restore } = useCart();
  const { plans: savedPlans } = usePlans();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus trap + Esc + scroll lock while open; restore focus on close.
  useEffect(() => {
    if (!isDrawerOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    };
  }, [isDrawerOpen, closeDrawer]);

  // Rough total from entries that carry a known deal price.
  const estimate = useMemo(() => {
    const priced = entries.filter((e) => e.source);
    const total = priced.reduce((sum, e) => sum + (e.source?.price ?? 0), 0);
    return { total: Math.round(total * 100) / 100, priced: priced.length };
  }, [entries]);

  const onClearAll = () => {
    const removed = clear();
    if (removed.length > 0) {
      toast(`Cleared ${removed.length} ${removed.length === 1 ? "item" : "items"}`, {
        action: { label: "Undo", onClick: () => restore(removed) },
      });
    }
  };

  if (!isDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="animate-overlay absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={closeDrawer}
        aria-hidden
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your grocery list"
        tabIndex={-1}
        className="animate-drawer absolute right-0 top-0 h-full w-full max-w-md bg-paper border-l-2 border-ink flex flex-col outline-none"
      >
        {/* Header — solid ink band, knockout text */}
        <div className="flex items-center justify-between px-5 h-14 bg-produce text-paper shrink-0">
          <div className="flex items-center gap-2.5">
            <CartGlyph className="w-5 h-5 text-tag" />
            <span className="font-display text-sm tracking-wide">
              Your grocery list
            </span>
            {entries.length > 0 && (
              <span className="font-mono font-bold text-[11px] text-tag">
                ×{entries.length}
              </span>
            )}
          </div>
          <button
            onClick={closeDrawer}
            aria-label="Close grocery list"
            className="text-paper/60 hover:text-paper text-2xl leading-none px-2 py-1 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Items (scrolls independently) */}
        {entries.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <span className="text-4xl mb-3" aria-hidden>🧾</span>
            <p className="font-display font-bold text-ink">Your list is empty</p>
            <p className="text-ink-soft text-sm mt-1 mb-5">
              Hit the <CartGlyph className="w-3.5 h-3.5 inline align-[-2px]" /> button on any
              deal, or quick-add a staple:
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => add(s)}
                  className="text-[12px] px-2.5 py-1 rounded-full border border-border-tan text-ink-soft hover:border-ink hover:text-ink transition-colors capitalize"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto py-2 divide-y divide-border-tan/40">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {/* Saved plans */}
        {savedPlans.length > 0 && (
          <div className="shrink-0 border-t-2 border-ink/15">
            <p className="font-mono font-bold text-[11px] uppercase tracking-[0.1em] text-ink-soft px-5 pt-3">
              Saved plans ({savedPlans.length})
            </p>
            <ul className="max-h-40 overflow-y-auto py-1 divide-y divide-border-tan/40">
              {savedPlans.map((plan) => (
                <PlanRow key={plan.id} plan={plan} />
              ))}
            </ul>
          </div>
        )}

        {/* Quick add */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) {
              add(draft);
              setDraft("");
            }
          }}
          className="flex gap-2 px-5 py-3 border-t-2 border-ink/15 shrink-0"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="QUICK ADD — e.g. eggs"
            className="flex-1 bg-card border-2 border-ink px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
          />
          <button type="submit" className={BTN_CART_ADD}>
            Add
          </button>
        </form>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t-2 border-ink bg-card shrink-0">
          <div className="flex items-baseline justify-between mb-3">
            {estimate.priced > 0 ? (
              <span className="font-mono text-[12px] text-ink-soft">
                ~<span className="text-ink font-bold text-base">${estimate.total.toFixed(2)}</span>{" "}
                from {estimate.priced} priced {estimate.priced === 1 ? "item" : "items"}
              </span>
            ) : (
              <span className="font-mono text-[12px] text-ink-soft/70">
                Plan a trip to price your list
              </span>
            )}
            {entries.length > 0 && (
              <button
                onClick={onClearAll}
                className="font-mono font-bold text-[11px] uppercase text-ink-soft/70 hover:text-sale transition-colors"
              >
                clear all
              </button>
            )}
          </div>
          <Link
            href="/list"
            onClick={closeDrawer}
            aria-disabled={entries.length === 0}
            className={`block text-center font-display py-3 transition-colors ${
              entries.length === 0
                ? "bg-ink/10 text-ink-soft/50 pointer-events-none border-2 border-ink/10"
                : "btn-brut-ink bg-sale text-paper hover:bg-produce"
            }`}
          >
            Plan my trip →
          </Link>
        </div>
      </div>
    </div>
  );
}
