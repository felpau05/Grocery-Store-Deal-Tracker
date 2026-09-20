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
import CategoryBrowser, { categoryLabel } from "@/components/CategoryBrowser";
import DealCard from "@/components/DealCard";
import DealsSidebar from "@/components/DealsSidebar";
import GlassCard, { NUDGE_BANNER_SURFACE } from "@/components/GlassCard";
import Link from "next/link";
import { useAccount } from "@/lib/account";
import { BTN_FOLLOWUP_CTA, BTN_NUDGE_CTA } from "@/lib/button";
import { CHIP_ACTIVE_LIGHT, CHIP_DISABLED_LIGHT, CHIP_QUIET_LIGHT, CHIP_SOFT } from "@/lib/chip";
import { useKonamiCode } from "@/lib/hooks";

const PAGE_SIZE = 24;

const PAGE_WINDOW = 2; // pages shown on either side of the current one

/** Prefix for the per-tab grid scroll offset; the query string is
 *  appended so each filter set remembers its own place. */
const SCROLL_KEY = "deals-scroll:";

/** One end of the "deal ends" window, read off the URL. Null (no
 *  filter) for a missing param and for anything that isn't a
 *  non-negative whole number of days, so a hand-mangled ?exp= widens the
 *  results rather than sending NaN to the API. */
function dayParam(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

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

  // The BODY chip (lib/chip's CHIP_SOFT + the *_LIGHT variants), never
  // the header's CHIP/CHIP_ACTIVE. Those are the header's dark ink glass
  // — a 2px rim and an uppercase mono label — and below the header they
  // read as a stray piece of it rather than as this page's own control.
  // The current page is a filled accent chip: on a calm layout the
  // selected thing is allowed to be the one saturated element in a row.
  return (
    <div className="flex items-center justify-center gap-2 py-10 flex-wrap">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={`${CHIP_SOFT} ${page === 1 ? CHIP_DISABLED_LIGHT : CHIP_QUIET_LIGHT}`}
      >
        ←
      </button>

      {windowStart > 1 && (
        <>
          <button onClick={() => onPage(1)} className={`${CHIP_SOFT} ${CHIP_QUIET_LIGHT}`}>1</button>
          {windowStart > 2 && <span className="px-1 text-ink-muted text-[13px]">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPage(p)}
          aria-current={p === page ? "page" : undefined}
          className={`${CHIP_SOFT} ${p === page ? CHIP_ACTIVE_LIGHT : CHIP_QUIET_LIGHT}`}
        >
          {p}
        </button>
      ))}

      {totalPages !== null && windowEnd < totalPages && (
        <>
          {windowEnd < totalPages - 1 && <span className="px-1 text-ink-muted text-[13px]">…</span>}
          <button onClick={() => onPage(totalPages)} className={`${CHIP_SOFT} ${CHIP_QUIET_LIGHT}`}>
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={!canNext}
        aria-label="Next page"
        className={`${CHIP_SOFT} ${!canNext ? CHIP_DISABLED_LIGHT : CHIP_QUIET_LIGHT}`}
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
    <div className="card-soft animate-shimmer p-4" style={{ animationDelay: `${delay}ms` }} aria-hidden>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-16 h-16 rounded-control bg-surface-3 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-3 w-20 rounded-control bg-surface-3" />
          <div className="h-4 w-3/4 rounded-control bg-surface-3 mt-2" />
          <div className="h-3 w-10 rounded-control bg-surface-2 mt-2" />
        </div>
        <div className="w-16 h-10 rounded-control bg-surface-3 flex-shrink-0" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-4 w-16 rounded-control bg-surface-2" />
        <div className="h-4 w-10 rounded-control bg-surface-2" />
      </div>
      <div className="h-3 w-24 rounded-control bg-surface-2 mt-2" />
    </div>
  );
}

function DealsInner() {
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
  // Facets only list stores that HAVE deals, so an absent id is either
  // "0 this week" or "we haven't asked yet" — this is which.
  const [countsKnown, setCountsKnown] = useState(false);

  // Advanced filters — status, expiry window, price range. Initialized
  // from the URL like the other filters so they're bookmarkable.
  const [status, setStatus] = useState<DealStatus>(() => {
    const s = searchParams.get("status");
    return s === "active" || s === "upcoming" ? s : "all";
  });
  // The two ends of the "deal ends" window, each null when that end is
  // open: `expAfter` is the earliest last-day (?expa=) and `expDays` the
  // latest (?exp=). Two numbers rather than one because the rail's
  // slider now has a thumb on each end.
  const [expDays, setExpDays] = useState<number | null>(() => dayParam(searchParams.get("exp")));
  const [expAfter, setExpAfter] = useState<number | null>(() => dayParam(searchParams.get("expa")));
  const [priceMin, setPriceMin] = useState(searchParams.get("pmin") ?? "");
  const [priceMax, setPriceMax] = useState(searchParams.get("pmax") ?? "");

  // The escape hatch out of the category tiles and into the flat grid of
  // everything. In the URL like every other filter, so "show me all of
  // it" is a bookmarkable state rather than something you have to
  // re-click on every visit.
  const [showEverything, setShowEverything] = useState(() => searchParams.get("all") === "1");

  // Feeds the "Filters (N)" badge on the sidebar's combined status/expiry/
  // price-range/priced-by group.
  const advancedCount =
    (status !== "all" ? 1 : 0) +
    // One filter, not two — both thumbs belong to the same slider.
    (expDays !== null || expAfter !== null ? 1 : 0) +
    (priceMin !== "" ? 1 : 0) +
    (priceMax !== "" ? 1 : 0) +
    (priceUnits.length > 0 ? 1 : 0);

  // Everything the sidebar owns, for the narrow-screen disclosure below:
  // the advanced group plus the store multi-select, each counted once.
  // Distinct from `advancedCount`, which stays exactly what the
  // "Filters" card's own badge means.
  const sidebarCount = advancedCount + (selectedMerchantIds.length > 0 ? 1 : 0);

  // Category-first browsing. With nothing narrowing the results this
  // page opens on category TILES, not on 2,249 cards — "the wall of all
  // the items" was the single complaint that started this rewrite.
  //
  // Only a SEARCH or a picked CATEGORY replaces the tiles with the grid:
  // both name a set of items directly, so the tiles have nothing left to
  // do. The rail's filters (and the store selection) do not — they
  // rescope the counts ON the tiles rather than replacing them, which is
  // the same "browse these shelves" gesture one level up. Ticking a
  // filter used to dump you straight into the flat grid, which took the
  // category browser away exactly when you were still browsing;
  // `categoryCounts` and `facetTotal` come from a facets request that
  // already carries every filter, so the tiles tell the truth about
  // what's left under one.
  const narrowed = !!query || selectedCategories.length > 0;
  const showTiles = !narrowed && !showEverything;

  const browseLabel = query
    ? `Search: “${query}”`
    : selectedCategories.length > 0
      ? selectedCategories.map(categoryLabel).join(", ")
      : "Everything";

  // The one way back to the tiles, from the breadcrumb. Clears the three
  // things that can be hiding them, so it never takes two clicks.
  function backToCategories() {
    setQuery("");
    setSelectedCategories([]);
    setShowEverything(false);
  }

  // Narrow screens only (below the `sidebar:` breakpoint the rail stacks
  // ABOVE the grid, see globals.css): four expanded filter cards pushed
  // the first deal card roughly three screens down. Collapsed behind one
  // labelled, counted button instead — a plain boolean with the open
  // state expressed in CSS rather than a matchMedia read, so there's
  // nothing to get wrong between the server render and hydration, and
  // the rail is simply always shown at `sidebar:` regardless of it.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Secret: fast-typing streak flashes the search border yellow.
  const [streak, setStreak] = useState(false);
  const keyTimes = useRef<number[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [query, selectedCategories, selectedMerchantIds, sort, sortDir, priceUnits, status, expDays, expAfter, priceMin, priceMax]);

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
    if (expAfter !== null) params.set("expa", String(expAfter));
    if (priceMin) params.set("pmin", priceMin);
    if (priceMax) params.set("pmax", priceMax);
    if (sort !== "price") params.set("sort", sort);
    if (sortDir !== "asc") params.set("dir", sortDir);
    if (priceUnits.length > 0) params.set("units", priceUnits.join(","));
    if (page > 1) params.set("page", String(page));
    if (showEverything) params.set("all", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, selectedCategories, selectedMerchantIds, status, expDays, expAfter, priceMin, priceMax, sort, sortDir, priceUnits, page, showEverything]);

  // ── Grid scroll position across Back ────────────────────────────────
  // At `sidebar:` the grid is its own `overflow-y-auto` region and the
  // DOCUMENT never scrolls, so Next's scroll restoration — which restores
  // `window.scrollY` — has nothing to restore and Back from /item/[id]
  // lands you at the top of a grid you were halfway down. The filters
  // survive because they're in the URL; the offset can't go there (it
  // has no business in a shared link) and the URL sync above uses
  // `replaceState` anyway, so there's no history entry to hang it on.
  //
  // sessionStorage instead: per-tab, which is the scope a user expects
  // from Back, and keyed by the query string so a different filter set
  // doesn't inherit an offset from the last one.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const restoredFor = useRef<string | null>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || showTiles) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Throws in some privacy modes; a lost scroll offset is not
        // worth taking the page down over.
        try {
          sessionStorage.setItem(`${SCROLL_KEY}${window.location.search}`, String(el.scrollTop));
        } catch {}
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [showTiles]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || showTiles || loading || deals.length === 0) return;
    const key = `${SCROLL_KEY}${window.location.search}`;
    // Once per filter set: re-running on every render would fight the
    // user's own scrolling.
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    try {
      const saved = Number(sessionStorage.getItem(key));
      if (saved > 0) el.scrollTop = saved;
    } catch {}
  }, [showTiles, loading, deals.length]);

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
        expiresAfterDays: expAfter ?? undefined,
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
  }, [sessionLoading, query, selectedCategories, selectedMerchantIds, merchantIds, effectivePostal, sort, sortDir, priceUnits, status, expDays, expAfter, priceMin, priceMax, page, reloadKey, facetTotal, isSignedInBlocked]);

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
      setCountsKnown(true);
      return;
    }
    let cancelled = false;
    const min = parseFloat(priceMin);
    const max = parseFloat(priceMax);
    const base = {
      q: query || undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      postalCode: effectivePostal,
      status,
      priceUnits: priceUnits.length > 0 ? priceUnits : undefined,
      expiresWithinDays: expDays ?? undefined,
      expiresAfterDays: expAfter ?? undefined,
      priceMin: Number.isFinite(min) && min >= 0 ? min : undefined,
      priceMax: Number.isFinite(max) && max >= 0 ? max : undefined,
    };
    // What's actually showing: every filter, store selection included.
    // Drives the total and the category counts.
    const shown = fetchDealFacets({
      ...base,
      merchantIds: selectedMerchantIds.length > 0 ? selectedMerchantIds : merchantIds ?? undefined,
    });
    // The STORE counts deliberately ignore the store selection. A facet
    // shouldn't filter itself: scoped to the selection, ticking Metro
    // left "All stores" reading 850 instead of the real 4,119 and blanked
    // the count on every other store, so the rail could no longer answer
    // the one question it exists to answer — how much is at each store,
    // and how much there is in total. Same call when nothing is selected,
    // so the common case still costs one request.
    const forStores =
      selectedMerchantIds.length > 0
        ? fetchDealFacets({ ...base, merchantIds: merchantIds ?? undefined })
        : shown;
    Promise.all([shown, forStores])
      .then(([facets, storeFacets]) => {
        // A stale response from a since-superseded scope must never
        // overwrite the counts for whatever's actually showing now.
        if (cancelled) return;
        setFacetTotal(facets.total);
        setCategoryCounts(new Map(facets.categories.map((c) => [c.name, c.count])));
        setMerchantCounts(new Map(storeFacets.merchants.map((m) => [m.id, m.count])));
        setCountsKnown(true);
      })
      .catch(() => {
        // Counts are a nice-to-have — leave pills unlabeled rather than
        // surface a second error state for a non-essential fetch.
        if (!cancelled) {
          setFacetTotal(null);
          setCountsKnown(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, query, selectedCategories, selectedMerchantIds, merchantIds, effectivePostal, status, priceUnits, expDays, expAfter, priceMin, priceMax, reloadKey, isSignedInBlocked]);

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

  const scopeStoreCount = pillMerchants.length;
  const scopePostal = user?.postal_code ?? meta?.default_postal_code ?? null;

  /* At `sidebar:` this page does NOT scroll — the two columns inside it
     do, independently. The whole document scrolling meant the filter
     rail slid away while you were using it, and the page title went with
     it, on a layout that already has the room to keep both. Below
     `sidebar:` it is a single stacked column and the document scrolls
     normally, which is the only thing that works on a phone.

     --header-h is SiteHeader's measured height (it publishes it; see
     there). Subtracting it is what makes this exactly the space left
     under a sticky header — assuming that number is the bug that left
     6px of hero showing under the header on "/". svh, not vh, for the
     reason MelonHero documents at length: it is the viewport actually on
     screen with mobile chrome visible, and it is static. */
  return (
    <main className="pb-16 sidebar:pb-0 sidebar:h-[calc(100svh-var(--header-h))] sidebar:flex sidebar:flex-col sidebar:overflow-hidden">
      {/* No hero on this route — SiteHeader is `sticky` here rather than
          `fixed` (HERO_ROUTES in SiteHeader.tsx), so the page just starts
          under it. The landing hero, its scroll cue and useHeroSnap all
          live on "/" now; this page's job is browsing. */}
      <header className="pl-6 pr-6 sidebar:pl-4 pt-8 sidebar:shrink-0">
        <h1 className="font-display text-[clamp(1.5rem,3vw,2.1rem)] text-ink leading-tight">
          Browse deals
        </h1>
      </header>

      {/* Two columns, filters always the left one: the sidebar is a fixed
          280px rail (320px at `ultra:`, where the grid beside it has
          cards to spare) and the search bar, card grid and paginator
          share the 1fr beside it. The "Slice me" melon is neither — it's `fixed`
          bottom-right in the root layout, so it owns that corner on its
          own, in no column at all.

          `sidebar:` (globals.css) is what decides between the two
          layouts, and it's about the shape of the screen rather than a
          single width: any device with the room runs the rail beside the
          cards, and one held upright falls back to a single stacked
          column where the filters sit above the grid.

          Full-bleed rather than `max-w-7xl mx-auto`: that kept the whole
          grid centered in the viewport, so on anything wider than 1280px
          the sidebar sat inset from the real left edge by however much
          margin was on either side. Dropping the outer max-width and
          pinning padding to `pl-4`/`pr-6` independently (not the `px-6`
          shorthand — Tailwind v4's px-* is one `padding-inline`
          declaration, and overriding only one side of that with a `pl-*`
          utility at a breakpoint is exactly the kind of
          two-declarations-fighting-over-one-property case that's a coin
          flip on source order) means only the LEFT side shrinks at the
          `sidebar:` breakpoint — down to a slim 16px edge margin rather
          than 0: flush against the actual browser chrome read as a
          layout bug, not a deliberate rail. */}
      {/* min-h-screen is a floor so short result sets (a category with
          four items) don't leave the page ending halfway up the screen.
          The sidebar is `sticky` within this, so extra height only ever
          gives it more room to stick within. */}
      <div className="min-h-screen sidebar:min-h-0 sidebar:flex-1 sidebar:overflow-hidden pl-6 pr-6 sidebar:pl-4 pt-6 grid grid-cols-1 sidebar:grid-cols-[280px_1fr] ultra:grid-cols-[320px_1fr] gap-6 items-start sidebar:items-stretch">
        {/* `sticky` is gone: it existed to keep the rail in view while
            the PAGE scrolled, and the page no longer does at this width.
            The rail is simply a full-height column that scrolls its own
            overflow when there are more stores than fit. */}
        <aside className="sidebar:h-full sidebar:overflow-y-auto sidebar:pb-6 sidebar:pr-1">
          {/* The narrow-screen handle for the whole rail. `sidebar:hidden`
              rather than conditional rendering: at `sidebar:` the rail is
              beside the grid and always open, so there's nothing for a
              handle to do there. It carries the same count/± affordance
              as the cards inside it so it reads as one of them. */}
          <button
            onClick={() => setMobileFiltersOpen((v) => !v)}
            aria-expanded={mobileFiltersOpen}
            aria-controls="deals-filter-rail"
            className="sidebar:hidden w-full flex items-center justify-between gap-2 mb-3 rounded-card border border-line bg-surface shadow-soft px-4 py-2.5 text-[14px] font-semibold text-ink hover:border-line-strong transition-colors"
          >
            <span>
              Filters &amp; sorting
              {sidebarCount > 0 && <span className="text-ink-muted"> ({sidebarCount})</span>}
            </span>
            <span aria-hidden className="text-[16px] leading-none text-ink-muted">
              {mobileFiltersOpen ? "−" : "+"}
            </span>
          </button>

          {/* `hidden sidebar:block` — display, not unmounting: every card
              inside keeps its own open/closed state while the rail is
              shut, and the `sidebar:` half guarantees the rail is visible
              on a wide screen no matter what the handle above last set. */}
          <div
            id="deals-filter-rail"
            className={mobileFiltersOpen ? "block" : "hidden sidebar:block"}
          >
          <DealsSidebar
            user={user}
            pillMerchants={pillMerchants}
            selectedMerchantIds={selectedMerchantIds}
            setSelectedMerchantIds={setSelectedMerchantIds}
            merchantCounts={merchantCounts}
            countsKnown={countsKnown}
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
            expAfter={expAfter}
            setExpAfter={setExpAfter}
            priceMin={priceMin}
            setPriceMin={setPriceMin}
            priceMax={priceMax}
            setPriceMax={setPriceMax}
            advancedCount={advancedCount}
            onClearAdvanced={() => {
              // "all", NOT "active": `advancedCount` above counts
              // `status !== "all"`, and status has THREE values, so
              // clearing to "active" left the badge (and the Clear
              // button itself) stuck reading (1) forever — and landed
              // on a filter the page never starts with. "all" is the
              // initial state, so clearing now genuinely returns to it.
              setStatus("all");
              setExpDays(null);
              setExpAfter(null);
              setPriceUnits([]);
              setPriceMin("");
              setPriceMax("");
            }}
          />
          </div>
        </aside>

        {/* Two parts at `sidebar:`: a head that stays put and a body
            that scrolls. The head is everything that describes or
            controls the results — account banners, the search field, the
            "← All categories" breadcrumb and the deal count. None of it
            is worth reading once it has scrolled away, and a search box
            you have to scroll back up to reach is the same mistake as a
            filter rail that slides off.

            Below `sidebar:` both are plain divs and the document scrolls
            the lot, as before. */}
        <div className="min-w-0 sidebar:h-full sidebar:flex sidebar:flex-col sidebar:overflow-hidden">
        <div className="sidebar:shrink-0">
        {/* Signed in but no postal code set — a real account never sees
            the example set, so the grid below is genuinely empty. Takes
            priority over the no-stores banner since picking stores
            requires a postal code first. */}
        {!sessionLoading && isSignedInNoPostal && (
          <GlassCard wrapperClassName="mb-6" surfaceClassName={NUDGE_BANNER_SURFACE}>
            <p className="text-[13px] text-ink">
              <span className="font-semibold mr-1.5">No postal code yet.</span>
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
              <span className="font-semibold mr-1.5">No stores yet.</span>
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
              <span className="font-semibold mr-1.5">
                You&apos;re seeing deals for{" "}
                {meta?.default_postal_code ? (
                  <span className="font-mono">{meta.default_postal_code}</span>
                ) : (
                  "our default area"
                )}
                .
              </span>
              Sign up to see the latest deals near you.
            </p>
            <Link href="/login" className={BTN_NUDGE_CTA}>
              Sign up →
            </Link>
          </GlassCard>
        )}

        {/* Search. A plain white field with a hairline rim and a soft
            focus state, not a card impersonating one. `search-streak`
            (the fast-typing easter egg) animates border-colour and
            box-shadow, so it still needs an element that owns both —
            this is that element. */}
        <div
          className={`relative rounded-card bg-surface border border-line shadow-soft transition-colors focus-within:border-accent ${
            streak ? "search-streak" : ""
          }`}
        >
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted text-[15px]" aria-hidden>
            ⌕
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search chicken, milk, pasta…"
            className="w-full bg-transparent pl-10 pr-4 py-3 text-sm text-ink placeholder:text-ink-muted outline-none"
          />
        </div>

        <div className="rule-soft my-5" />

        {/* One line: where you are inside the category-first browse (and
            the way back out of it — one click returns to the shelves
            rather than making anyone hunt for the checkbox they ticked in
            the rail), the result count, and the page indicator. Not
            rendered on the tiles view, where CategoryBrowser's own "All"
            tile already carries the same number. */}
        {!showTiles && (
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5 text-[13px]">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 flex-wrap">
              <button
                onClick={backToCategories}
                className="font-semibold text-accent-dark hover:text-accent-deep transition-colors"
              >
                ← All categories
              </button>
              <span aria-hidden className="text-ink-muted">/</span>
              <span className="text-ink-soft">{browseLabel}</span>
              <span aria-hidden className="text-ink-muted">·</span>
              <span className="font-semibold text-ink-soft">
                {loading ? (
                  "Loading deals…"
                ) : facetTotal !== null ? (
                  <>
                    <span className="font-mono">{facetTotal.toLocaleString()}</span> deal
                    {facetTotal === 1 ? "" : "s"}
                  </>
                ) : (
                  <>
                    <span className="font-mono">{deals.length}</span> deal{deals.length === 1 ? "" : "s"}
                  </>
                )}
              </span>
            </nav>
            {!loading && !error && page > 1 && (
              <span className="text-ink-muted whitespace-nowrap">
                Page <span className="font-mono">{page}</span>
              </span>
            )}
          </div>
        )}

        </div>

        {/* THE scroll area, and deliberately nothing else: the deal
            cards. Everything above it is either a control you reach for
            while looking at results (search, the filter rail) or a
            readout of what you are looking at (the breadcrumb, the deal
            count) — all of which are useless the moment they scroll off,
            which is what the page-level scroll used to do to them.

            min-h-0 is load-bearing. Without it a flex child refuses to
            shrink below its content, this div grows to fit every card,
            and the overflow silently moves back out to the document —
            the bug looks like "the fix did nothing".

            On the tiles view this div does NOT scroll: CategoryBrowser's
            section is its own scroll area, so this is just a flex column
            for it to fill. */}
        <div
          ref={gridRef}
          className={
            showTiles
              ? "sidebar:flex-1 sidebar:min-h-0 sidebar:flex sidebar:flex-col"
              : "sidebar:flex-1 sidebar:min-h-0 sidebar:overflow-y-auto sidebar:pb-16 sidebar:pr-1"
          }
        >

        {showTiles ? (
          <CategoryBrowser
            categories={categories}
            counts={categoryCounts}
            total={facetTotal}
            loading={sessionLoading || (loading && categoryCounts.size === 0)}
            onSelect={(category) => setSelectedCategories([category])}
            onSeeEverything={() => setShowEverything(true)}
          />
        ) : (
          <>
            {error && (
              <div className="rounded-card border border-danger/30 bg-danger-soft shadow-soft p-6 text-center">
                <p className="label-soft text-danger text-sm">Deals unavailable</p>
                <p className="text-ink-soft text-sm mt-3">
                  We couldn&apos;t load deals right now — give it another try.
                </p>
                <button onClick={() => setReloadKey((k) => k + 1)} className={BTN_FOLLOWUP_CTA}>
                  Retry
                </button>
              </div>
            )}

            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
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
                  <span className="label-soft text-ink text-lg">
                    {pillUntracked ? "No data yet" : "No deals found"}
                  </span>
                  {/* No card behind any of these — the page's own pale
                      background, so --color-ink, not --color-ink-soft. */}
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
                      <Link href="/settings" className="font-semibold text-accent-dark underline hover:text-accent-deep transition-colors">
                        add more stores
                      </Link>.
                    </p>
                  ) : (
                    <p className="text-ink mt-4">Try a broader term, or clear the filters.</p>
                  )}
                  {filtersActive && !pillUntracked && (
                    <button
                      onClick={() => {
                        setQuery("");
                        setSelectedCategories([]);
                        setStatus("all");
                        setExpDays(null);
                        setExpAfter(null);
                        setPriceMin("");
                        setPriceMax("");
                        // priceUnits is part of `advancedCount`, which is
                        // part of `filtersActive` above — leaving it out
                        // meant this button could appear (because a
                        // "Priced by" filter was the only thing active) and
                        // then clear nothing at all when clicked.
                        setPriceUnits([]);
                      }}
                      className="btn-soft-quiet mt-5 px-4 py-2 text-sm font-semibold"
                    >
                      Clear search &amp; filters
                    </button>
                  )}
                </div>
              );
            })()}

            {!loading && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
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
                  <div className="flex items-center gap-3 pb-4 text-ink-muted">
                    <div className="rule-soft flex-1" />
                    <span className="text-[12px] whitespace-nowrap">end of flyer</span>
                    <div className="rule-soft flex-1" />
                  </div>
                )}
              </>
            )}
          </>
        )}
        </div>
      </div>
      </div>
    </main>
  );
}

export default function DealsPage() {
  // useSearchParams needs a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={null}>
      <DealsInner />
    </Suspense>
  );
}
