"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHIP_ARROW, CHIP_QUIET_LIGHT, CHIP_SOFT } from "@/lib/chip";
import { BTN_CART_ADD } from "@/lib/button";
import { useDialogFocus } from "@/lib/hooks";
import { tripName, useCart, useTrips, type CartEntry } from "@/lib/trips";
import { useToast } from "@/lib/toast";
import CartGlyph from "./CartGlyph";
import { IconReceipt } from "@/components/icons";

const SEEDS = ["milk", "eggs", "bread", "chicken", "bananas", "coffee"];

/** The drawer's one quiet ✕/remove affordance — shared by both row
 *  types and the panel header so they can't drift apart. */
const DISMISS =
  "text-ink-muted hover:text-danger text-lg leading-none px-1.5 py-1 rounded-control transition-colors shrink-0";

/** A list row's thumbnail slot. Hairline + soft-tinted fill, not the
 *  old 2px ink frame. */
const THUMB =
  "w-10 h-10 shrink-0 rounded-control border border-line bg-surface-2 object-contain";

/** Section label inside the drawer — sentence case, same tier as the
 *  deals rail's section headings. */
const PANEL_LABEL = "text-[13px] font-semibold text-ink";

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
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors">
      {entry.source?.image ? (
        <img
          src={entry.source.image}
          alt=""
          className={THUMB}
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
        />
      ) : (
        <span className={`${THUMB} flex items-center justify-center text-ink-muted`}>
          <CartGlyph className="w-4 h-4" />
        </span>
      )}

      <div className="flex-1 min-w-0">
        {entry.source ? (
          <Link
            href={`/item/${entry.source.itemId}`}
            onClick={closeDrawer}
            className="block text-sm text-ink font-medium capitalize truncate hover:text-accent transition-colors"
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
          <span className="block text-[12px] text-ink-muted truncate">
            {entry.source.merchantName} ·{" "}
            <span className="font-mono tabular-nums">${entry.source.price.toFixed(2)}</span> when added
          </span>
        )}
      </div>

      <button onClick={onRemove} aria-label={`Remove ${entry.label}`} className={DISMISS}>
        ×
      </button>
    </li>
  );
}

/**
 * The drawer's title: which trip this list is. A menu, not a label —
 * switching here sets the active trip, so it's also where deal adds go
 * from now on. The full trip management (rename, remove, receipts)
 * lives on /list; this is just "which one, or a new one".
 */
function TripSwitcher() {
  const { trips, activeTrip, setActiveTrip, createTrip } = useTrips();
  const { closeDrawer } = useCart();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-away closes the menu (Esc is the drawer's own close).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setNaming(false);
    setName("");
  };

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 min-w-0 rounded-control px-1.5 py-1 -mx-1.5 hover:bg-surface-2 transition-colors"
      >
        <span className="font-display text-[15px] text-ink truncate">
          {activeTrip ? tripName(activeTrip) : "Your grocery list"}
        </span>
        <svg aria-hidden viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5 8 10.5 12 6.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-in absolute left-0 top-full mt-1.5 z-10 w-72 max-w-[80vw] rounded-card bg-surface border border-line shadow-soft-lg overflow-hidden"
        >
          <p className="px-4 pt-3 pb-1.5 text-[12px] text-ink-muted">Adding items to…</p>
          {trips.length > 0 && (
            <ul className="max-h-60 overflow-y-auto divide-y divide-line border-y border-line">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <button
                    role="menuitemradio"
                    aria-checked={trip.id === activeTrip?.id}
                    onClick={() => {
                      setActiveTrip(trip.id);
                      close();
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-2 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink truncate">{tripName(trip)}</span>
                      <span className="block text-[12px] text-ink-muted">
                        <span className="font-mono tabular-nums">{trip.items.length}</span>{" "}
                        {trip.items.length === 1 ? "item" : "items"}
                      </span>
                    </span>
                    {trip.id === activeTrip?.id && <span aria-hidden className="text-accent text-sm">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-2.5">
            {naming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setActiveTrip(createTrip(name).id);
                  close();
                }}
                className="flex gap-2"
              >
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name it (optional)"
                  aria-label="New shopping trip name"
                  autoFocus
                  className="flex-1 min-w-0 rounded-control bg-surface border border-line px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none transition-colors"
                />
                <button type="submit" className={BTN_CART_ADD}>
                  Create
                </button>
              </form>
            ) : (
              /* Two real chips that split the row evenly, not two runs of
                 bold green text. At this panel's width the old pair wrapped
                 mid-phrase into ragged lines and neither read as pressable;
                 `flex-1` + `basis-0` makes them equal halves at any width. */
              <div className="flex items-stretch gap-2">
                <button
                  onClick={() => setNaming(true)}
                  className={`${CHIP_SOFT} flex-1 basis-0 ${CHIP_QUIET_LIGHT}`}
                >
                  <span aria-hidden>+</span> New trip
                </button>
                {trips.length > 0 && (
                  <Link
                    href="/list"
                    onClick={closeDrawer}
                    className={`group ${CHIP_SOFT} flex-1 basis-0 ${CHIP_QUIET_LIGHT}`}
                  >
                    All trips
                    <span aria-hidden className={CHIP_ARROW}>→</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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
  const { activeTrip } = useTrips();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus trap + Esc + scroll lock while open; restore focus on close.
  useDialogFocus(panelRef, isDrawerOpen, closeDrawer);

  // The trip's own planned total — the same number the trip page shows —
  // and only while its receipts still cover every item on the list.
  const pricedTotal = useMemo(() => {
    if (!activeTrip || activeTrip.items.length === 0) return null;
    const planned = new Set(activeTrip.plans.flatMap((p) => p.items.map((i) => i.query)));
    const covered = activeTrip.items.length === planned.size && activeTrip.items.every((i) => planned.has(i.query));
    return covered ? activeTrip.totalCost : null;
  }, [activeTrip]);

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
      {/* Backdrop — a soft dim, no blur. The panel is opaque white now,
          so there is nothing for a blur to help read against. */}
      <div
        className="animate-overlay absolute inset-0 bg-ink/30"
        onClick={closeDrawer}
        aria-hidden
      />

      {/* Panel — white, a diffuse shadow, and a 14px radius on the
          LEADING edge only: the other three sit flush against the
          viewport, and rounding an edge that's off-screen just crops
          content. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your grocery list"
        tabIndex={-1}
        className="animate-drawer absolute right-0 top-0 h-full w-full max-w-md bg-surface-3 rounded-l-card shadow-soft-lg flex flex-col outline-none overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 shrink-0 bg-surface border-b border-line">
          <div className="flex items-center gap-2.5 min-w-0">
            <CartGlyph className="w-5 h-5 text-accent shrink-0" />
            <TripSwitcher />
            {entries.length > 0 && (
              <span className="shrink-0 rounded-pill bg-accent-soft px-2 py-0.5 font-mono tabular-nums text-[11px] font-bold text-accent-dark">
                {entries.length}
              </span>
            )}
          </div>
          <button
            onClick={closeDrawer}
            aria-label="Close grocery list"
            className="text-ink-muted hover:text-ink text-2xl leading-none px-2 py-1 rounded-control transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body — a tinted well holding white cards, so the add box, the
            list and the footer read as separate things rather than one
            white sheet. Scrolls independently of header and footer. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                add(draft);
                setDraft("");
              }
            }}
            className="flex gap-2 p-3 rounded-card bg-surface border border-line shadow-soft"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add an item, e.g. eggs"
              aria-label="Quick add an item"
              /* min-w-0: a text input's default intrinsic width (~20ch)
                 ignores flex-shrink unless this is set — without it, on a
                 narrow drawer it refused to shrink and pushed the Add
                 button past the right edge. */
              className="flex-1 min-w-0 rounded-control bg-surface border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none transition-colors"
            />
            <button type="submit" className={BTN_CART_ADD}>
              Add
            </button>
          </form>

          <section className="rounded-card bg-surface border border-line shadow-soft overflow-hidden" aria-label="Items">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
              <h2 className={PANEL_LABEL}>
                Your list
                {entries.length > 0 && (
                  <span className="ml-1.5 font-mono tabular-nums text-ink-muted font-normal">{entries.length}</span>
                )}
              </h2>
              {entries.length > 0 && (
                <button
                  onClick={onClearAll}
                  className="text-[12px] font-medium text-ink-muted hover:text-danger transition-colors shrink-0"
                >
                  Clear all
                </button>
              )}
            </div>

            {entries.length === 0 ? (
              <div className="flex flex-col items-center text-center px-6 py-8">
                <IconReceipt size={30} className="mb-2 text-ink-muted" />
                <p className="text-sm text-ink-soft mb-4">Nothing on this list yet</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {SEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => add(s)}
                      className="text-[12px] font-medium px-2.5 py-1 rounded-pill border border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink transition-colors capitalize"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-4 border-t border-line bg-surface shrink-0">
          {pricedTotal !== null && (
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="text-[13px] font-semibold text-ink-soft">Estimated total</span>
              <span className="font-display text-2xl text-accent tabular-nums leading-none">${pricedTotal.toFixed(2)}</span>
            </div>
          )}
          {/* Straight into THIS trip on the planner, which prices itself. */}
          <Link
            href={activeTrip ? `/list?trip=${encodeURIComponent(activeTrip.id)}` : "/list"}
            onClick={closeDrawer}
            aria-disabled={entries.length === 0}
            className={`btn-brut-ink block text-center font-display text-[15px] py-3 rounded-control transition-colors ${
              entries.length === 0
                ? "bg-surface-3 text-ink-muted pointer-events-none shadow-none"
                : "bg-accent text-white hover:bg-accent-dark"
            }`}
          >
            Open shopping trip →
          </Link>
        </div>
      </div>
    </div>
  );
}
