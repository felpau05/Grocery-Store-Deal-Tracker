"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchBestDeals,
  fetchDealFacets,
  fetchMerchants,
  type BestDeal,
  type Merchant,
} from "@/lib/api";
import ActionCard from "@/components/ActionCard";
import { IconCart, IconReceipt, IconSettings } from "@/components/icons";
import DealCard from "@/components/DealCard";
import { FRESH_CATEGORIES } from "@/components/CategoryBrowser";
import GlassCard, { NUDGE_BANNER_SURFACE } from "@/components/GlassCard";
import { useAccount } from "@/lib/account";
import { BTN_FOLLOWUP_CTA, BTN_NUDGE_CTA } from "@/lib/button";

/** Six, not twenty-four. This strip is a taste of what's below, and the
 *  whole point of the rewrite is that scrolling off the hero lands on
 *  ACTIONS rather than on the wall of every item. Browsing lives on
 *  /deals, where it is organised by category.
 *
 *  This is also why the strip's grid steps 1 → 2 → 3 → 6 columns and
 *  skips 4: six divides evenly by all of those and not by four, so a
 *  wide screen gets one full row rather than a row of four and an
 *  orphan pair. Raising this number to fill a 4-column step would be
 *  the tail wagging the dog — the count is the design decision and the
 *  breakpoints follow it. */
const BEST_COUNT = 6;

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
      <div className="h-3 w-24 rounded-control bg-surface-2 mt-2" />
    </div>
  );
}

/**
 * Everything under MelonHero on "/": the account nudges, a one-line
 * context read-out, four large actions, and a SHORT "this week's best"
 * strip that points at /deals for the rest.
 *
 * It carries `id="deals"` because that id is the hero's scroll-cue
 * anchor (`href="#deals"`) and the thing `useHeroSnap("deals")` measures
 * to find where the hero actually ends. Renaming it means changing both
 * of those in the same commit; the section under the hero simply needs
 * to keep an id, and this is it.
 *
 * The fetching here is deliberately the same shape as /deals': wait for
 * the session (`sessionLoading`) before firing anything, never fall back
 * to the example region once someone is signed in, and drop any response
 * that lands after its scope has been superseded.
 */
export default function HomeHub() {
  const { user, merchantIds, meta, scrapeStatus, loading: sessionLoading } = useAccount();

  const [total, setTotal] = useState<number | null>(null);
  const [deals, setDeals] = useState<BestDeal[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantsLoaded, setMerchantsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Same rules as /deals: a signed-in account only ever sees its own
  // region and its own stores, and an account missing either has no
  // scope to query at all — omitting the postal code would read as
  // "anonymous" downstream and quietly serve the example area.
  const effectivePostal = user?.postal_code ?? undefined;
  const isSignedInNoStores = !!user && user.merchants.length === 0;
  const isSignedInNoPostal = !!user && !user.postal_code;
  const isSignedInBlocked = isSignedInNoStores || isSignedInNoPostal;

  // `merchants` is [] both before the fetch lands and when the area
  // genuinely has none, and "0 stores" is a claim we can only make once
  // we know — same conflation as reporting an unreachable session as
  // signed out. Until then the sentence simply omits the count.
  const storeCount = user ? user.merchants.length : merchants.length;
  const knowStoreCount = user ? true : merchantsLoaded;

  // Anonymous visitors browse the example area; its store list is the
  // only way to say "across N stores" for them.
  useEffect(() => {
    if (sessionLoading || user) return;
    let cancelled = false;
    fetchMerchants()
      .then((m) => {
        if (!cancelled) {
          setMerchants(m);
          setMerchantsLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, user, reloadKey]);

  useEffect(() => {
    if (sessionLoading) return;
    if (isSignedInBlocked) {
      setTotal(0);
      setDeals([]);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);

    const scope = {
      merchantIds: merchantIds ?? undefined,
      postalCode: effectivePostal,
      status: "active" as const,
    };

    Promise.all([
      fetchDealFacets(scope),
      // Biggest drop against the product's own average over the last
      // 12 flyer weeks first, then random fill (see backend
      // db.best_deals) — most products don't recur within the window.
      // Fresh shelves only: across the whole catalogue it was pop and
      // energy drinks. Over-fetched so the name dedupe below still has
      // six left — flyers routinely list the same product twice (one
      // per size, or one per store).
      fetchBestDeals({
        merchantIds: scope.merchantIds,
        postalCode: scope.postalCode,
        categories: FRESH_CATEGORIES,
        limit: BEST_COUNT * 4,
      }),
    ])
      .then(([facets, best]) => {
        // A slower response from a since-superseded scope (the session
        // resolving, a scrape landing) must never overwrite newer state.
        if (cancelled) return;
        setTotal(facets.total);
        const seen = new Set<string>();
        setDeals(
          best
            .filter((d) => {
              const key = d.name.trim().toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, BEST_COUNT),
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionLoading, user, merchantIds, effectivePostal, isSignedInBlocked, reloadKey]);

  // A finished background scrape is exactly when someone is looking —
  // refresh the count and the strip rather than make them reload.
  const scrapeRunning = scrapeStatus?.running ?? false;
  const prevScrapeRunning = useRef(scrapeRunning);
  useEffect(() => {
    if (prevScrapeRunning.current && !scrapeRunning) setReloadKey((k) => k + 1);
    prevScrapeRunning.current = scrapeRunning;
  }, [scrapeRunning]);

  /* Only the states worth interrupting for. The line used to read out a
     tally — "530 deals across 12 stores near K2C3G1." — under every
     visit, which is a statistic about the database rather than anything
     to do; the same numbers are on the deals page beside the filters
     that change them. Nothing renders when there's nothing wrong. */
  const contextLine = (() => {
    if (sessionLoading) return null;
    if (isSignedInNoPostal) return "Add a postal code to see deals near you.";
    if (isSignedInNoStores) return "Pick the stores you shop at to see their deals.";
    if (error) return "Deals are unavailable right now.";
    return null;
  })();

  return (
    // scroll-mt tracks SiteHeader's own h-14 sm:h-16, so the hero's
    // "#deals" anchor lands flush under the fixed header. It must never
    // EXCEED the header's height: overshooting opens a strip between the
    // header's bottom edge and the content's top that shows the hero
    // behind it — which at this anchor means a band of the melon's red.
    // Undershooting only tucks the content's first pixel or two under
    // the header, which is invisible.
    // min-h-screen gives useHeroSnap a real floor to scroll into — same
    // reason /list's #plan has one.
    //
    // At `wide:` it is EXACTLY one screen under the header, so the page
    // ends where this section does: one scroll off the melon lands here
    // and there's nothing further down. Nothing scrolls inside it either:
    // on a short laptop the deal photos shrink to the space that's left
    // (DealCard's fillAtWide). Phones keep the natural height and an
    // ordinary scroll.
    <section
      id="deals"
      className="min-h-screen scroll-mt-14 sm:scroll-mt-16 px-6 pt-12 pb-4 wide:min-h-0 wide:h-[calc(100svh-var(--header-h))] wide:overflow-hidden wide:pt-6 wide:pb-5 wide:[@media(max-height:820px)]:pt-4 wide:[@media(max-height:820px)]:pb-4"
    >
      <div className="max-w-[1400px] mx-auto wide:h-full wide:flex wide:flex-col">
        {/* ── Account nudges ─────────────────────────────────────── */}
        {!sessionLoading && isSignedInNoPostal && (
          <GlassCard wrapperClassName="mb-6" surfaceClassName={NUDGE_BANNER_SURFACE}>
            <p className="text-[13px] text-ink">
              <span className="font-semibold mr-1.5">No postal code yet.</span>
              Your account doesn&apos;t have a postal code set, so there&apos;s nothing to show — add
              one to see deals near you.
            </p>
            <Link href="/settings" className={BTN_NUDGE_CTA}>
              Set my postal code →
            </Link>
          </GlassCard>
        )}
        {!sessionLoading && !isSignedInNoPostal && isSignedInNoStores && (
          <GlassCard wrapperClassName="mb-6" surfaceClassName={NUDGE_BANNER_SURFACE}>
            <p className="text-[13px] text-ink">
              <span className="font-semibold mr-1.5">No stores yet.</span>
              Your account isn&apos;t tracking any stores, so there&apos;s nothing to show — pick your
              stores to see deals.
            </p>
            <Link href="/settings" className={BTN_NUDGE_CTA}>
              Pick my stores →
            </Link>
          </GlassCard>
        )}
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

        {/* ── Context line ───────────────────────────────────────── */}
        <header className="mb-8 wide:mb-5 wide:[@media(max-height:820px)]:mb-4 shrink-0">
          <h2 className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] text-ink leading-tight">
            What would you like to do?
          </h2>
          {contextLine && <p className="text-[15px] text-ink-soft mt-2">{contextLine}</p>}
        </header>

        {/* ── The three actions ──────────────────────────────────── */}
        {/* Postal code and stores used to be two equal tiles here, but
            they're really one job — the account's scope — so they're one
            tile now. First, since it's the one thing worth checking
            before the other two mean anything — "browse deals" against
            no stores is just the example area.

            Three EQUAL columns once there's room for them. It used to
            take a double-width column out of a 4-column grid, which
            made the row read as one big tile and two leftovers rather
            than as three choices. The sm: span is only there because a
            2-column grid can't hold three tiles without an orphan. */}
        <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 wide:grid-cols-3 gap-5">
          <ActionCard
            href={user ? "/settings" : "/login"}
            icon={<IconSettings />}
            title="Manage account"
            compactWhenShort
            wrapperClassName="sm:col-span-2 wide:col-span-1"
            detail={
              user
                ? "Your postal code and the stores you shop at."
                : `Browsing ${
                    meta?.default_postal_code ? `the example area (${meta.default_postal_code})` : "the example area"
                  }${
                    knowStoreCount ? `, ${storeCount} ${storeCount === 1 ? "store" : "stores"}` : ""
                  }. Sign in to use your own.`
            }
          />
          <ActionCard
            href="/deals"
            icon={<IconCart />}
            title="Browse deals"
            compactWhenShort
            detail="Everything on sale near you, by category."
          />
          <ActionCard
            href="/list"
            icon={<IconReceipt />}
            title="Plan a shopping trip"
            compactWhenShort
            detail="Build a list, get the cheapest way to buy it."
          />
        </div>

        {/* ── This week's best ───────────────────────────────────── */}
        {!isSignedInBlocked && (
          <section className="mt-14 wide:mt-6 wide:[@media(max-height:820px)]:mt-4 wide:flex-1 wide:min-h-0 wide:flex wide:flex-col" aria-label="This week's best deals">
            <div className="shrink-0 flex items-end justify-between gap-4 flex-wrap mb-5 wide:mb-4">
              <div>
                <h3 className="font-display text-[22px] text-ink leading-tight">
                  This week&apos;s best
                </h3>
              </div>
              <Link
                href="/deals"
                className="btn-soft-quiet px-4 py-2 text-sm font-semibold whitespace-nowrap"
              >
                {total !== null ? `See all ${total.toLocaleString()} deals →` : "See all deals →"}
              </Link>
            </div>

            {error ? (
              <div className="card-soft p-6 text-center">
                <p className="label-soft text-danger text-sm">Deals unavailable</p>
                <p className="text-ink-soft text-sm mt-2">
                  We couldn&apos;t load deals right now — give it another try.
                </p>
                <button onClick={() => setReloadKey((k) => k + 1)} className={BTN_FOLLOWUP_CTA}>
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 wide:grid-cols-6 wide:grid-rows-[minmax(0,1fr)] wide:flex-1 wide:min-h-0 wide:max-h-[340px] gap-5 wide:gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} delay={i * 100} />
                ))}
              </div>
            ) : deals.length === 0 ? (
              <p className="text-ink-soft text-sm py-8 text-center">
                Nothing on sale in your stores right now.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 wide:grid-cols-6 wide:grid-rows-[minmax(0,1fr)] wide:flex-1 wide:min-h-0 wide:max-h-[340px] gap-5 wide:gap-4">
                {deals.map((deal, i) => (
                  <div key={deal.item_id} className="animate-in wide:min-h-0" style={{ animationDelay: `${i * 35}ms` }}>
                    <DealCard deal={deal} fillAtWide />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
