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
    async (queries: string[], mode: OptimizeMode, merchantIds?: number[], postalCode?: string) => {
    if (queries.length === 0) return;
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
      setPicks(initial);
    } catch {
      setError(true);
      setResult(null);
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

  return { result, loading, error, build, retry, picks, setPick, plans, totalCost, swappable };
}
