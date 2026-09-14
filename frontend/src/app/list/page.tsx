"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { OptimizeMode } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { BTN_FOLLOWUP_CTA, BTN_NUDGE_CTA, BTN_PRIMARY_CTA, BTN_SECONDARY } from "@/lib/button";
import { CHIP_QUIET_LIGHT, CHIP_SOFT } from "@/lib/chip";
import { useOptimize } from "@/lib/hooks";
import { formatSavedDate, tripName, useTrips, type Trip } from "@/lib/trips";
import { useToast } from "@/lib/toast";
import { useWide } from "@/lib/viewport";
import ActionCard from "@/components/ActionCard";
import BackLink from "@/components/BackLink";
import CountUp from "@/components/CountUp";
import GlassCard, { GLASS_SURFACE_DENSE, NUDGE_BANNER_SURFACE } from "@/components/GlassCard";
import ReceiptCard from "@/components/ReceiptCard";
import TripShoppingList from "@/components/TripShoppingList";

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

/**
 * The trip planner, as three views off one URL:
 *
 *   /list                 → the choice: New trip, or My trips. Nothing else.
 *   /list?view=trips      → My trips: one row per trip.
 *   /list?trip=<id>       → one trip: add items → choose how to shop → build.
 *   /list?trip=new        → creates an empty trip and replaces itself with its id.
 *
 * No banner. /list opens straight on the planner: "/" is the site's one
 * landing page and the melon is what makes it one, so a second full
 * screen of decoration in front of a tool you came here to use was a
 * screen to get past rather than an arrival. TripIntro still exists and
 * still works if a hero is ever wanted here again.
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
  if (params.get("view") === "trips") return <MyTrips />;
  return <StartView />;
}

// ── Start ─────────────────────────────────────────────────────────────

function StartView() {
  const { trips, hydrated, activeTrip } = useTrips();
  const count = trips.length;

  return (
    // min-h reaches for the viewport under the header (h-16 sticky) so
    // the centering below has real room to work with — this view is
    // just intro text + two cards, and without a floor they'd sit
    // pinned to the top with the rest of the page empty beneath them.
    <main className="min-h-[calc(100vh-4rem)] flex flex-col justify-center max-w-[1400px] mx-auto px-6 py-12">
      {/* The shell matches the other two views of this route so the page
          doesn't change width as you move between them, but three cards
          stretched across 1400px would be a row of billboards — the grid
          keeps its own measure inside it. Three across from `md:` and
          stacked below it: at `sm` they'd be ~200px each, which is
          narrower than the detail line wants. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto w-full">
        <ActionCard
          href="/list?trip=new"
          icon="📝"
          title="New shopping trip"
          detail="Start a new list."
          cta="Start →"
        />
        <ActionCard
          href="/list?view=trips"
          icon="🧾"
          title={count > 0 ? `My shopping trips (${count})` : "My shopping trips"}
          detail={
            !hydrated
              ? "Loading your shopping trips…"
              : count === 0
              ? "Nothing saved yet — shopping trips you start show up here."
              : `Continue where you left off.`
          }
          disabled={count === 0}
        />
        {/* Straight to the list you shop from. It opens on whichever
            trip is active (which falls back to the most recent) and the
            view itself switches between them. */}
        <ActionCard
          href={activeTrip ? `/list?trip=${encodeURIComponent(activeTrip.id)}&view=full` : undefined}
          icon="🛍️"
          title="View shopping trip"
          detail={
            !hydrated
              ? "Loading your shopping trips…"
              : !activeTrip
              ? "Nothing to show yet — start a shopping trip first."
              : count > 1
              ? "Every item, with photos — pick which trip inside."
              : `${tripName(activeTrip)} — every item, with photos.`
          }
          cta="Open list →"
          disabled={!activeTrip}
        />
      </div>
    </main>
  );
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
        <BackLink href="/list?view=trips" label="My shopping trips" />
        <p className="text-ink mt-4">This shopping trip isn&apos;t here anymore.</p>
      </main>
    );
  }

  return <TripShoppingList trip={trip} />;
}

// ── My trips ──────────────────────────────────────────────────────────

function MyTrips() {
  const { trips, activeTrip, hasChosenTrip, hydrated, removeTrip, restoreTrip } = useTrips();
  const { toast } = useToast();

  function onRemove(trip: Trip) {
    const removed = removeTrip(trip.id);
    if (removed) {
      toast(`Removed "${tripName(removed)}"`, {
        action: { label: "Undo", onClick: () => restoreTrip(removed) },
      });
    }
  }

  return (
    <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16">
      <BackLink href="/list" label="Plan a shopping trip" />
      <div className="flex items-center justify-between gap-4 mt-3 mb-5">
        <h1 className="font-display text-3xl text-ink leading-tight">My shopping trips</h1>
        <Link href="/list?trip=new" className={`${BTN_SECONDARY} shrink-0`}>
          + New shopping trip
        </Link>
      </div>

      {!hydrated ? (
        <p className="text-sm text-ink-soft animate-pulse">Loading your shopping trips…</p>
      ) : trips.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No shopping trips yet.{" "}
          <Link href="/list?trip=new" className="font-semibold text-accent hover:text-accent-dark">
            Start one →
          </Link>
        </p>
      ) : (
        <ul className="rounded-card bg-surface border border-line shadow-soft divide-y divide-line overflow-hidden wide:grid wide:grid-cols-2 wide:gap-4 wide:rounded-none wide:bg-transparent wide:border-0 wide:shadow-none wide:divide-y-0 wide:overflow-visible">
          {trips.map((trip) => (
            <li key={trip.id} className="animate-in flex items-center gap-3 hover:bg-surface-2 transition-colors wide:rounded-card wide:bg-surface wide:border wide:border-line wide:shadow-soft wide:overflow-hidden">
              <Link href={`/list?trip=${encodeURIComponent(trip.id)}`} className="flex-1 min-w-0 px-5 py-4 group">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-display text-[16px] text-ink truncate group-hover:text-accent transition-colors">
                    {tripName(trip)}
                  </span>
                  {hasChosenTrip && trip.id === activeTrip?.id && (
                    <span className="badge-soft-quiet shrink-0 text-[11px]">Adding here</span>
                  )}
                </span>
                <span className="block text-[12px] text-ink-muted mt-1">
                  {formatSavedDate(trip.updatedAt)} ·{" "}
                  <span className="font-mono tabular-nums">{trip.items.length}</span>{" "}
                  {trip.items.length === 1 ? "item" : "items"}
                  {trip.stops > 0 && (
                    <>
                      {" "}· ~<span className="font-mono tabular-nums">${trip.totalCost.toFixed(2)}</span> ·{" "}
                      <span className="font-mono tabular-nums">{trip.stops}</span>{" "}
                      {trip.stops === 1 ? "stop" : "stops"}
                    </>
                  )}
                </span>
              </Link>
              <button
                onClick={() => onRemove(trip)}
                aria-label={`Remove shopping trip ${tripName(trip)}`}
                className="text-ink-muted hover:text-danger text-lg leading-none px-2 py-1 mr-3 rounded-control transition-colors shrink-0"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// ── One trip ──────────────────────────────────────────────────────────

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-5`}>
      <div className="flex items-start gap-3 mb-4">
        <span
          aria-hidden
          className="shrink-0 w-7 h-7 rounded-pill bg-accent-soft text-accent-dark font-mono tabular-nums text-[13px] font-bold flex items-center justify-center"
        >
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-ink text-[17px] leading-tight">{title}</h2>
          <p className="text-[13px] text-ink-soft mt-0.5">{hint}</p>
        </div>
      </div>
      {children}
    </GlassCard>
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
    picks, setPick, plans, totalCost, swappable, lastQueries,
  } = useOptimize();
  const resultsRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // The one layout question on this page that CSS cannot answer — see
  // the scroll in runBuild below, and the note in lib/viewport.ts.
  const wide = useWide();

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
  // Planner's stableKey.) Also drops a one-shot `build` flag.
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

  async function runBuild(t: Trip, { scroll }: { scroll: boolean }) {
    // Saved picks (including swaps) are kept on a rebuild — unless the
    // mode changed, where keeping them would defeat the point of
    // switching to "fewest stops".
    const keepPicks = !result || result.mode === t.mode;
    const preferred: Record<string, number> = {};
    if (keepPicks) for (const i of t.items) if (i.pick !== undefined) preferred[i.query] = i.pick;

    const { unavailableCount } = await build(
      t.items.map((i) => i.query), t.mode,
      merchantIds ?? undefined, user?.postal_code ?? undefined,
      preferred,
    );
    if (unavailableCount > 0) {
      toast(
        `${unavailableCount} item${unavailableCount === 1 ? "" : "s"} ${unavailableCount === 1 ? "isn't" : "aren't"} on sale anymore — updated to today's best price.`,
      );
    }
    // Only worth doing when the results are somewhere else. In the
    // two-pane layout they are already on screen beside the button that
    // was just pressed, and scrolling there yanks the form out from
    // under the cursor to show something the user can already see.
    if (scroll && !wide) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Opening a trip that has items prices it against today's deals
  // straight away — this is what "Use this plan" used to be a button
  // for. Decided ONCE, when the trip and session are first ready: a
  // brand-new trip that later gets its first item must not suddenly
  // fire a build on its own.
  const autoBuildDecided = useRef(false);
  useEffect(() => {
    if (autoBuildDecided.current || !trip || sessionLoading) return;
    autoBuildDecided.current = true;
    if (trip.items.length > 0 && !isSignedInNoStores) runBuild(trip, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, sessionLoading, isSignedInNoStores]);

  // Every build and every swap is written back to the trip, so picks
  // survive a reload — this is the "save" there's no button for.
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
        <BackLink href="/list?view=trips" label="My shopping trips" />
        <p className="text-ink mt-4">This shopping trip isn&apos;t here anymore.</p>
        <Link href="/list?trip=new" className={`${BTN_SECONDARY} inline-block mt-4`}>
          + New shopping trip
        </Link>
      </main>
    );
  }

  const entries = trip.items;
  const modeIndex = MODES.findIndex((m) => m.id === mode);
  // The result on screen no longer matches the list (an item added or
  // removed, or the mode switched) — the button says so.
  const stale =
    !!result &&
    (result.mode !== mode ||
      lastQueries.length !== entries.length ||
      entries.some((e) => !lastQueries.includes(e.query)));

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

  return (
    <main className="max-w-[1400px] mx-auto px-6 pt-6 pb-16">
      <BackLink href="/list?view=trips" label="My shopping trips" />

      {/* Two panes at `wide:`, the same shape /deals uses: the thing you
          act on pinned to the left, what it produces filling the space
          beside it. Below `wide:` this grid is one column and the order
          here IS the reading order — name, items, build, then results
          underneath — which is what it has always been on a phone.

          The split is what this page was missing on a desktop: form and
          receipts were a single 768px ribbon, so building a trip pushed
          the thing you'd just filled in off the top of the screen and
          you scrolled between the two to change anything. */}
      <div className="mt-3 grid grid-cols-1 wide:grid-cols-[minmax(0,440px)_1fr] gap-8 items-start">
      {/* ── Left pane: the trip itself ──────────────────────────── */}
      {/* Sticky is the same recipe as the deals rail (top-20 clears the
          h-16 header plus a hair). max-h + overflow-y keeps a long item
          list scrollable within its own column instead of growing the
          page past the receipts beside it. */}
      <div className="wide:sticky wide:top-20 wide:max-h-[calc(100vh-6rem)] wide:overflow-y-auto wide:pr-1">
      {/* The name IS the heading, and editable in place — keyed on the
          saved name so a rename from elsewhere (another tab) shows up.
          The hover border on the input is real, but it only shows up
          once you're already hovering it — nothing upfront said "this is
          editable" on a heading that otherwise looks like plain text, so
          a pencil button sits beside it as a standing affordance. */}
      <header className="mb-6">
        <div className="flex items-center gap-1.5 -mx-2">
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
            className="min-w-0 flex-1 bg-transparent font-display text-3xl sm:text-4xl text-ink leading-tight rounded-control px-2 py-1 border border-transparent hover:border-line focus:border-accent focus:bg-surface focus:outline-none placeholder:text-ink-muted transition-colors"
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
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11.333 2 14 4.667l-8.5 8.5-3.417.917.917-3.417 8.333-8.334Z" />
            </svg>
          </button>
        </div>
        <p className="text-[13px] text-ink-muted mt-1 px-2">
          <span className="font-mono tabular-nums">{entries.length}</span> {entries.length === 1 ? "item" : "items"} ·
          saves automatically
        </p>
      </header>

      {/* A real account never plans against the example set — building
          is disabled below until stores are picked. Anonymous visitors
          still get the example area, same as the deals grid. */}
      {!sessionLoading && !merchantIds && (
        <GlassCard wrapperClassName="mb-5" surfaceClassName={NUDGE_BANNER_SURFACE}>
          <p className="text-[13px] text-ink">
            <span className="font-semibold mr-2">{user ? "No stores yet" : "Example data"}</span>
            {user
              ? "Your account isn't tracking any stores — pick your stores to plan a shopping trip."
              : "Shopping trips route through our default area's stores — sign in to plan against the stores near you."}
          </p>
          <Link href={user ? "/settings" : "/login"} className={BTN_NUDGE_CTA}>
            {user ? "Pick my stores →" : "Sign in →"}
          </Link>
        </GlassCard>
      )}

      <div className="space-y-4">
        <Step n={1} title="Add what you need" hint="Type anything — or tap + on any deal, it lands in this shopping trip.">
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
              placeholder="e.g. eggs"
              aria-label="Add an item"
              className="flex-1 min-w-0 rounded-control bg-surface border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none transition-colors"
            />
            {/* Quiet, deliberately: the build button is this page's one
                primary action. */}
            <button type="submit" className={`${BTN_SECONDARY} shrink-0`}>
              Add
            </button>
          </form>

          {entries.length === 0 ? (
            <div className="mt-4">
              <p className="text-[13px] text-ink-soft mb-2">Quick add</p>
              <div className="flex flex-wrap gap-2">
                {SEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => addToTrip(trip.id, s)}
                    className={`${CHIP_SOFT} ${CHIP_QUIET_LIGHT} capitalize`}
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <ul className="mt-4 space-y-1.5">
                {entries.map((entry, i) => (
                  <li
                    key={entry.id}
                    className="animate-in flex items-center justify-between gap-2 rounded-control bg-surface-2 border border-line px-3 py-2"
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
                      className="text-ink-muted hover:text-danger text-lg leading-none transition-colors shrink-0"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end mt-2">
                <button
                  onClick={onClearAll}
                  className="text-[13px] font-semibold text-ink-soft hover:text-accent transition-colors"
                >
                  Clear all
                </button>
              </div>
            </>
          )}
        </Step>

        <Step n={2} title="Choose how to shop, then build" hint="We'll check every store's flyer and split your list between them.">
          {/* Mode toggle — a segmented control on a quiet track. The
              selected segment slides rather than cutting: it's what says
              the two options are the same control in two states. */}
          <div className="relative flex rounded-control bg-surface-2 border border-line p-1">
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
                className={`relative z-10 flex-1 text-[13px] font-semibold py-1.5 rounded-[7px] transition-colors ${
                  mode === m.id ? "text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-ink-muted mt-2 px-1">{MODES[modeIndex].blurb}</p>

          <GlassCard
            as="button"
            onClick={() => runBuild(trip, { scroll: true })}
            disabled={entries.length === 0 || loading || isSignedInNoStores}
            surfaceClassName={`${BTN_PRIMARY_CTA} mt-5 disabled:cursor-not-allowed`}
          >
            {loading
              ? "Ringing it up…"
              : isSignedInNoStores
              ? "Pick your stores first"
              : entries.length === 0
              ? "Add an item to build"
              : result
              ? stale
                ? "Update my shopping trip"
                : "Rebuild with today's prices"
              : "Build my shopping trip"}
          </GlassCard>
          
        </Step>
      </div>
      </div>

      {/* ── Right pane: results, once there's something to show ──── */}
      <div ref={resultsRef} className="scroll-mt-20 min-w-0">
        {error && (
          <div className="mt-8 wide:mt-0 rounded-card border border-danger/25 bg-danger-soft shadow-soft p-6 text-center">
            <p className="font-display text-danger text-base">Shopping trip planner unavailable</p>
            <p className="text-ink-soft text-sm mt-3">
              We couldn&apos;t build your shopping trip right now — give it another try.
            </p>
            <button onClick={retry} className={BTN_FOLLOWUP_CTA}>
              Retry
            </button>
          </div>
        )}

        {loading && !result && (
          <div className="mt-8 wide:mt-0 py-10 text-center text-sm text-ink-soft animate-pulse">Printing receipts…</div>
        )}

        {result && (
          <section className={`mt-10 wide:mt-0 animate-in transition-opacity ${loading ? "opacity-50" : ""}`}>
            {stale && !loading && (
              <p className="mb-4 text-[13px] text-ink-soft">
                Your list changed since this was built — hit{" "}
                <span className="font-semibold">Update my shopping trip</span>{" "}
                to re-price it.
              </p>
            )}

            {/* Trip summary */}
            <div className="mb-6 pb-5 border-b border-line">
              <div className="flex items-center justify-between gap-4">
                {/* min-w-0: without it the text-5xl total's own width can
                    force the row past the viewport on a narrow screen. */}
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink-soft">
                    Estimated total · {result.mode === "cheapest" ? "cheapest" : "fewest stops"}
                  </div>
                  <div className="font-display text-5xl text-accent leading-none mt-1.5 tabular-nums">
                    <CountUp value={totalCost} prefix="$" decimals={2} />
                  </div>
                  <div className="text-sm text-ink-soft mt-1.5">
                    across <span className="font-mono tabular-nums">{plans.length}</span>{" "}
                    {plans.length === 1 ? "store" : "stores"}
                  </div>
                </div>
                <div className="shrink-0 rounded-card border border-line bg-surface px-4 py-3 text-center" aria-hidden>
                  <div className="font-mono tabular-nums text-2xl text-ink leading-none">{plans.length}</div>
                  <div className="text-[12px] text-ink-muted mt-1">{plans.length === 1 ? "stop" : "stops"}</div>
                </div>
              </div>
              {/* The receipts answer "what's the damage"; this answers
                  "what am I actually picking off the shelf" — full
                  product names and photos, which a receipt column can't
                  fit without ceasing to be a receipt. */}
              {plans.length > 0 && (
                <Link
                  href={`/list?trip=${encodeURIComponent(trip.id)}&view=full`}
                  className={`${BTN_SECONDARY} inline-flex mt-4`}
                >
                  View the full shopping list →
                </Link>
              )}
            </div>

            {plans.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 ultra:grid-cols-3 gap-x-5 gap-y-8 items-start">
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
                  <div className="h-px flex-1 bg-line-strong" />
                </div>
                <div className="space-y-4">
                  {swappable.map(([query, rows]) => (
                    <div key={query}>
                      <p className="text-[13px] font-semibold text-ink-soft mb-2 capitalize">{query}</p>
                      <div className="flex flex-wrap gap-2">
                        {rows.map((row) => {
                          const selected = picks[query] === row.item_id;
                          const size = formatOptionSize(row.size, row.size_unit);
                          return (
                            <button
                              key={row.item_id}
                              onClick={() => setPick(query, row.item_id)}
                              title={row.name}
                              /* Selected is the accent TINT, not a filled
                                 accent block — the border does the selecting. */
                              className={`text-left text-[12px] rounded-control border px-3 py-2 transition-colors max-w-full ${
                                selected
                                  ? "bg-accent-soft border-accent text-ink"
                                  : "bg-surface border-line text-ink-soft hover:border-line-strong hover:text-ink"
                              }`}
                            >
                              <span className="font-medium truncate inline-block max-w-[220px] align-bottom">
                                {row.name}
                              </span>
                              <span className={`font-mono tabular-nums ml-2 font-semibold ${selected ? "text-accent-dark" : "text-ink"}`}>
                                ${row.price.toFixed(2)}
                              </span>
                              <span className={`block text-[11px] mt-0.5 ${selected ? "text-ink-soft" : "text-ink-muted"}`}>
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
              <div className="mt-8 rounded-card bg-surface border border-line shadow-soft px-4 py-3">
                <p className="font-display text-ink text-sm">Couldn&apos;t find a deal for:</p>
                <p className="text-ink-soft text-sm mt-0.5 capitalize">{result.unmatched.join(", ")}</p>
                <p className="text-[12px] text-ink-muted mt-1">
                  These aren&apos;t on sale anywhere we track this week — or try a simpler word.
                </p>
              </div>
            )}
          </section>
        )}

        {/* An empty right half reads as broken in a way an absent
            section below a form does not, so this exists only at
            `wide:` — narrow screens correctly show nothing here until
            there is something to show. */}
        {!result && !loading && !error && (
          <div className="hidden wide:flex min-h-[420px] flex-col items-center justify-center rounded-card border border-dashed border-line px-6 py-10 text-center">
            <span aria-hidden className="text-[30px] leading-none">🧾</span>
            <p className="font-display text-ink text-base mt-4">No receipts yet</p>
            <p className="text-[14px] text-ink-soft mt-2 max-w-xs leading-snug">
              {entries.length === 0
                ? "Add what you need on the left, then build your shopping trip — we'll split it across your stores and price it here."
                : "Hit “Build my shopping trip” and we'll split your list across your stores and price it here."}
            </p>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
