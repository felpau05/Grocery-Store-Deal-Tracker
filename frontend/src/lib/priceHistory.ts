import type { HistoryPoint } from "./api";

/**
 * A stretch of time at one price — one or more flyer windows that ran
 * back to back (or on top of each other) without the price moving.
 */
export type PriceRun = {
  price: number;
  /** First day of the earliest window in the run. */
  valid_from: string;
  /** Last day of the latest one. */
  valid_to: string;
};

/** "2026-08-27" + 1 day, as the same kind of string. Built through a
 *  LOCAL date so it can't shift a day the way `new Date("2026-08-27")`
 *  (UTC midnight) does west of Greenwich. */
function dayAfter(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Flyer windows → the runs a shopper would actually describe.
 *
 * A store doesn't publish one tidy window per week. It runs a 4-week
 * flyer and repeats the same item in each weekly flyer inside it, so the
 * raw history for a product whose price never moved comes back as, say,
 *
 *   Aug 27 – Sep 23  $1.28
 *   Sep 10 – Sep 16  $1.28
 *   Sep 17 – Sep 23  $1.28
 *
 * — three rows, one price, and two of them sitting inside the first.
 * Read as a list that's nonsense, and charted it's three dots on a flat
 * line pretending something happened three times. It's one deal: $1.28
 * from Aug 27 to Sep 23.
 *
 * So windows merge when the price is identical and they overlap or touch
 * (the next one starts no later than the day after this one ends). A
 * price CHANGE always starts a new run, which is the whole point of the
 * chart, and a real gap in time does too — "$1.28, then nothing for six
 * weeks, then $1.28 again" is two deals and should read as two.
 *
 * Windows that haven't started yet never merge into a started one: the
 * page labels those "next week" and the chart draws them as a dashed
 * continuation, and both of those need the future window to stay its own
 * point. `todayKey` is today as "YYYY-MM-DD", local.
 */
export function mergePriceRuns(history: HistoryPoint[], todayKey: string): PriceRun[] {
  const ordered = [...history].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const runs: PriceRun[] = [];

  for (const point of ordered) {
    const last = runs[runs.length - 1];
    const bothStarted = last !== undefined && last.valid_from <= todayKey && point.valid_from <= todayKey;
    const continuous = last !== undefined && point.valid_from <= dayAfter(last.valid_to);

    if (last && bothStarted && continuous && last.price === point.price) {
      // `max`, not "the new one": a weekly flyer nested inside a 4-week
      // one ends BEFORE it, and taking its end would cut the run short.
      if (point.valid_to > last.valid_to) last.valid_to = point.valid_to;
      continue;
    }
    runs.push({ price: point.price, valid_from: point.valid_from, valid_to: point.valid_to });
  }

  return runs;
}

/** How many days a run covers, both ends inclusive. */
export function runLengthDays(run: PriceRun): number {
  const from = new Date(`${run.valid_from}T00:00:00`).getTime();
  const to = new Date(`${run.valid_to}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000) + 1;
}
