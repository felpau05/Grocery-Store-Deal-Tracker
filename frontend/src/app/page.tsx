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
import Link from "next/link";
import { useAccount } from "@/lib/account";
import { useKonamiCode } from "@/lib/hooks";

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

  return (
    <div className="flex items-center justify-center gap-2 py-10 flex-wrap">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="btn-brut bg-card px-3 py-1.5 text-ink text-sm font-mono font-bold disabled:opacity-30 disabled:shadow-none"
      >
        ←
      </button>

      {windowStart > 1 && (
        <>
          <button onClick={() => onPage(1)} className="px-3 py-1.5 text-sm font-mono font-bold text-ink-soft hover:text-ink transition-colors">1</button>
          {windowStart > 2 && <span className="px-1 text-ink-soft/50 text-sm font-mono">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPage(p)}
          className={`px-3 py-1.5 text-sm font-mono font-bold border-2 transition-all ${
            p === page
              ? "bg-ink text-paper border-ink shadow-[2px_2px_0_var(--color-sale)]"
              : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
          }`}
        >
          {p}
        </button>
      ))}

      {totalPages !== null && windowEnd < totalPages && (
        <>
          {windowEnd < totalPages - 1 && <span className="px-1 text-ink-soft/50 text-sm font-mono">…</span>}
          <button onClick={() => onPage(totalPages)} className="px-3 py-1.5 text-sm font-mono font-bold text-ink-soft hover:text-ink transition-colors">
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={!canNext}
        className="btn-brut bg-card px-3 py-1.5 text-ink text-sm font-mono font-bold disabled:opacity-30 disabled:shadow-none"
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
  const [category, setCategory] = useState<string | null>(searchParams.get("category"));
  const [categories, setCategories] = useState<string[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState<number | null>(() => {
    const m = Number(searchParams.get("merchant"));
    return Number.isInteger(m) && m > 0 ? m : null;
  });
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
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const advancedCount =
    (status !== "all" ? 1 : 0) +
    (expDays !== null ? 1 : 0) +
    (priceMin !== "" ? 1 : 0) +
    (priceMax !== "" ? 1 : 0);

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

  // Reset to page 1 and scroll up when filters change — but NOT on plain
  // page navigation, which would otherwise yank the user back to the top
  // every time they click "next".
  useEffect(() => {
    setPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [query, category, merchantId, sort, sortDir, priceUnits, status, expDays, priceMin, priceMax]);

  // Keep filters in the URL (?q=beef&category=meat&merchant=234) so the
  // search is bookmarkable and survives back-navigation from /item/[id].
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    if (merchantId) params.set("merchant", String(merchantId));
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
  }, [query, category, merchantId, status, expDays, priceMin, priceMax, sort, sortDir, priceUnits, page]);

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
        category: category ?? undefined,
        merchantId: merchantId ?? undefined,
        // Scope to the account's stores unless a single pill is active
        merchantIds: merchantId === null ? merchantIds ?? undefined : undefined,
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
  }, [sessionLoading, query, category, merchantId, merchantIds, effectivePostal, sort, sortDir, priceUnits, status, expDays, priceMin, priceMax, page, reloadKey, facetTotal, isSignedInBlocked]);

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
      category: category ?? undefined,
      merchantId: merchantId ?? undefined,
      merchantIds: merchantId === null ? merchantIds ?? undefined : undefined,
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
  }, [sessionLoading, query, category, merchantId, merchantIds, effectivePostal, status, priceUnits, expDays, priceMin, priceMax, reloadKey, isSignedInBlocked]);

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
      <div className="max-w-5xl mx-auto px-6 pt-12">
        <header className="mb-8 relative">
          <div className="halftone absolute -top-4 right-0 w-40 h-24 opacity-60 hidden sm:block" aria-hidden />
          <span className="sticker text-[11px] text-ink mb-4">This week&apos;s flyer</span>
          <h1 className="font-display text-5xl sm:text-6xl text-ink leading-[0.92] mt-3">
            What&apos;s on sale{" "}
            <span className="relative inline-block text-paper bg-sale px-2 -rotate-1">near you</span>
          </h1>
          <p className="text-ink-soft mt-4 max-w-lg font-medium">
            Live deals pulled from local grocery flyers — sorted, normalized, and priced per unit so you can actually compare.
          </p>
        </header>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-2">
        {/* Signed in but no postal code set — a real account never sees
            the example set, so the grid below is genuinely empty. Takes
            priority over the no-stores banner since picking stores
            requires a postal code first. */}
        {!sessionLoading && isSignedInNoPostal && (
          <div className="brut bg-tag/30 px-4 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[13px] text-ink">
              <span className="font-mono font-bold uppercase tracking-[0.1em] mr-2">No postal code yet</span>
              Your account doesn&apos;t have a postal code set, so there&apos;s nothing to show — add one to see deals near you.
            </p>
            <Link
              href="/settings"
              className="btn-brut px-3.5 py-1.5 bg-sale-dark text-paper font-mono font-bold text-[12px] uppercase shrink-0"
            >
              Set my postal code →
            </Link>
          </div>
        )}
        {/* Signed in but no stores picked yet — a real account never sees
            the example set, so the grid below is genuinely empty. */}
        {!sessionLoading && !isSignedInNoPostal && isSignedInNoStores && (
          <div className="brut bg-tag/30 px-4 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[13px] text-ink">
              <span className="font-mono font-bold uppercase tracking-[0.1em] mr-2">No stores yet</span>
              Your account isn&apos;t tracking any stores, so there&apos;s nothing to show — pick your stores to see deals.
            </p>
            <Link
              href="/settings"
              className="btn-brut px-3.5 py-1.5 bg-sale-dark text-paper font-mono font-bold text-[12px] uppercase shrink-0"
            >
              Pick my stores →
            </Link>
          </div>
        )}

        {/* Anonymous visitors browse example data for the config-default
            area — say so plainly and point at sign-up. */}
        {!sessionLoading && !user && (
          <div className="brut bg-tag/30 px-4 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap">
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
            <Link
              href="/login"
              className="btn-brut px-3.5 py-1.5 bg-sale-dark text-paper font-mono font-bold text-[12px] uppercase shrink-0"
            >
              Sign up →
            </Link>
          </div>
        )}

        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink font-bold" aria-hidden>⌕</span>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="SEARCH: chicken, milk, pasta…"
            className={`w-full bg-card border-2 border-ink shadow-[3px_3px_0_var(--color-ink)] pl-10 pr-4 py-3 font-mono text-sm text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors ${
              streak ? "search-streak" : ""
            }`}
          />
        </div>

        <div className="tear-line tear-shimmer my-5" />

        {pillMerchants.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-ink mr-1">
              {user && user.merchants.length > 0 ? `${user.name}'s stores` : "Stores"}
            </span>
            <button
              onClick={() => setMerchantId(null)}
              className={`text-[12px] font-mono font-bold px-3 py-1 border-2 transition-all ${
                merchantId === null
                  ? "bg-produce text-paper border-ink shadow-[2px_2px_0_var(--color-ink)]"
                  : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {user && user.merchants.length > 0 ? "All my stores" : "All stores"}
              {merchantCounts.size > 0 && (
                <span className="opacity-70">
                  {" "}
                  ({[...merchantCounts.values()].reduce((a, b) => a + b, 0)})
                </span>
              )}
            </button>
            {pillMerchants.map((m) => (
              <button
                key={m.id}
                onClick={() => setMerchantId(m.id)}
                className={`text-[12px] font-mono font-bold px-3 py-1 border-2 transition-all ${
                  merchantId === m.id
                    ? "bg-produce text-paper border-ink shadow-[2px_2px_0_var(--color-ink)]"
                    : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
                }`}
              >
                {m.name}
                {merchantCounts.has(m.id) && (
                  <span className="opacity-70"> ({merchantCounts.get(m.id)})</span>
                )}
              </button>
            ))}
            {user && (
              <Link
                href="/settings"
                className="text-[11px] font-mono font-bold text-ink-soft/70 hover:text-sale transition-colors ml-1"
              >
                ✎ edit
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-ink mr-1">Type</span>
            <button
              onClick={() => setCategory(null)}
              className={`text-[12px] font-mono font-bold px-3 py-1 border-2 transition-all ${
                category === null
                  ? "bg-ink text-paper border-ink shadow-[2px_2px_0_var(--color-ink)]"
                  : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              All
              {categoryCounts.size > 0 && (
                <span className="opacity-70">
                  {" "}
                  ({[...categoryCounts.values()].reduce((a, b) => a + b, 0)})
                </span>
              )}
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-[12px] font-mono font-bold px-3 py-1 border-2 transition-all capitalize ${
                  category === c
                    ? "bg-ink text-paper border-ink shadow-[2px_2px_0_var(--color-ink)]"
                    : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
                }`}
              >
                {c}
                {categoryCounts.has(c) && (
                  <span className="opacity-70"> ({categoryCounts.get(c)})</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
            {/* Unit filter — multiselect */}
            <div className="flex items-center gap-1">
              {(["g", "ml", "each"] as PriceUnit[]).map((u) => {
                const label = u === "g" ? "Weight" : u === "ml" ? "Volume" : "Qty";
                const active = priceUnits.includes(u);
                return (
                  <button
                    key={u}
                    onClick={() =>
                      setPriceUnits((prev) =>
                        active ? prev.filter((x) => x !== u) : [...prev, u]
                      )
                    }
                    className={`text-[11px] font-mono font-bold px-2.5 py-1 border-2 transition-all ${
                      active
                        ? "bg-tag border-ink text-ink shadow-[2px_2px_0_var(--color-ink)]"
                        : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Sort mode + direction */}
            <div className="flex items-center bg-card border-2 border-ink p-0.5">
              {(["price", "price_per_unit"] as SortMode[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`text-[11px] font-mono font-bold px-2.5 py-1 transition-colors whitespace-nowrap ${
                    sort === s ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {s === "price" ? "$ total" : "$/unit"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              className="btn-brut bg-card px-2.5 py-1 font-mono font-bold text-[13px] text-ink"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>

            <button
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className={`btn-brut px-2.5 py-1 font-mono font-bold text-[11px] uppercase ${
                showAdvanced || advancedCount > 0 ? "bg-ink text-paper" : "bg-card text-ink"
              }`}
            >
              Filters{advancedCount > 0 ? ` (${advancedCount})` : ""} {showAdvanced ? "−" : "+"}
            </button>

            {!loading && !error && page > 1 && (
              <span className="font-mono font-bold text-[11px] text-ink-soft whitespace-nowrap">
                page {page}
              </span>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div className="brut animate-in p-4 mb-6 grid sm:grid-cols-3 gap-5">
            {/* Deal status */}
            <div>
              <p className="font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-ink mb-2">
                Deal status
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStatus(s.id)}
                    className={`text-[11px] font-mono font-bold px-2.5 py-1 border-2 transition-all ${
                      status === s.id
                        ? "bg-ink text-paper border-ink shadow-[2px_2px_0_var(--color-sale)]"
                        : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry window */}
            <div>
              <p className="font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-ink mb-2">
                Expires
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => setExpDays(o.days)}
                    className={`text-[11px] font-mono font-bold px-2.5 py-1 border-2 transition-all ${
                      expDays === o.days
                        ? "bg-sale text-paper border-ink shadow-[2px_2px_0_var(--color-ink)]"
                        : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price range */}
            <div>
              <p className="font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-ink mb-2">
                Price range
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  placeholder="min $"
                  className="w-20 bg-paper border-2 border-ink px-2 py-1 font-mono text-[12px] text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
                />
                <span className="font-mono font-bold text-ink-soft">–</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  placeholder="max $"
                  className="w-20 bg-paper border-2 border-ink px-2 py-1 font-mono text-[12px] text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
                />
              </div>
              {advancedCount > 0 && (
                <button
                  onClick={() => {
                    setStatus("all");
                    setExpDays(null);
                    setPriceMin("");
                    setPriceMax("");
                  }}
                  className="mt-2.5 font-mono font-bold text-[10px] uppercase text-ink-soft/70 hover:text-sale transition-colors"
                >
                  ✕ Reset filters
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="border-2 border-sale bg-sale/10 shadow-[4px_4px_0_var(--color-sale)] p-6 text-center">
            <p className="stamp text-sale-dark text-sm">Deals unavailable</p>
            <p className="text-ink-soft text-sm mt-3">
              We couldn&apos;t load deals right now — give it another try.
            </p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="btn-brut mt-4 px-4 py-2 bg-ink text-paper text-sm font-mono font-bold"
            >
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
          const selectedPill = merchantId !== null ? pillMerchants.find((m) => m.id === merchantId) : null;
          const filtersActive = !!query || category !== null || advancedCount > 0;
          const pillUntracked = selectedPill && !filtersActive && !merchantCounts.has(selectedPill.id);
          const scopedToUserStores = merchantId === null && !!merchantIds;

          return (
            <div className="text-center py-14">
              <span className="stamp text-sale-dark text-lg">
                {pillUntracked ? "No data yet" : "No deals found"}
              </span>
              {pillUntracked ? (
                <p className="text-ink-soft mt-4 max-w-md mx-auto">
                  <span className="font-bold text-ink">{selectedPill.name}</span> is new —
                  its deals arrive after its first scrape
                  {scrapeStatus?.running ? " (one is running now, hang tight)" : ""}.
                </p>
              ) : scopedToUserStores ? (
                <p className="text-ink-soft mt-4 max-w-md mx-auto">
                  Nothing matches in <span className="font-bold text-ink">your {merchantIds?.length} stores</span>.
                  Try a broader term, or{" "}
                  <Link href="/settings" className="font-bold text-ink underline hover:text-sale transition-colors">
                    add more stores
                  </Link>.
                </p>
              ) : (
                <p className="text-ink-soft mt-4">Try a broader term, or clear the filters.</p>
              )}
              {filtersActive && !pillUntracked && (
                <button
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                    setStatus("all");
                    setExpDays(null);
                    setPriceMin("");
                    setPriceMax("");
                  }}
                  className="btn-brut mt-5 px-4 py-2 bg-card text-ink text-[12px] font-mono font-bold uppercase"
                >
                  ✕ Clear search &amp; filters
                </button>
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
