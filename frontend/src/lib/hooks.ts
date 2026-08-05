"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  optimizeTrip,
  type OptimizeMode,
  type OptimizeOption,
  type OptimizeResult,
  type StorePlan,
} from "./api";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/**
 * Fires `onTrigger` when the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) is typed
 * anywhere on the page. Progress resets on a wrong key, but a stray ↑
 * counts as the start of a new attempt.
 */
export function useKonamiCode(onTrigger: () => void) {
  const callback = useRef(onTrigger);
  callback.current = onTrigger;

  useEffect(() => {
    let progress = 0;
    const handler = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === KONAMI[progress]) {
        progress += 1;
        if (progress === KONAMI.length) {
          progress = 0;
          callback.current();
        }
      } else {
        progress = key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/**
 * Resolves the gap between a full-screen hero and the content below it
 * to one side or the other once scrolling stops — never resting in
 * between — but overwhelmingly biased toward content. Built for "/"
 * (MelonHero) and /list (TripIntro), both exactly `h-screen`, so the
 * content-side edge is just `window.innerHeight` minus the fixed
 * header's height (see HEADER_H below — it has to leave room for the
 * header, same as scroll-mt-16 already does for an anchor click).
 *
 * This is the FOURTH design. The previous three each taught something:
 *
 * 1. Native CSS `scroll-snap-type: mandatory` — a fast scroll deep in
 *    the content could carry the resting position back into the hero's
 *    height range, and snap (only two points to choose from, no notion
 *    of "how deep is deep enough to stop caring") completed the jump
 *    the rest of the way there. Trapped anyone scrolling up a little
 *    from deep in the list.
 *
 * 2. A "settle near each edge, free in the middle" rewrite — fixed the
 *    deep-scroll trap, but resting freely in the middle turned out to
 *    be its own problem: the hero stayed visible (mid-gap) as often as
 *    it doesn't, which read as "hovering" rather than as a resolved
 *    page.
 *
 * 3. A real-time velocity-gated wall — block a GENTLE crossing into the
 *    hero instantly, let a fast flick through. Sound in theory, but
 *    browsers don't dispatch 'scroll' events at a rate that makes
 *    instantaneous velocity a reliable "gentle vs. forceful" signal —
 *    trackpad inertia and animation-frame-batched dispatch can both
 *    read as fast when the actual gesture wasn't, so normal scrolling
 *    kept punching through.
 *
 * So: back to "always resolve," which #2 showed is the right base
 * behaviour — but with NO free middle this time, and the hero side's
 * capture zone shrunk to almost nothing (HERO_CAPTURE_PX) rather than
 * splitting the gap down the middle. Practically: scroll anywhere in
 * the gap and stop — anywhere except the last ~60px before the true
 * top — and it resolves to content, every time. The only way to
 * actually land on the hero is to scroll almost the entire way there,
 * which is what "forcing your way up" concretely means here: no
 * velocity math, no gesture-speed guessing, just "did you go far
 * enough."
 */
export function useHeroSnap() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const SETTLE_MS = 150; // no native 'scrollend' fallback needed past this delay
    // Matches SiteHeader's h-16 AND the content container's own
    // scroll-mt-16 (#deals, #plan) — that scroll-margin is exactly why
    // a normal anchor click lands with clearance under the fixed
    // header instead of the header covering the content's top edge.
    // scroll-margin only applies to anchor navigation/scrollIntoView,
    // NOT a raw scrollTo — so without subtracting it here too, this
    // would land 64px further down than intended and the header would
    // cover the first 64px of #deals/#plan every time it fired.
    const HEADER_H = 64;
    // Only the last ~60px before the true top resolves UP; everything
    // else in the gap, however close to the hero, resolves DOWN. This
    // is the one knob that makes reaching the hero "hard" — shrink it
    // further and it takes an even more deliberate scroll to get there.
    const HERO_CAPTURE_PX = 60;

    const settle = () => {
      // Clamped to the page's REAL max scroll, not just innerHeight -
      // HEADER_H: on a short page (an empty #plan, say — nothing in the
      // list yet, so it's a few hundred px, not enough to fill a second
      // screen), that nominal edge can be a position the document
      // physically doesn't reach.
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const contentTop = Math.min(window.innerHeight - HEADER_H, maxScroll);
      const y = window.scrollY;
      if (y <= 0 || y >= contentTop) return; // resolved already, or genuinely in the content — leave it alone
      window.scrollTo({ top: y <= HERO_CAPTURE_PX ? 0 : contentTop, behavior: "smooth" });
    };

    // 'scrollend' (Chrome 114+, Firefox 109+) fires exactly when the
    // browser's own momentum scrolling has actually stopped — precise,
    // where available. Everywhere else, treat a quiet period on the
    // 'scroll' event as "stopped"; not as exact, but close enough that
    // the two are indistinguishable in practice.
    //
    // Checked via a cast, not `"onscrollend" in window` directly: TS's
    // control-flow narrowing treats an `in` check on a bare identifier
    // as a type guard, and since this project's DOM lib doesn't declare
    // `onscrollend` on `Window` at all, it concluded no value could ever
    // satisfy the truthy branch and narrowed `window` itself to `never`
    // inside it — a compile error on plain, correct runtime feature
    // detection. Checking membership on a cast expression instead isn't
    // a bare identifier, so it isn't eligible for that narrowing.
    if ("onscrollend" in (window as unknown as Record<string, unknown>)) {
      window.addEventListener("scrollend", settle);
      return () => window.removeEventListener("scrollend", settle);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, []);
}

/**
 * Owns the trip-planner state: builds a plan from grocery queries,
 * tracks the user's per-item picks, and derives receipts/totals from
 * those picks so the page component is pure layout.
 */
export function useOptimize() {
  const [result, setResult] = useState<OptimizeResult | null>(null);
  // query -> chosen item_id; starts as the optimizer's pick, then the
  // user can swap any line for another cheap option.
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastArgs = useRef<{ queries: string[]; mode: OptimizeMode; merchantIds?: number[]; postalCode?: string } | null>(null);

  const build = useCallback(
    async (
      queries: string[],
      mode: OptimizeMode,
      merchantIds?: number[],
      postalCode?: string,
      // Picks from a saved plan being reopened — reapplied on top of this
      // fresh call's own results wherever the referenced item_id is still
      // around, so a restored plan always reflects today's actual deals
      // rather than trusting a stale snapshot. Anything no longer
      // available is left on the optimizer's own fresh pick and counted,
      // so the caller can tell the user rather than silently swapping it.
      preferredPicks?: Record<string, number>,
    ): Promise<{ unavailableCount: number }> => {
    if (queries.length === 0) return { unavailableCount: 0 };
    lastArgs.current = { queries, mode, merchantIds, postalCode };
    setLoading(true);
    setError(false);
    try {
      const res = await optimizeTrip(queries, mode, merchantIds, postalCode);
      setResult(res);
      const initial: Record<string, number> = {};
      for (const sp of res.store_plans) {
        for (const it of sp.items) initial[it.query] = it.item_id;
      }
      let unavailableCount = 0;
      if (preferredPicks) {
        for (const [query, itemId] of Object.entries(preferredPicks)) {
          const stillThere =
            (res.options[query] ?? []).some((o) => o.item_id === itemId) ||
            res.store_plans.some((sp) => sp.items.some((it) => it.query === query && it.item_id === itemId));
          if (stillThere) initial[query] = itemId;
          else unavailableCount++;
        }
      }
      setPicks(initial);
      return { unavailableCount };
    } catch {
      setError(true);
      setResult(null);
      return { unavailableCount: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(() => {
    if (lastArgs.current) {
      build(lastArgs.current.queries, lastArgs.current.mode, lastArgs.current.merchantIds, lastArgs.current.postalCode);
    }
  }, [build]);

  const setPick = useCallback((query: string, itemId: number) => {
    setPicks((prev) => ({ ...prev, [query]: itemId }));
  }, []);

  // Options per query, with the optimizer's own pick merged in — in
  // "fewest stops" mode the planned item can fall outside the top-5
  // cheapest, and it still has to be selectable.
  const optionRows = useMemo(() => {
    const map: Record<string, OptimizeOption[]> = {};
    if (!result) return map;
    for (const [q, opts] of Object.entries(result.options)) map[q] = [...opts];
    for (const sp of result.store_plans) {
      for (const it of sp.items) {
        const rows = (map[it.query] ??= []);
        if (!rows.some((r) => r.item_id === it.item_id)) {
          rows.push({
            item_id: it.item_id,
            name: it.name,
            merchant_id: sp.merchant_id,
            merchant_name: sp.merchant_name,
            price: it.price,
            size: null,
            size_unit: null,
            product_image: null,
          });
          rows.sort((a, b) => a.price - b.price);
        }
      }
    }
    return map;
  }, [result]);

  // Receipts recomputed from the current picks, grouped by store.
  const plans = useMemo<StorePlan[]>(() => {
    const byStore = new Map<number, StorePlan>();
    for (const [query, itemId] of Object.entries(picks)) {
      const row = optionRows[query]?.find((r) => r.item_id === itemId);
      if (!row) continue;
      const plan =
        byStore.get(row.merchant_id) ??
        ({ merchant_id: row.merchant_id, merchant_name: row.merchant_name, subtotal: 0, items: [] } as StorePlan);
      plan.items.push({ query, item_id: row.item_id, name: row.name, price: row.price });
      plan.subtotal = Math.round((plan.subtotal + row.price) * 100) / 100;
      byStore.set(row.merchant_id, plan);
    }
    return [...byStore.values()].sort((a, b) => b.subtotal - a.subtotal);
  }, [picks, optionRows]);

  const totalCost = useMemo(
    () => Math.round(plans.reduce((sum, p) => sum + p.subtotal, 0) * 100) / 100,
    [plans],
  );

  const swappable = useMemo(
    () => Object.entries(optionRows).filter(([, rows]) => rows.length > 1),
    [optionRows],
  );

  return {
    result, loading, error, build, retry, picks, setPick, plans, totalCost, swappable,
    // The queries the currently-shown result was actually built from —
    // exposed so "Save as draft" records exactly what was submitted,
    // decoupled from whatever the cart happens to hold by the time the
    // user clicks Save.
    lastQueries: lastArgs.current?.queries ?? [],
  };
}
