"use client";

import { useEffect, useState } from "react";
import {
  fetchCategories,
  fetchDeals,
  fetchMerchants,
  type Deal,
  type Merchant,
  type SortMode,
  type SortDir,
  type PriceUnit,
} from "@/lib/api";
import DealCard from "@/components/DealCard";
import DealsTicker from "@/components/DealsTicker";

const PAGE_SIZE = 24;

function Pagination({
  page,
  hasMore,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  onPage: (p: number) => void;
}) {
  const pages = hasMore ? [page - 1, page, page + 1].filter((p) => p > 0) : Array.from({ length: page }, (_, i) => i + 1);

  if (page === 1 && !hasMore) return null;

  return (
    <div className="flex items-center justify-center gap-1 py-10">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-sm border border-border-tan text-ink-soft text-sm font-mono disabled:opacity-30 hover:border-ink hover:text-ink transition-colors"
      >
        ←
      </button>

      {page > 3 && (
        <>
          <button onClick={() => onPage(1)} className="px-3 py-1.5 rounded-sm text-sm font-mono text-ink-soft hover:text-ink transition-colors">1</button>
          <span className="px-1 text-ink-soft/50 text-sm font-mono">…</span>
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPage(p)}
          className={`px-3 py-1.5 rounded-sm text-sm font-mono transition-colors ${
            p === page
              ? "bg-ink text-paper border border-ink"
              : "border border-border-tan text-ink-soft hover:border-ink hover:text-ink"
          }`}
        >
          {p}
        </button>
      ))}

      <button
        onClick={() => onPage(page + 1)}
        disabled={!hasMore}
        className="px-3 py-1.5 rounded-sm border border-border-tan text-ink-soft text-sm font-mono disabled:opacity-30 hover:border-ink hover:text-ink transition-colors"
      >
        →
      </button>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState<number | null>(null);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [tickerDeals, setTickerDeals] = useState<Deal[]>([]);
  const [sort, setSort] = useState<SortMode>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [priceUnits, setPriceUnits] = useState<PriceUnit[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    fetchMerchants().then(setMerchants).catch(() => {});
    fetchDeals({ status: "active", limit: 16 }).then(setTickerDeals).catch(() => {});
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [query, category, merchantId, sort, sortDir, priceUnits]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      fetchDeals({
        q: query || undefined,
        category: category ?? undefined,
        merchantId: merchantId ?? undefined,
        status: "all",
        sort,
        sortDir,
        priceUnits: priceUnits.length > 0 ? priceUnits : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
        .then((res) => {
          setDeals(res);
          setHasMore(res.length === PAGE_SIZE);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, category, merchantId, sort, sortDir, priceUnits, page]);

  return (
    <main className="pb-16">
      <div className="max-w-5xl mx-auto px-6 pt-10">
        <header className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sale mb-1">
            This week&apos;s flyer
          </p>
          <h1 className="font-display font-black text-4xl text-ink tracking-tight leading-none">
            What&apos;s on sale near you
          </h1>
          <p className="text-ink-soft mt-2">
            Live deals pulled from local grocery flyers — sorted, normalized, and priced per unit so you can actually compare.
          </p>
        </header>
      </div>

      <DealsTicker deals={tickerDeals} />

      <div className="max-w-5xl mx-auto px-6 pt-8">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft/60" aria-hidden>⌕</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for chicken, milk, pasta..."
            className="w-full bg-card border border-border-tan rounded-sm pl-10 pr-4 py-2.5 text-ink placeholder:text-ink-soft/70 focus:border-sale outline-none transition-colors"
          />
        </div>

        <div className="tear-line my-5" />

        {merchants.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70 mr-1">Stores</span>
            <button
              onClick={() => setMerchantId(null)}
              className={`text-[12px] font-medium px-3 py-1 rounded-full border transition-colors ${
                merchantId === null ? "bg-produce text-paper border-produce" : "border-border-tan text-ink-soft hover:border-ink"
              }`}
            >
              All stores
            </button>
            {merchants.map((m) => (
              <button
                key={m.id}
                onClick={() => setMerchantId(m.id)}
                className={`text-[12px] font-medium px-3 py-1 rounded-full border transition-colors ${
                  merchantId === m.id ? "bg-produce text-paper border-produce" : "border-border-tan text-ink-soft hover:border-ink"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70 mr-1">Type</span>
            <button
              onClick={() => setCategory(null)}
              className={`text-[12px] font-medium px-3 py-1 rounded-full border transition-colors ${
                category === null ? "bg-ink text-paper border-ink" : "border-border-tan text-ink-soft hover:border-ink"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-[12px] font-medium px-3 py-1 rounded-full border transition-colors capitalize ${
                  category === c ? "bg-ink text-paper border-ink" : "border-border-tan text-ink-soft hover:border-ink"
                }`}
              >
                {c}
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
                    className={`text-[11px] font-mono px-2.5 py-1 rounded-sm border transition-colors ${
                      active
                        ? "bg-tag border-tag/80 text-ink"
                        : "border-border-tan text-ink-soft hover:border-ink hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Sort mode + direction */}
            <div className="flex items-center bg-paper border border-border-tan rounded-sm p-0.5">
              {(["price", "price_per_unit"] as SortMode[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap ${
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
              className="border border-border-tan rounded-sm px-2.5 py-1 font-mono text-[13px] text-ink-soft hover:border-ink hover:text-ink transition-colors"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>

            {!loading && !error && (
              <span className="font-mono text-[11px] text-ink-soft whitespace-nowrap">
                pg. {page}{hasMore ? "+" : ""}
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sale-dark">
            Couldn&apos;t reach the deals API. Is the backend running on{" "}
            <code className="font-mono">localhost:8000</code>?
          </p>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 bg-card/60 border border-border-tan rounded-sm animate-pulse"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        )}

        {!error && !loading && deals.length === 0 && (
          <p className="text-ink-soft">No deals match that search. Try a broader term, or clear the filters.</p>
        )}

        {!loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deals.map((deal, i) => (
                <div
                  key={deal.item_id}
                  className="animate-in"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <DealCard deal={deal} />
                </div>
              ))}
            </div>

            <Pagination page={page} hasMore={hasMore} onPage={setPage} />

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
