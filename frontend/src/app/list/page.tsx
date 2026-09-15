"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { OptimizeMode } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { BTN_FOLLOWUP_CTA, BTN_NUDGE_CTA, BTN_SECONDARY } from "@/lib/button";
import { CHIP_QUIET_LIGHT, CHIP_SOFT } from "@/lib/chip";
import { priceTrip, sourceDealsOf, useOptimize } from "@/lib/hooks";
import { formatSavedDate, tripName, useTrips, type Trip } from "@/lib/trips";
import { useToast } from "@/lib/toast";
import ActionCard from "@/components/ActionCard";
import BackLink from "@/components/BackLink";
import CountUp from "@/components/CountUp";
import GlassCard, { GLASS_SURFACE_DENSE, NUDGE_BANNER_SURFACE } from "@/components/GlassCard";
import TripShoppingList, { StoreSections } from "@/components/TripShoppingList";

const SEEDS = ["milk", "eggs", "bread", "chicken", "bananas", "coffee"];

const MODES: { id: OptimizeMode; label: string; blurb: string }[] = [
  { id: "cheapest", label: "Cheapest total", blurb: "Lowest price, even if it means more stops" },
  { id: "fewest", label: "Fewest stops", blurb: "Fewest stores to visit, then cheapest" },
];

/**
 * The trip planner, off one URL:
 *
 *   /list                 → your trips, plus New trip.
 *   /list?trip=<id>       → one trip: its items, how to shop, and the priced receipts.
 *   /list?trip=<id>&view=full → the same trip as a shopping list with photos.
 *   /list?trip=new        → creates an empty trip and replaces itself with its id.
 *
 * useSearchParams needs a Suspense boundary for static prerendering.
 */
export default function ListPage() {
  return (
    <Suspense fallback={null}>
      <Planner />
    </Suspense>
  );
}

function Planner() {
  const params = useSearchParams();
  const { stableKey } = useTrips();
  const tripParam = params.get("trip");

  // Checked before the planner: `?trip=<id>&view=full` carries both.
  if (tripParam && params.get("view") === "full") return <FullList tripParam={tripParam} />;
  if (tripParam) {
    // stableKey, not the raw param: a new trip's id changes from a
    // temporary one to the server's mid-edit, and that must not remount
    // the view (and drop a half-typed item) under someone's cursor.
    return <TripView key={tripParam === "new" ? "new" : stableKey(tripParam)} tripParam={tripParam} />;
  }
  return <MyTrips />;
}

// ── The full shopping list ────────────────────────────────────────────

/** Resolves `?trip=<id>&view=full` to a trip, with the same hydration /
 *  missing-trip handling TripView uses. The view itself is presentational. */
function FullList({ tripParam }: { tripParam: string }) {
  const { hydrated, getTrip } = useTrips();
  const trip = getTrip(tripParam);

  if (!hydrated) {
    return (
      <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16">
        <p className="text-sm text-ink-soft animate-pulse">Opening your shopping trip…</p>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16">
        <BackLink href="/list" label="Back" />
        <p className="text-ink mt-4">This shopping trip isn&apos;t here anymore.</p>
      </main>
    );
  }

  return <TripShoppingList trip={trip} />;
}

// ── Shared icons ──────────────────────────────────────────────────────

function TrashIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5" />
    </svg>
  );
}

/** Deletes a trip with an Undo toast — the same outcome from the trips
 *  list and from inside the trip. */
function useDeleteTrip() {
  const { removeTrip, restoreTrip } = useTrips();
  const { toast } = useToast();
  return (trip: Trip) => {
    const removed = removeTrip(trip.id);
    if (removed) {
      toast(`Deleted "${tripName(removed)}"`, {
        action: { label: "Undo", onClick: () => restoreTrip(removed) },
      });
    }
  };
}

// ── My trips ──────────────────────────────────────────────────────────

/** Whether a trip's saved receipts still cover exactly its items — false
 *  after an edit made somewhere other than the trip page (a deal card,
 *  the drawer), which doesn't re-price. */
function isPriced(trip: Trip) {
  const planned = new Set(trip.plans.flatMap((p) => p.items.map((i) => i.query)));
  return trip.items.length === planned.size && trip.items.every((i) => planned.has(i.query));
}

function MyTrips() {
  const { trips, activeTrip, hydrated, setActiveTrip, setTripPicks } = useTrips();
  const { user, merchantIds, loading: sessionLoading } = useAccount();
  const deleteTrip = useDeleteTrip();
  const [pricing, setPricing] = useState<Set<string>>(new Set());
  const attempted = useRef(new Set<string>());

  // Brings any trip edited elsewhere up to date, once per visit — a trip
  // with an item no store stocks never becomes "priced", so the ref
  // stops it being re-priced on every render.
  useEffect(() => {
    if (!hydrated || sessionLoading || (!!user && !merchantIds)) return;
    for (const trip of trips) {
      if (trip.items.length === 0 || isPriced(trip) || attempted.current.has(trip.id)) continue;
      attempted.current.add(trip.id);
      setPricing((cur) => new Set(cur).add(trip.id));
      priceTrip(trip.items, trip.mode, merchantIds ?? undefined, user?.postal_code ?? undefined)
        .then(({ picks, summary }) => setTripPicks(trip.id, picks, summary))
        .catch(() => {})
        .finally(() =>
          setPricing((cur) => {
            const next = new Set(cur);
            next.delete(trip.id);
            return next;
          }),
        );
    }
  }, [trips, hydrated, sessionLoading, user, merchantIds, setTripPicks]);

  return (
    // Past phone width the page is one fixed screen under the header:
    // the heading stays put and only the grid of trips scrolls, once
    // there are enough to fill it. Phones keep an ordinary page scroll.
    <main className="max-w-[1400px] mx-auto px-6 pt-8 pb-16 md:pb-6 md:h-[calc(100svh-var(--header-h))] md:flex md:flex-col md:overflow-hidden">
      <h1 className="shrink-0 font-display text-3xl text-ink leading-tight mb-6">Manage Shopping Trips</h1>

      {!hydrated ? (
        <p className="text-sm text-ink-soft animate-pulse">Loading your shopping trips…</p>
      ) : trips.length === 0 ? (
        <div className="max-w-md">
          <ActionCard href="/list?trip=new" icon="📝" title="New shopping trip" detail="Nothing saved yet." cta="Start →" />
        </div>
      ) : (
        <ul
          className="grid grid-cols-1 wide:grid-cols-2 ultra:grid-cols-3 content-start gap-3 md:flex-1 md:min-h-0 md:overflow-y-auto md:-mx-2 md:px-2 md:-mt-1 md:pt-1 md:pb-2"
          role="radiogroup"
          aria-label="Trip deals are added to"
        >
          {/* Starting a trip is the first tile, not a button off in the
              header — then every saved trip, newest first. */}
          <li>
            <Link
              href="/list?trip=new"
              className="group h-full min-h-[76px] flex items-center gap-4 rounded-card border border-dashed border-line-strong bg-surface/60 px-4 py-4 transition-colors hover:border-accent hover:bg-accent-soft"
            >
              <span
                aria-hidden
                className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-pill bg-accent text-white text-xl leading-none shadow-soft transition-transform group-hover:scale-105"
              >
                +
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[16px] text-ink group-hover:text-accent transition-colors">
                  New shopping trip
                </span>
                <span className="block text-[12px] text-ink-muted mt-1">Start an empty list</span>
              </span>
            </Link>
          </li>
          {[...trips].sort((a, b) => b.updatedAt - a.updatedAt).map((trip) => {
            const current = trip.id === activeTrip?.id;
            const busy = pricing.has(trip.id);
            return (
              <li
                key={trip.id}
                className={`animate-in flex items-center gap-1 min-h-[76px] rounded-card bg-surface border shadow-soft transition-colors hover:border-line-strong ${
                  current ? "border-accent ring-1 ring-accent" : "border-line"
                }`}
              >
                {/* Which trip the header cart — and every deal's add
                    button — fills. A radio, because it's one of many and
                    the header pill echoes the choice by name. */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={current}
                  onClick={() => setActiveTrip(trip.id)}
                  aria-label={`Add deals to ${tripName(trip)}`}
                  title={current ? "Deals add here" : "Add deals here"}
                  className="shrink-0 ml-4 w-5 h-5 inline-flex items-center justify-center rounded-full border-2 transition-colors border-line-strong hover:border-accent aria-checked:border-accent"
                >
                  {current && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
                </button>
                <Link href={`/list?trip=${encodeURIComponent(trip.id)}`} className="flex-1 min-w-0 pl-3 pr-2 py-4 group">
                  <span className="block font-display text-[16px] text-ink truncate group-hover:text-accent transition-colors">
                    {tripName(trip)}
                  </span>
                  <span className="block text-[12px] text-ink-muted mt-1">
                    {formatSavedDate(trip.updatedAt)} ·{" "}
                    <span className="font-mono tabular-nums">{trip.items.length}</span>{" "}
                    {trip.items.length === 1 ? "item" : "items"}
                    {busy ? (
                      <>
                        {" "}· <span className="inline-block w-20 h-3 align-middle rounded-pill bg-surface-3 animate-pulse" aria-label="Pricing" />
                      </>
                    ) : (
                      trip.stops > 0 &&
                      trip.items.length > 0 && (
                        <>
                          {" "}· <span className="font-mono tabular-nums">${trip.totalCost.toFixed(2)}</span> ·{" "}
                          <span className="font-mono tabular-nums">{trip.stops}</span>{" "}
                          {trip.stops === 1 ? "store" : "stores"}
                        </>
                      )
                    )}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => deleteTrip(trip)}
                  aria-label={`Delete ${tripName(trip)}`}
                  title="Delete"
                  className="shrink-0 w-9 h-9 mr-3 inline-flex items-center justify-center rounded-pill text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors"
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

// ── One trip ──────────────────────────────────────────────────────────

/** "Saved" beside the item count — lit up briefly after each change, so a
 *  save that has no button still visibly happens. */
function SavedMark({ updatedAt }: { updatedAt: number }) {
  const [fresh, setFresh] = useState(false);
  const first = useRef(updatedAt);
  useEffect(() => {
    if (updatedAt === first.current) return;
    setFresh(true);
    const t = setTimeout(() => setFresh(false), 1600);
    return () => clearTimeout(t);
  }, [updatedAt]);
  return (
    <span
      className={`inline-flex items-center gap-1 transition-colors duration-300 ${fresh ? "text-accent font-semibold" : "text-ink-muted"}`}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5 6.5 12 13 4.5" />
      </svg>
      Saved
    </span>
  );
}

function TripView({ tripParam }: { tripParam: string }) {
  const router = useRouter();
  const {
    hydrated, getTrip, createTrip, activeTrip, setActiveTrip,
    renameTrip, setTripMode, setTripPicks, addToTrip, removeFromTrip, restoreToTrip, clearTrip,
  } = useTrips();
  const { user, merchantIds, loading: sessionLoading } = useAccount();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const {
    result, loading, error, build, retry,
    picks, setPick, plans, totalCost, swappable,
  } = useOptimize();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const trip = tripParam === "new" ? null : getTrip(tripParam);

  // ── /list?trip=new → create, then stand on the new trip's own URL.
  // `replace`, so Back from the trip goes to where "New trip" was
  // pressed, not to a URL that would create yet another one. The ref
  // guards React's dev double-invoke.
  const created = useRef(false);
  useEffect(() => {
    if (tripParam !== "new" || !hydrated || created.current) return;
    created.current = true;
    const t = createTrip();
    setActiveTrip(t.id);
    router.replace(`/list?trip=${encodeURIComponent(t.id)}`);
  }, [tripParam, hydrated, createTrip, setActiveTrip, router]);

  // A temporary id in the URL is swapped for the server's once it's
  // back, so a reload still finds the trip. (Same component — see
  // Planner's stableKey.) Also drops the old one-shot `build` flag.
  useEffect(() => {
    if (!trip) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("trip") !== trip.id || url.searchParams.has("build")) {
      router.replace(`/list?trip=${encodeURIComponent(trip.id)}`);
    }
  }, [trip, router]);

  // Opening a trip is choosing it: deal adds go here from now on.
  const activated = useRef(false);
  useEffect(() => {
    if (!trip || activated.current) return;
    activated.current = true;
    if (activeTrip?.id !== trip.id) setActiveTrip(trip.id);
  }, [trip, activeTrip, setActiveTrip]);

  // A signed-in account with zero stores gets NO trip planning against
  // the example set — same rule as the deals grid. Anonymous visitors
  // still get the example area, with a nudge to sign up.
  const isSignedInNoStores = !!user && !merchantIds;
  const tripId = trip?.id ?? null;
  const mode = trip?.mode ?? "cheapest";

  // ── Pricing is automatic: any change to the items or the mode re-prices
  // the trip after a short pause, so the receipts are never out of date
  // and there is no build button to find. Saved picks (swaps) are kept,
  // unless the mode changed — keeping them would defeat switching to
  // "fewest stops".
  const lastBuiltMode = useRef<OptimizeMode | null>(null);
  const priceKey = trip ? `${trip.mode}|${trip.items.map((i) => i.query).join("\n")}` : "";
  useEffect(() => {
    if (!trip || sessionLoading || isSignedInNoStores) return;
    const t = trip;
    const timer = setTimeout(async () => {
      const keepPicks = lastBuiltMode.current === null || lastBuiltMode.current === t.mode;
      lastBuiltMode.current = t.mode;
      const preferred: Record<string, number> = {};
      if (keepPicks) for (const i of t.items) if (i.pick !== undefined) preferred[i.query] = i.pick;
      const { unavailableCount } = await build(
        t.items.map((i) => i.query), t.mode,
        merchantIds ?? undefined, user?.postal_code ?? undefined,
        preferred, sourceDealsOf(t.items),
      );
      if (unavailableCount > 0) {
        toast(
          `${unavailableCount} item${unavailableCount === 1 ? "" : "s"} ${unavailableCount === 1 ? "isn't" : "aren't"} on sale anymore — updated to today's best price.`,
        );
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey, tripId, sessionLoading, isSignedInNoStores]);

  // Every build and every swap is written back to the trip, so picks
  // survive a reload.
  useEffect(() => {
    if (!result || loading || !tripId) return;
    setTripPicks(tripId, picks, { totalCost, stops: plans.length, plans });
  }, [result, loading, picks, totalCost, plans, tripId, setTripPicks]);

  if (!hydrated || tripParam === "new") {
    return (
      <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16">
        <p className="text-sm text-ink-soft animate-pulse">Opening your shopping trip…</p>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16">
        <BackLink href="/list" label="Back" />
        <p className="text-ink mt-4">This shopping trip isn&apos;t here anymore.</p>
        <Link href="/list?trip=new" className={`${BTN_SECONDARY} inline-block mt-4`}>
          + New shopping trip
        </Link>
      </main>
    );
  }

  const entries = trip.items;
  const modeIndex = MODES.findIndex((m) => m.id === mode);
  const hasItems = entries.length > 0;
  const quickAdds = SEEDS.filter((s) => !entries.some((e) => e.query === s));
  // Only meaningful while the list has items — an emptied trip keeps
  // its last result around for the instant before it clears.
  const showResult = !!result && hasItems;

  function onRemove(query: string) {
    const removed = removeFromTrip(trip!.id, query);
    if (removed) {
      toast(`Removed "${removed.label}"`, {
        action: { label: "Undo", onClick: () => restoreToTrip(trip!.id, removed) },
      });
    }
  }

  function onClearAll() {
    const removed = clearTrip(trip!.id);
    if (removed.length > 0) {
      toast(`Cleared ${removed.length} ${removed.length === 1 ? "item" : "items"}`, {
        action: { label: "Undo", onClick: () => restoreToTrip(trip!.id, removed) },
      });
    }
  }

  function commitName(value: string) {
    const next = value.trim() || null;
    if (next !== trip!.name) renameTrip(trip!.id, next);
  }

  const quickAddChips = quickAdds.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {quickAdds.map((s) => (
        <button
          key={s}
          onClick={() => addToTrip(trip.id, s)}
          className={`${CHIP_SOFT} ${CHIP_QUIET_LIGHT} capitalize`}
        >
          + {s}
        </button>
      ))}
    </div>
  );

  return (
    // At `wide:` the trip is one fixed screen under the header, the way
    // /deals is (--header-h is SiteHeader's measured height): the page
    // itself never scrolls, only the store list on the right (and the
    // item list inside its card, once it outgrows it). Below `wide:` it
    // is one ordinary scrolling column in reading order.
    <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16 wide:pb-6 wide:h-[calc(100svh-var(--header-h))] wide:flex wide:flex-col wide:overflow-hidden">
      {/* ── Page header: the trip's name, and what you do with the plan ── */}
      <header className="shrink-0 mb-5">
        <BackLink href="/list" label="Back" />
        {/* The name row gets its own card, with the same inner padding as
            the panels below: floating on the page it had nothing visible to
            line up with. */}
        <GlassCard
          wrapperClassName="mt-2"
          surfaceClassName={`${GLASS_SURFACE_DENSE} px-5 py-3.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3`}
        >
          {/* The name IS the heading, editable in place — keyed on the
              saved name so a rename from elsewhere (another tab) shows up.
              Rename only: deleting a trip lives on the trips list. */}
          <div className="flex items-center gap-2 min-w-0">
            <input
              ref={nameInputRef}
              key={trip.name ?? ""}
              defaultValue={trip.name ?? ""}
              placeholder="Untitled shopping trip"
              aria-label="Shopping trip name"
              onBlur={(e) => commitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="min-w-0 max-w-full [field-sizing:content] bg-transparent font-display text-[26px] sm:text-[30px] text-ink leading-tight px-0 py-0.5 border-0 border-b-2 border-transparent hover:border-line-strong focus:border-accent focus-visible:outline-none! placeholder:text-ink-muted transition-colors"
            />
            <button
              type="button"
              onClick={() => {
                nameInputRef.current?.focus();
                nameInputRef.current?.select();
              }}
              aria-label="Rename this shopping trip"
              title="Rename"
              className="shrink-0 p-2 rounded-control text-ink-muted hover:text-accent hover:bg-surface-2 transition-colors"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.333 2 14 4.667l-8.5 8.5-3.417.917.917-3.417 8.333-8.334Z" />
              </svg>
            </button>
            <span className="shrink-0 text-[13px]">
              <SavedMark updatedAt={trip.updatedAt} />
            </span>
          </div>

          {hasItems && (
            <div className="flex gap-2 shrink-0">
              <Link href={`/list?trip=${encodeURIComponent(trip.id)}&view=full`} className={BTN_SECONDARY}>
                View list
              </Link>
              <button type="button" onClick={() => toast("Emailing your plan is coming soon")} className={BTN_SECONDARY}>
                Email
              </button>
            </div>
          )}
        </GlassCard>

        {/* A real account never plans against the example set. Anonymous
            visitors still get the example area, same as the deals grid. */}
        {!sessionLoading && !merchantIds && (
          <GlassCard wrapperClassName="mt-4" surfaceClassName={NUDGE_BANNER_SURFACE}>
            <p className="text-[13px] text-ink">
              <span className="font-semibold mr-2">{user ? "No stores yet" : "Example data"}</span>
              {user ? "Pick your stores to price a shopping trip." : "Prices are from a sample area."}
            </p>
            <Link href={user ? "/settings" : "/login"} className={BTN_NUDGE_CTA}>
              {user ? "Pick my stores →" : "Sign in →"}
            </Link>
          </GlassCard>
        )}
      </header>

      {/* Two panels that start and end on the same lines. The list card
          is built like a store card — header row, hairline rows — so the
          two sides read as one system. */}
      <div className="grid grid-cols-1 wide:grid-cols-[minmax(0,400px)_1fr] wide:grid-rows-[minmax(0,1fr)] gap-6 wide:flex-1 wide:min-h-0">
      {/* ── Left panel: the list ────────────────────────────────────── */}
      <GlassCard
        wrapperClassName="wide:min-h-0 wide:h-full"
        surfaceClassName={`${GLASS_SURFACE_DENSE} flex flex-col wide:h-full`}
      >
        <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-4 border-b border-line">
          <div className="min-w-0">
            <h2 className="font-display text-[19px] text-ink leading-tight">Your list</h2>
            <p className="text-[12px] text-ink-muted mt-0.5">
              <span className="font-mono tabular-nums">{entries.length}</span> {entries.length === 1 ? "item" : "items"}
            </p>
          </div>
          {hasItems && (
            <button
              onClick={onClearAll}
              className="shrink-0 text-[13px] font-semibold text-ink-soft hover:text-danger transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="shrink-0 px-5 pt-4 pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                addToTrip(trip.id, draft);
                setDraft("");
              }
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add an item, e.g. eggs"
              aria-label="Add an item"
              autoFocus={!hasItems}
              className="flex-1 min-w-0 rounded-control bg-surface border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none transition-colors"
            />
            <button type="submit" className={`${BTN_SECONDARY} shrink-0`}>
              Add
            </button>
          </form>
          {/* Starter suggestions for an empty list only — once something
              is on it they're just noise above the list. */}
          {!hasItems && quickAddChips && <div className="mt-3">{quickAddChips}</div>}
        </div>

        {hasItems ? (
          <ul className="px-5 pb-2 divide-y divide-line border-t border-line wide:flex-1 wide:min-h-0 wide:overflow-y-auto">
            {entries.map((entry, i) => (
              <li
                key={entry.id}
                className="animate-in group flex items-center justify-between gap-3 py-2.5"
                style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              >
                <div className="min-w-0">
                  <span className="block text-sm text-ink capitalize truncate" title={entry.label}>
                    {entry.label}
                  </span>
                  {entry.source && (
                    <span className="block text-[11px] text-ink-muted truncate">
                      {entry.source.merchantName} ·{" "}
                      <span className="font-mono tabular-nums">${entry.source.price.toFixed(2)}</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onRemove(entry.query)}
                  aria-label={`Remove ${entry.label}`}
                  className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-pill text-ink-muted hover:text-danger hover:bg-danger-soft text-lg leading-none transition-colors"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="hidden wide:flex flex-1 items-center justify-center border-t border-line px-5 py-8">
            <p className="text-[13px] text-ink-muted">Nothing on the list yet.</p>
          </div>
        )}
      </GlassCard>

      {/* ── Right panel: the priced trip ────────────────────────────── */}
      <div className="min-w-0 flex flex-col gap-5 wide:min-h-0">
        {hasItems && (
          <GlassCard wrapperClassName="shrink-0" surfaceClassName={`${GLASS_SURFACE_DENSE} px-5 py-4`}>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              {/* min-w-0: without it the total's own width can force the
                  row past the viewport on a narrow screen. */}
              <div className="min-w-0 flex items-baseline gap-3 flex-wrap">
                {showResult ? (
                  <span className={`font-display text-4xl text-accent leading-none tabular-nums transition-opacity ${loading ? "opacity-60" : ""}`}>
                    <CountUp value={totalCost} prefix="$" decimals={2} />
                  </span>
                ) : (
                  <span className="inline-block h-9 w-32 rounded-control bg-surface-3 animate-pulse" aria-label="Pricing" />
                )}
                <span className="text-[13px] text-ink-soft">
                  Estimated total
                  {showResult && (
                    <>
                      {" "}· <span className="font-mono tabular-nums">{plans.length}</span>{" "}
                      {plans.length === 1 ? "store" : "stores"}
                    </>
                  )}
                </span>
              </div>

              {/* Mode toggle — a segmented control on a quiet track, beside
                  the total it changes. The selected segment slides rather
                  than cutting: it's what says the two options are the same
                  control in two states. */}
              <div className="relative flex w-full sm:w-[300px] rounded-control bg-surface-2 border border-line p-1">
                <span
                  className="absolute top-1 bottom-1 rounded-[7px] bg-accent shadow-soft transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.3,1)]"
                  style={{
                    width: `calc(${100 / MODES.length}% - 4px)`,
                    transform: `translateX(calc(${modeIndex * 100}% + ${modeIndex * 4}px))`,
                  }}
                  aria-hidden
                />
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTripMode(trip.id, m.id)}
                    aria-pressed={mode === m.id}
                    title={m.blurb}
                    className={`relative z-10 flex-1 text-[13px] font-semibold py-1.5 rounded-[7px] transition-colors ${
                      mode === m.id ? "text-white" : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        {/* The one scrolling region at `wide:`. The padding pair gives
            the cards' soft shadows room inside the clip. */}
        <div className={`space-y-5 wide:flex-1 wide:min-h-0 wide:overflow-y-auto wide:-mx-2 wide:px-2 ${hasItems ? "wide:pb-2" : ""}`}>
        {error && (
          <div className="rounded-card border border-danger/25 bg-danger-soft shadow-soft p-6 text-center">
            <p className="font-display text-danger text-base">Couldn&apos;t price this trip</p>
            <button onClick={retry} className={BTN_FOLLOWUP_CTA}>
              Retry
            </button>
          </div>
        )}

        {showResult && result && (
          <section className={`animate-in space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {result.unmatched.length > 0 && (
              <div className="rounded-card bg-surface border border-line shadow-soft px-5 py-3">
                <p className="font-display text-ink text-sm">Couldn&apos;t find a deal for:</p>
                <p className="text-ink-soft text-sm mt-0.5 capitalize">{result.unmatched.join(", ")}</p>
                <p className="text-[12px] text-ink-muted mt-1">
                  These aren&apos;t on sale anywhere we track this week — or try a simpler word.
                </p>
              </div>
            )}

            {plans.length > 0 && (
              <StoreSections plans={plans} swaps={{ options: new Map(swappable), picks, onPick: setPick }} />
            )}
          </section>
        )}

        {!hasItems && !error && (
          <div className="hidden wide:flex h-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong bg-surface/50 px-6 py-10 text-center">
            <span aria-hidden className="text-[30px] leading-none opacity-60">🧾</span>
            <p className="text-sm text-ink-soft max-w-xs">Add items to see the cheapest way to shop them.</p>
          </div>
        )}
        </div>
      </div>
      </div>
    </main>
  );
}
