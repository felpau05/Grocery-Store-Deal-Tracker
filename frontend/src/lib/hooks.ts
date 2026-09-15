"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
 * Resolves the gap between a tall hero and the content below it to one
 * side or the other once scrolling stops — never resting in between —
 * but overwhelmingly biased toward content. Built for "/" (MelonHero)
 * and /list (TripIntro).
 *
 * `contentId` is the id of the section directly BELOW the hero (#deals,
 * #plan). Its measured document offset is the hero's real height, so
 * the landing spot is that minus the fixed header's measured height (see
 * `headerH` below — it has to leave room for the header, same as the
 * content's own scroll-margin does for an anchor click). Measuring rather than assuming matters:
 * both heroes used to be exactly one viewport tall, so
 * `window.innerHeight` WAS the hero's height — it no longer is
 * (MelonHero is deliberately shorter than a screen now, much shorter on
 * a phone), and hard-coding the viewport would land the scroll in the
 * middle of the grid instead of on its top edge. Omitting `contentId`
 * keeps the old one-viewport assumption as a fallback.
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
 * 4. "Always resolve," no free middle, hero-side capture shrunk to
 *    almost nothing. Right in principle and it shipped — but very eager
 *    in practice: a 120px nudge on the hero answered with the full 816px
 *    of travel, which reads as the page taking the scroll out of your
 *    hands.
 *
 * FIFTH and current: resolve from BOTH ENDS, with the halves meeting in
 * the middle. Inside HERO_CAPTURE_PX of the top it returns to the hero;
 * past FINISH_FRACTION of the way across it finishes the trip down;
 * otherwise the scroll stays where it was put.
 *
 * FINISH_FRACTION is the dial between #4 and #2, and it is set at 25%:
 * cross a quarter of the gap and the page finishes the job, stop short
 * of that and it waits. That keeps #4's "a deliberate
 * scroll always resolves" for the gestures that were actually heading
 * somewhere, without answering a small flick with a whole screen. The
 * cost is #2's: stop in the untouched band and the hero is partly on
 * screen. Toward 0 this becomes #4 again; toward 1, a narrow lip at the
 * very bottom.
 *
 * Separately, and a real bug in every design above: the landing spot
 * subtracted a hardcoded 64px for the header. The header is 58px on a
 * phone, so it parked the hero's last 6px in the strip the header does
 * not cover — a band of the melon's red under the header at the exact
 * position this hook drives to. It is measured now; see `headerH` in
 * settle(). That fix is independent of the snap policy and stays.
 */
export function useHeroSnap(contentId?: string) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const SETTLE_MS = 150; // no native 'scrollend' fallback needed past this delay
    // The first ~60px below the true top resolve back UP to the hero —
    // the knob that makes reaching it "hard": shrink it and it takes an
    // even more deliberate scroll to get there.
    const HERO_CAPTURE_PX = 60;
    // Past 25% of the gap, finish the trip DOWN. Between the two,
    // nothing happens — that untouched band is what stops a small flick
    // on the hero from being answered with a full screen of travel.
    // Toward 0 this becomes "always resolve".
    const FINISH_FRACTION = 0.25;

    const settle = () => {
      // Clamped to the page's REAL max scroll, not just innerHeight -
      // HEADER_H: on a short page (an empty #plan, say — nothing in the
      // list yet, so it's a few hundred px, not enough to fill a second
      // screen), that nominal edge can be a position the document
      // physically doesn't reach.
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      // The hero's real height: the content section starts exactly where
      // the hero ends. Re-measured every settle rather than cached, so a
      // rotation, a font swap or a late-loading banner can't leave a
      // stale landing spot behind.
      const target = contentId ? document.getElementById(contentId) : null;
      const heroBottom = target
        ? target.getBoundingClientRect().top + window.scrollY
        : window.innerHeight;
      /* How much of the top of the screen the fixed header covers.
         MEASURED, not a constant — this was `const HEADER_H = 64`, and
         64 is only right on a desktop. The header bar is `h-14 sm:h-16`
         plus a 2px bottom border, so it is 58px below 640px wide and
         66px above. Landing 64px short of the hero's bottom on a phone
         put the hero's last 6px in the 58..64 strip the header does not
         reach, and 6px of the melon's deep red sat under the header on
         every settle — reading as the landing page bleeding into the
         page below it, at the one resting position this hook drives you
         to.

         Measuring also means an open menu is handled for free: the
         header is genuinely taller then, and the thing that has to cover
         the hero is whatever the header currently is. Ceil so a
         fractional layout can't leave a hairline of it showing. */
      const headerEl = document.querySelector("header");
      const headerH = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 64;
      const contentTop = Math.min(heroBottom - headerH, maxScroll);
      const y = window.scrollY;
      if (y <= 0 || y >= contentTop) return; // resolved already, or genuinely in the content — leave it alone
      if (y <= HERO_CAPTURE_PX) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (y >= contentTop * FINISH_FRACTION) {
        window.scrollTo({ top: contentTop, behavior: "smooth" });
      }
      // Otherwise: mid-gap, and deliberately left where it is.
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
  }, [contentId]);
}

/** The optimizer's own picks, with each item's source deal pinned (and
 *  injected when a full product name didn't search back to itself), then
 *  any saved picks reapplied where still available. Mutates `res` so the
 *  injected deals show up as options and not as unmatched. */
function resolvePicks(
  res: OptimizeResult,
  preferredPicks?: Record<string, number>,
  sourceDeals?: Record<string, OptimizeOption>,
): { picks: Record<string, number>; unavailableCount: number } {
  const picks: Record<string, number> = {};
  for (const sp of res.store_plans) {
    for (const it of sp.items) picks[it.query] = it.item_id;
  }
  for (const [query, deal] of Object.entries(sourceDeals ?? {})) {
    const opts = res.options[query] ?? [];
    if (!opts.some((o) => o.item_id === deal.item_id)) res.options[query] = [deal, ...opts];
    res.unmatched = res.unmatched.filter((q) => q !== query);
    picks[query] = deal.item_id;
  }
  let unavailableCount = 0;
  for (const [query, itemId] of Object.entries(preferredPicks ?? {})) {
    const stillThere =
      (res.options[query] ?? []).some((o) => o.item_id === itemId) ||
      res.store_plans.some((sp) => sp.items.some((it) => it.query === query && it.item_id === itemId));
    if (stillThere) picks[query] = itemId;
    else unavailableCount++;
  }
  return { picks, unavailableCount };
}

// Options per query, with the optimizer's own pick merged in — in
// "fewest stops" mode the planned item can fall outside the top-5
// cheapest, and it still has to be selectable.
function optionRowsOf(result: OptimizeResult | null): Record<string, OptimizeOption[]> {
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
          product_image: it.product_image ?? null,
        });
        rows.sort((a, b) => a.price - b.price);
      }
    }
  }
  return map;
}

// Receipts from the current picks, grouped by store.
function plansOf(picks: Record<string, number>, optionRows: Record<string, OptimizeOption[]>): StorePlan[] {
  const byStore = new Map<number, StorePlan>();
  for (const [query, itemId] of Object.entries(picks)) {
    const row = optionRows[query]?.find((r) => r.item_id === itemId);
    if (!row) continue;
    const plan =
      byStore.get(row.merchant_id) ??
      ({ merchant_id: row.merchant_id, merchant_name: row.merchant_name, subtotal: 0, items: [] } as StorePlan);
    plan.items.push({ query, item_id: row.item_id, name: row.name, price: row.price, product_image: row.product_image, size: row.size, size_unit: row.size_unit });
    plan.subtotal = Math.round((plan.subtotal + row.price) * 100) / 100;
    byStore.set(row.merchant_id, plan);
  }
  return [...byStore.values()].sort((a, b) => b.subtotal - a.subtotal);
}

const totalOf = (plans: StorePlan[]) => Math.round(plans.reduce((sum, p) => sum + p.subtotal, 0) * 100) / 100;

export type PriceableItem = {
  query: string;
  label: string;
  pick?: number;
  source?: { itemId: number; merchantId: number; merchantName: string; price: number; image: string | null };
};

export function sourceDealsOf(items: PriceableItem[]): Record<string, OptimizeOption> {
  const deals: Record<string, OptimizeOption> = {};
  for (const i of items) {
    if (!i.source) continue;
    deals[i.query] = {
      item_id: i.source.itemId,
      name: i.label,
      merchant_id: i.source.merchantId,
      merchant_name: i.source.merchantName,
      price: i.source.price,
      size: null,
      size_unit: null,
      product_image: i.source.image,
    };
  }
  return deals;
}

/** One-shot pricing outside the planner — the trips list uses it to
 *  bring a trip edited elsewhere (e.g. from a deal card) up to date. */
export async function priceTrip(
  items: PriceableItem[],
  mode: OptimizeMode,
  merchantIds?: number[],
  postalCode?: string,
): Promise<{ picks: Record<string, number>; summary: { totalCost: number; stops: number; plans: StorePlan[] } }> {
  if (items.length === 0) return { picks: {}, summary: { totalCost: 0, stops: 0, plans: [] } };
  const res = await optimizeTrip(items.map((i) => i.query), mode, merchantIds, postalCode);
  const preferred: Record<string, number> = {};
  for (const i of items) if (i.pick !== undefined) preferred[i.query] = i.pick;
  const { picks } = resolvePicks(res, preferred, sourceDealsOf(items));
  const plans = plansOf(picks, optionRowsOf(res));
  return { picks, summary: { totalCost: totalOf(plans), stops: plans.length, plans } };
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
      // The deal an item was added from. A full product name often
      // doesn't search back to itself, so without this a deal you added
      // could come back "unmatched" on its own trip.
      sourceDeals?: Record<string, OptimizeOption>,
    ): Promise<{ unavailableCount: number }> => {
    if (queries.length === 0) {
      setResult(null);
      setPicks({});
      return { unavailableCount: 0 };
    }
    lastArgs.current = { queries, mode, merchantIds, postalCode };
    setLoading(true);
    setError(false);
    try {
      const res = await optimizeTrip(queries, mode, merchantIds, postalCode);
      const { picks: initial, unavailableCount } = resolvePicks(res, preferredPicks, sourceDeals);
      setResult(res);
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

  const optionRows = useMemo(() => optionRowsOf(result), [result]);
  const plans = useMemo(() => plansOf(picks, optionRows), [picks, optionRows]);
  const totalCost = useMemo(() => totalOf(plans), [plans]);

  const swappable = useMemo(
    () => Object.entries(optionRows).filter(([, rows]) => rows.length > 1),
    [optionRows],
  );

  return {
    result, loading, error, build, retry, picks, setPick, plans, totalCost, swappable,
    // The queries the currently-shown result was actually built from —
    // exposed so the planner records exactly what was submitted,
    // decoupled from whatever the cart happens to hold by the time the
    // user clicks Save.
    lastQueries: lastArgs.current?.queries ?? [],
  };
}

/**
 * Modal-dialog plumbing shared by the cart drawer and the trip picker:
 * while `open`, focus moves into `panelRef`, Tab is trapped inside it,
 * Esc calls `onClose`, and body scroll is locked; on close, focus goes
 * back to whatever opened it.
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
      previouslyFocused?.focus();
    };
  }, [open, onClose, panelRef]);
}
