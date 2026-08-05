"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchCategories,
  fetchDealFacets,
  fetchDeals,
  fetchMerchants,
  type Deal,
  type DealStatus,
  type Merchant,
  type SortMode,
  type SortDir,
  type PriceUnit,
} from "@/lib/api";
import DealCard from "@/components/DealCard";
import DealsSidebar from "@/components/DealsSidebar";
import GlassCard, { NUDGE_BANNER_SURFACE } from "@/components/GlassCard";
import MelonHero from "@/components/MelonHero";
import Link from "next/link";
import { useAccount } from "@/lib/account";
import { BTN_FOLLOWUP_CTA, BTN_NUDGE_CTA } from "@/lib/button";
import { CHIP, CHIP_ACTIVE, CHIP_DISABLED_LIGHT, CHIP_QUIET_LIGHT } from "@/lib/chip";
import { useHeroSnap, useKonamiCode } from "@/lib/hooks";

const STATUSES: { id: DealStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "On now" },
  { id: "upcoming", label: "Starting soon" },
];

const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: null, label: "Any" },
  { days: 0, label: "Today" },
  { days: 2, label: "≤ 2 days" },
  { days: 7, label: "This week" },
];

const PAGE_SIZE = 24;

const PAGE_WINDOW = 2; // pages shown on either side of the current one

function Pagination({
  page,
  hasMore,
  totalPages,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  /** Exact page count when known (from the facets total); null falls
   *  back to the old "at least one more page" guess. */
  totalPages: number | null;
  onPage: (p: number) => void;
}) {
  if (page === 1 && !hasMore && (totalPages === null || totalPages <= 1)) return null;

  const lastKnown = totalPages ?? (hasMore ? page + 1 : page);
  const windowStart = Math.max(1, page - PAGE_WINDOW);
  const windowEnd = Math.min(lastKnown, page + PAGE_WINDOW);
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);
  const canNext = totalPages !== null ? page < totalPages : hasMore;

  // Every control wears the header's chip shape (lib/chip) — same type,
  // rim and press — but its OWN light variant, not CHIP_QUIET/CHIP_ACTIVE
  // verbatim: this row sits directly on the page's own pale background,
  // no gradient panel behind it, so a near-white glass reads better here
  // than the dark ink glass the header needs for its coral/dark-rind
  // backdrops. The current page keeps CHIP_ACTIVE (dark) — it's still
  // the one that should visually pop out of its lighter siblings.
  return (
    <div className="flex items-center justify-center gap-2 py-10 flex-wrap">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={`${CHIP} ${page === 1 ? CHIP_DISABLED_LIGHT : CHIP_QUIET_LIGHT}`}
      >
        ←
      </button>

      {windowStart > 1 && (
        <>
          <button onClick={() => onPage(1)} className={`${CHIP} ${CHIP_QUIET_LIGHT}`}>1</button>
          {windowStart > 2 && <span className="px-1 text-ink-soft/60 text-[12px] font-mono font-bold">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPage(p)}
          aria-current={p === page ? "page" : undefined}
          className={`${CHIP} ${p === page ? CHIP_ACTIVE : CHIP_QUIET_LIGHT}`}
        >
          {p}
        </button>
      ))}

      {totalPages !== null && windowEnd < totalPages && (
        <>
          {windowEnd < totalPages - 1 && <span className="px-1 text-ink-soft/60 text-[12px] font-mono font-bold">…</span>}
          <button onClick={() => onPage(totalPages)} className={`${CHIP} ${CHIP_QUIET_LIGHT}`}>
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={!canNext}
        aria-label="Next page"
        className={`${CHIP} ${!canNext ? CHIP_DISABLED_LIGHT : CHIP_QUIET_LIGHT}`}
      >
        →
      </button>
    </div>
  );
}

/* Mirrors a real DealCard's proportions — image square, merchant line,
   name block, price tag, badge row — so the grid doesn't jump on load. */
function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      className="animate-shimmer bg-card border-2 border-ink/20 p-4"
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-16 h-16 bg-ink/5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-3 w-20 bg-ink/10" />
          <div className="h-4 w-3/4 bg-ink/10 mt-2" />
          <div className="h-3 w-10 bg-ink/5 mt-2" />
        </div>
        <div className="w-16 h-10 bg-tag/50 -rotate-3 flex-shrink-0" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-4 w-16 bg-ink/5" />
        <div className="h-4 w-10 bg-ink/5" />
      </div>
      <div className="h-3 w-24 bg-ink/5 mt-2" />
    </div>
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const { user, merchantIds, meta, scrapeStatus, loading: sessionLoading } = useAccount();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  // Checked categories/stores — multi-select. `categories`/`merchants`
  // below are the AVAILABLE options fetched from the backend, a
  // different thing from which ones are currently checked.
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    (searchParams.get("categories") ?? "").split(",").filter(Boolean),
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantIds, setSelectedMerchantIds] = useState<number[]>(() =>
    (searchParams.get("merchants") ?? "")
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  // Bumped to force a refetch: by the Retry button, and when a
  // background scrape finishes so fresh deals appear without a reload.
  const [reloadKey, setReloadKey] = useState(0);

  // A signed-in account only ever sees ITS OWN stores — never a fallback
  // to the example-data set. Only true anonymous visitors get the
  // example area's pills (fetched separately into `merchants` below).
  const hasStores = !!user && user.merchants.length > 0;
  const isSignedInNoStores = !!user && !hasStores;
  const pillMerchants: Merchant[] = user ? user.merchants : merchants;

  // Region scope sent on every deals/facets/categories call. A signed-in
  // user's own postal code; undefined for anonymous → backend uses the
  // example-data region. Keeps a signed-in account's data from ever
  // bleeding into (or from) another region's identically-named items.
  const effectivePostal = user?.postal_code ?? undefined;

  // A signed-in account with no postal code set has no region to scope
  // to — omitting the param would otherwise read as "anonymous" to the
  // backend and silently fall back to the example-data region. Gate the
  // grid the same way as isSignedInNoStores rather than let that happen.
  const isSignedInNoPostal = !!user && !user.postal_code;
  const isSignedInBlocked = isSignedInNoStores || isSignedInNoPostal;

  const [deals, setDeals] = useState<Deal[]>([]);
  const [sort, setSort] = useState<SortMode>(() =>
    searchParams.get("sort") === "price_per_unit" ? "price_per_unit" : "price",
  );
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    searchParams.get("dir") === "desc" ? "desc" : "asc",
  );
  const [priceUnits, setPriceUnits] = useState<PriceUnit[]>(() =>
    (searchParams.get("units") ?? "")
      .split(",")
      .filter((u): u is PriceUnit => u === "g" || u === "ml" || u === "each"),
  );
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isInteger(p) && p > 1 ? p : 1;
  });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Facets: exact total (for real pagination) + item counts per category
  // and per store pill. Fetched separately from the deals grid since it
  // doesn't depend on page/sort — only on which filters are active.
  const [facetTotal, setFacetTotal] = useState<number | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(new Map());
  const [merchantCounts, setMerchantCounts] = useState<Map<number, number>>(new Map());

  // Advanced filters — status, expiry window, price range. Initialized
  // from the URL like the other filters so they're bookmarkable.
  const [status, setStatus] = useState<DealStatus>(() => {
    const s = searchParams.get("status");
    return s === "active" || s === "upcoming" ? s : "all";
  });
  const [expDays, setExpDays] = useState<number | null>(() => {
    const e = Number(searchParams.get("exp"));
    return searchParams.get("exp") !== null && Number.isInteger(e) && e >= 0 ? e : null;
  });
  const [priceMin, setPriceMin] = useState(searchParams.get("pmin") ?? "");
  const [priceMax, setPriceMax] = useState(searchParams.get("pmax") ?? "");

  // Feeds the "Filters (N)" badge on the sidebar's combined status/expiry/
  // price-range/priced-by group.
  const advancedCount =
    (status !== "all" ? 1 : 0) +
    (expDays !== null ? 1 : 0) +
    (priceMin !== "" ? 1 : 0) +
    (priceMax !== "" ? 1 : 0) +
    (priceUnits.length > 0 ? 1 : 0);

  // Secret: fast-typing streak flashes the search border yellow.
  const [streak, setStreak] = useState(false);
  const keyTimes = useRef<number[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Completes a scroll off MelonHero (h-screen) onto #deals below it, or
  // back onto the hero, rather than resting half on one and half on the
  // other — see the hook's own comment for why this isn't plain CSS
  // scroll-snap.
  useHeroSnap();

  // Secret: Konami code makes every visible price tag pop straight, then
  // spring back — staggered 50ms per tag, via the Web Animations API.
  useKonamiCode(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.querySelectorAll<HTMLElement>("[data-price-tag]").forEach((el, i) => {
      el.animate(
        [
          { transform: "rotate(-3deg) scale(1)" },
          { transform: "rotate(0deg) scale(1.3)", offset: 0.45 },
          { transform: "rotate(-3deg) scale(1)" },
        ],
        { duration: 600, delay: i * 50, easing: "cubic-bezier(0.25, 0.9, 0.3, 1.25)" },
      );
    });
  });

  function onQueryChange(value: string) {
    setQuery(value);
    const now = Date.now();
    keyTimes.current = [...keyTimes.current.filter((t) => now - t < 1000), now];
    if (keyTimes.current.length >= 5) {
      keyTimes.current = [];
      setStreak(true);
      setTimeout(() => setStreak(false), 700);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      keyTimes.current = [];
    }, 2000);
  }

  // Categories/merchants must always match whatever's actually driving
  // the deals grid: the signed-in account's own stores, or (anonymous
  // only) the example-data default — NEVER the whole database, and
  // NEVER the example set once someone is signed in.
  useEffect(() => {
    if (sessionLoading) return;
    if (isSignedInBlocked) {
      setCategories([]);
      setMerchants([]);
      return;
    }
    let cancelled = false;
    fetchCategories(user ? { merchantIds: merchantIds ?? undefined, postalCode: effectivePostal } : undefined)
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {});
    if (!user) {
      fetchMerchants()
        .then((m) => {
          if (!cancelled) setMerchants(m);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, user, merchantIds, isSignedInBlocked, effectivePostal]);

  // When a background scrape finishes, refetch deals AND the category/
  // merchant lists so new stores' data appears without a manual reload —
  // the moment the "deals are in" toast fires is when users look.
  const scrapeRunning = scrapeStatus?.running ?? false;
  const prevScrapeRunning = useRef(scrapeRunning);
  useEffect(() => {
    if (prevScrapeRunning.current && !scrapeRunning && !isSignedInBlocked) {
      setReloadKey((k) => k + 1);
      fetchCategories(user ? { merchantIds: merchantIds ?? undefined, postalCode: effectivePostal } : undefined)
        .then(setCategories)
        .catch(() => {});
      if (!user) {
        fetchMerchants().then(setMerchants).catch(() => {});
      }
    }
    prevScrapeRunning.current = scrapeRunning;
  }, [scrapeRunning, user, merchantIds, isSignedInBlocked, effectivePostal]);

  // Reset to page 1 when filters change — but NOT on plain page
  // navigation, which would otherwise reset back to page 1 every time
  // they click "next".
  //
  // No scroll here any more. This used to also `scrollTo({top:0})`, but
  // that's the absolute document top — the landing hero's top, not just
  // "top of the deals grid" — so toggling a sidebar checkbox (the
  // sidebar is sticky/already visible while you're doing that) yanked
  // the whole page back up past the grid into the hero. The sidebar
  // being visible already is exactly why no scroll is needed here at
  // all: nothing about updating the filters requires moving the
  // viewport anywhere.
  useEffect(() => {
    setPage(1);
  }, [query, selectedCategories, selectedMerchantIds, sort, sortDir, priceUnits, status, expDays, priceMin, priceMax]);

  // Keep filters in the URL (?q=beef&categories=meat,dairy&merchants=1,2)
  // so the search is bookmarkable and survives back-navigation from
  // /item/[id].
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","));
    if (selectedMerchantIds.length > 0) params.set("merchants", selectedMerchantIds.join(","));
    if (status !== "all") params.set("status", status);
    if (expDays !== null) params.set("exp", String(expDays));
    if (priceMin) params.set("pmin", priceMin);
    if (priceMax) params.set("pmax", priceMax);
    if (sort !== "price") params.set("sort", sort);
    if (sortDir !== "asc") params.set("dir", sortDir);
    if (priceUnits.length > 0) params.set("units", priceUnits.join(","));
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, selectedCategories, selectedMerchantIds, status, expDays, priceMin, priceMax, sort, sortDir, priceUnits, page]);

  useEffect(() => {
    // Wait for the session to resolve first: until then `user` is null,
    // so isSignedInBlocked reads false and this would fire an anonymous
    // fetch (the example region) that a signed-in-but-blocked account
    // would never actually want — exactly the reload-flash bug where
    // the example region's 2000 items/97 pages briefly took over.
    if (sessionLoading) return;
    // Signed in with no stores picked, or no postal code set = no data,
    // full stop. Never fall back to the example set once someone has an
    // account — an omitted postal code reads as "anonymous" downstream.
    if (isSignedInBlocked) {
      setDeals([]);
      setHasMore(false);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(false);
      const min = parseFloat(priceMin);
      const max = parseFloat(priceMax);
      fetchDeals({
        q: query || undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        // Checked stores narrow the scope; none checked = the account's
        // full store list (or the example-data default), same fallback
        // the old single-pill selection used.
        merchantIds: selectedMerchantIds.length > 0 ? selectedMerchantIds : merchantIds ?? undefined,
        postalCode: effectivePostal,
        status,
        sort,
        sortDir,
        priceUnits: priceUnits.length > 0 ? priceUnits : undefined,
        expiresWithinDays: expDays ?? undefined,
        priceMin: Number.isFinite(min) && min >= 0 ? min : undefined,
        priceMax: Number.isFinite(max) && max >= 0 ? max : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
        .then((res) => {
          // A slower-to-settle request from a since-superseded scope
          // (e.g. the session finishing load, or a filter changing again
          // before this one returned) must never overwrite newer state.
          if (cancelled) return;
          setDeals(res);
          // Prefer the exact facets total when we have one; otherwise
          // guess from a full page (facets can lag a beat behind on the
          // very first load, or fail independently of this fetch).
          setHasMore(facetTotal !== null ? page * PAGE_SIZE < facetTotal : res.length === PAGE_SIZE);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [sessionLoading, query, selectedCategories, selectedMerchantIds, merchantIds, effectivePostal, sort, sortDir, priceUnits, status, expDays, priceMin, priceMax, page, reloadKey, facetTotal, isSignedInBlocked]);

  // Facets: total count + per-category/per-store item counts. Independent
  // of page/sort, so it only refetches when a real filter changes.
  useEffect(() => {
    // Same reload race as the deals effect above: don't fetch (or reset)
    // anything until the session has actually resolved.
    if (sessionLoading) return;
    if (isSignedInBlocked) {
      setFacetTotal(0);
      setCategoryCounts(new Map());
      setMerchantCounts(new Map());
      return;
    }
    let cancelled = false;
    const min = parseFloat(priceMin);
    const max = parseFloat(priceMax);
    fetchDealFacets({
      q: query || undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      merchantIds: selectedMerchantIds.length > 0 ? selectedMerchantIds : merchantIds ?? undefined,
      postalCode: effectivePostal,
      status,
      priceUnits: priceUnits.length > 0 ? priceUnits : undefined,
      expiresWithinDays: expDays ?? undefined,
      priceMin: Number.isFinite(min) && min >= 0 ? min : undefined,
      priceMax: Number.isFinite(max) && max >= 0 ? max : undefined,
    })
      .then((facets) => {
        // A stale response from a since-superseded scope must never
        // overwrite the counts for whatever's actually showing now.
        if (cancelled) return;
        setFacetTotal(facets.total);
        setCategoryCounts(new Map(facets.categories.map((c) => [c.name, c.count])));
        setMerchantCounts(new Map(facets.merchants.map((m) => [m.id, m.count])));
      })
      .catch(() => {
        // Counts are a nice-to-have — leave pills unlabeled rather than
        // surface a second error state for a non-essential fetch.
        if (!cancelled) setFacetTotal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, query, selectedCategories, selectedMerchantIds, merchantIds, effectivePostal, status, priceUnits, expDays, priceMin, priceMax, reloadKey, isSignedInBlocked]);

  // Per-category average $/unit across visible deals, for the deal-o-meter.
  // Needs 2+ priced items in a category — comparing an item to itself is noise.
  const categoryAvgPerUnit = useMemo(() => {
    const sums = new Map<string, { total: number; n: number }>();
    for (const d of deals) {
      if (d.price_per_unit === null || !d.category) continue;
      const s = sums.get(d.category) ?? { total: 0, n: 0 };
      s.total += d.price_per_unit;
      s.n += 1;
      sums.set(d.category, s);
    }
    const avg = new Map<string, number>();
    for (const [cat, { total, n }] of sums) {
      if (n >= 2) avg.set(cat, total / n);
    }
    return avg;
  }, [deals]);

  return (
    <main className="pb-16">
      <MelonHero />

      {/* scroll-mt-16 == the fixed header's h-16, so the deals land flush
          under it instead of leaving a strip of hero showing in the gap. */}
      {/* Two columns, filters always the left one: the sidebar is a fixed
          280px rail and the search bar, card grid and paginator share the
          1fr beside it. The "Slice me" melon is neither — it's `fixed`
          bottom-right in the root layout, so it owns that corner on its
          own, in no column at all.

          `sidebar:` (globals.css) is what decides between the two
          layouts, and it's about the shape of the screen rather than a
          single width: any device with the room runs the rail beside the
          cards, and one held upright falls back to a single stacked
          column where the filters sit above the grid.

          Full-bleed rather than the old `max-w-7xl mx-auto`: that kept
          the whole grid centered in the viewport, so on anything wider
          than 1280px the sidebar sat inset from the real left edge by
          however much margin was on either side. Dropping the outer
          max-width and pinning padding to `pl-4`/`pr-6` independently
          (not the `px-6` shorthand — Tailwind v4's px-* is one
          `padding-inline` declaration, and overriding only one side of
          that with a `pl-*` utility at a breakpoint is exactly the kind
          of two-declarations-fighting-over-one-property case that's a
          coin flip on source order) means only the LEFT side shrinks at
          the `sidebar:` breakpoint — down to a slim 16px edge margin
          rather than 0: flush against the actual browser chrome read as
          a layout bug, not a deliberate rail. The content column still
          gets its own right-side breathing room and naturally takes up
          the rest of the width as the dominant middle area, without
          needing a second centered max-width of its own. */}
      {/* min-h-screen for the same reason list/page.tsx's #plan has it —
          a floor so there's always genuine room below the hero to
          scroll into, not a targeted height. The sidebar is `sticky`
          within this, so the extra height (on an account with very few
          tracked deals) only ever gives it more room to stick within,
          never breaks its layout. */}
      <div id="deals" className="min-h-screen scroll-mt-16 pl-6 pr-6 sidebar:pl-4 pt-8 grid grid-cols-1 sidebar:grid-cols-[280px_1fr] gap-6 items-start">
        <aside className="sidebar:sticky sidebar:top-20 sidebar:max-h-[calc(100vh-6rem)] sidebar:overflow-y-auto">
          <DealsSidebar
            user={user}
            pillMerchants={pillMerchants}
            selectedMerchantIds={selectedMerchantIds}
            setSelectedMerchantIds={setSelectedMerchantIds}
            merchantCounts={merchantCounts}
            categories={categories}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            categoryCounts={categoryCounts}
            sort={sort}
            setSort={setSort}
            sortDir={sortDir}
            setSortDir={setSortDir}
            priceUnits={priceUnits}
            setPriceUnits={setPriceUnits}
            status={status}
            setStatus={setStatus}
            expDays={expDays}
            setExpDays={setExpDays}
            priceMin={priceMin}
            setPriceMin={setPriceMin}
            priceMax={priceMax}
            setPriceMax={setPriceMax}
            advancedCount={advancedCount}
            onClearAdvanced={() => {
              setStatus("active");
              setExpDays(null);
              setPriceUnits([]);
              setPriceMin("");
              setPriceMax("");
            }}
          />
        </aside>

        <div className="min-w-0">
        {/* Signed in but no postal code set — a real account never sees
            the example set, so the grid below is genuinely empty. Takes
            priority over the no-stores banner since picking stores
            requires a postal code first. */}
        {!sessionLoading && isSignedInNoPostal && (
          <GlassCard wrapperClassName="mb-6" surfaceClassName={NUDGE_BANNER_SURFACE}>
            <p className="text-[13px] text-ink">
              <span className="font-mono font-bold uppercase tracking-[0.1em] mr-2">No postal code yet</span>
              Your account doesn&apos;t have a postal code set, so there&apos;s nothing to show — add one to see deals near you.
            </p>
            <Link href="/settings" className={BTN_NUDGE_CTA}>
              Set my postal code →
            </Link>
          </GlassCard>
        )}
        {/* Signed in but no stores picked yet — a real account never sees
            the example set, so the grid below is genuinely empty. */}
        {!sessionLoading && !isSignedInNoPostal && isSignedInNoStores && (
          <GlassCard wrapperClassName="mb-6" surfaceClassName={NUDGE_BANNER_SURFACE}>
            <p className="text-[13px] text-ink">
              <span className="font-mono font-bold uppercase tracking-[0.1em] mr-2">No stores yet</span>
              Your account isn&apos;t tracking any stores, so there&apos;s nothing to show — pick your stores to see deals.
            </p>
            <Link href="/settings" className={BTN_NUDGE_CTA}>
              Pick my stores →
            </Link>
          </GlassCard>
        )}

        {/* Anonymous visitors browse example data for the config-default
            area — say so plainly and point at sign-up. */}
        {!sessionLoading && !user && (
          <GlassCard wrapperClassName="mb-6" surfaceClassName={NUDGE_BANNER_SURFACE}>
            <p className="text-[13px] text-ink">
              <span className="font-mono font-bold uppercase tracking-[0.1em] mr-5">
              You&apos;re seeing deals for {meta?.default_postal_code ? (
                <span className="font-mono font-bold">{meta.default_postal_code}.</span>
              ) : (
                "our default area"
              )}
              </span>
              {"Sign up to see the latest deals near you."}
            </p>
            <Link href="/login" className={BTN_NUDGE_CTA}>
              Sign up →
            </Link>
          </GlassCard>
        )}

        {/* Same translucent-over-the-liquid-ring surface as DealCard and
            the sidebar cards — see the note on GLASS_SURFACE in
            GlassCard.tsx for why a flat colour can't reproduce this.
            A full custom surfaceClassName, not the default — border-2
            border-ink (not border-white/40) so search-streak's flash
            has an element with its own border/shadow to animate. */}
        <GlassCard
          surfaceClassName={`relative overflow-hidden bg-card/90 backdrop-blur-md border-2 border-ink pl-10 pr-4 py-3 transition-colors ${
            streak ? "search-streak" : ""
          }`}
        >
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink font-bold" aria-hidden>⌕</span>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="SEARCH: chicken, milk, pasta…"
            className="w-full bg-transparent font-mono text-sm text-ink placeholder:text-ink-soft/60 outline-none"
          />
        </GlassCard>

        <div className="tear-line tear-shimmer my-5" />

        {/* Result count + page indicator. Everything else that used to
            live on this row is now in the sidebar. */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <span className="font-mono font-bold text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            {loading
              ? "Loading deals…"
              : facetTotal !== null
                ? `${facetTotal.toLocaleString()} deal${facetTotal === 1 ? "" : "s"}`
                : `${deals.length} deal${deals.length === 1 ? "" : "s"}`}
          </span>
          {!loading && !error && page > 1 && (
            <span className="font-mono font-bold text-[11px] text-ink-soft whitespace-nowrap">
              page {page}
            </span>
          )}
        </div>

        {error && (
          <div className="border-2 border-sale bg-sale/10 shadow-[4px_4px_0_var(--color-sale)] p-6 text-center">
            <p className="stamp text-sale-dark text-sm">Deals unavailable</p>
            <p className="text-ink-soft text-sm mt-3">
              We couldn&apos;t load deals right now — give it another try.
            </p>
            <button onClick={() => setReloadKey((k) => k + 1)} className={BTN_FOLLOWUP_CTA}>
              Retry
            </button>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 100} />
            ))}
          </div>
        )}

        {/* isSignedInBlocked already has its own banner above — don't
            pile a second, generic "no deals" message under it. */}
        {!error && !loading && !isSignedInBlocked && deals.length === 0 && (() => {
          // Say WHY it's empty, not just that it is. A newly added store
          // has no data until its first scrape; a store-scoped search
          // isn't the same as searching everywhere.
          // Only meaningful with exactly one store checked — with several
          // checked (or none) there's no single "this one's untracked"
          // story to tell, so it falls through to the generic message.
          const selectedPill =
            selectedMerchantIds.length === 1
              ? pillMerchants.find((m) => m.id === selectedMerchantIds[0])
              : null;
          const filtersActive = !!query || selectedCategories.length > 0 || advancedCount > 0;
          const pillUntracked = selectedPill && !filtersActive && !merchantCounts.has(selectedPill.id);
          const scopedToUserStores = selectedMerchantIds.length === 0 && !!merchantIds;

          return (
            <div className="text-center py-14">
              <span className="stamp text-sale-dark text-lg">
                {pillUntracked ? "No data yet" : "No deals found"}
              </span>
              {/* No card behind any of these — raw gradient background, so
                  --color-ink, not --color-ink-soft. */}
              {pillUntracked ? (
                <p className="text-ink mt-4 max-w-md mx-auto">
                  <span className="font-bold text-ink">{selectedPill.name}</span> is new —
                  its deals arrive after its first scrape
                  {scrapeStatus?.running ? " (one is running now, hang tight)" : ""}.
                </p>
              ) : scopedToUserStores ? (
                <p className="text-ink mt-4 max-w-md mx-auto">
                  Nothing matches in <span className="font-bold text-ink">your {merchantIds?.length} stores</span>.
                  Try a broader term, or{" "}
                  <Link href="/settings" className="font-bold text-ink underline hover:text-sale transition-colors">
                    add more stores
                  </Link>.
                </p>
              ) : (
                <p className="text-ink mt-4">Try a broader term, or clear the filters.</p>
              )}
              {filtersActive && !pillUntracked && (
                <GlassCard
                  as="button"
                  onClick={() => {
                    setQuery("");
                    setSelectedCategories([]);
                    setStatus("all");
                    setExpDays(null);
                    setPriceMin("");
                    setPriceMax("");
                  }}
                  wrapperClassName="inline-block mt-5"
                  surfaceClassName="glow-btn px-4 py-2 bg-card text-ink text-[12px] font-mono font-bold uppercase"
                >
                  ✕ Clear search &amp; filters
                </GlassCard>
              )}
            </div>
          );
        })()}

        {!loading && (
          <>
            <div className="tilt-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {deals.map((deal, i) => (
                <div
                  key={deal.item_id}
                  className="animate-in"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <DealCard
                    deal={deal}
                    categoryAvgPerUnit={deal.category ? categoryAvgPerUnit.get(deal.category) : undefined}
                  />
                </div>
              ))}
            </div>

            <Pagination
              page={page}
              hasMore={hasMore}
              totalPages={facetTotal !== null ? Math.max(1, Math.ceil(facetTotal / PAGE_SIZE)) : null}
              onPage={setPage}
            />

            {!hasMore && deals.length > 0 && page > 1 && (
              <div className="flex items-center gap-3 pb-4 text-ink-soft/60">
                <div className="tear-line flex-1" />
                <span className="font-mono text-[11px] whitespace-nowrap">end of flyer</span>
                <div className="tear-line flex-1" />
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </main>
  );
}

export default function Home() {
  // useSearchParams needs a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
