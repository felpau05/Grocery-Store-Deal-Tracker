"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { runLengthDays, type PriceRun } from "@/lib/priceHistory";

/** "2026-08-27" as a LOCAL date — `new Date("2026-08-27")` is UTC
 *  midnight, which renders as Aug 26 anywhere west of Greenwich. */
function shortDate(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function localTs(s: string): number {
  return new Date(`${s}T00:00:00`).getTime();
}

/** The axis works in timestamps, and those are already local midnight —
 *  format them straight rather than round-tripping through an ISO
 *  string, which is UTC and shifts the date east of Greenwich. */
function tsLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/**
 * Deal prices for this product, one point per flyer. Everything
 * structural (grid, axes, tooltip frame) is a hairline in --color-line
 * with ink-muted labels; the ONE saturated thing is the price line
 * itself, in the accent green that carries price everywhere else.
 *
 * A flyer that hasn't started yet is real data but not history, so it
 * draws as a dashed continuation of the same line rather than as another
 * past point — otherwise the chart's rightmost dot tells you the price
 * moved when what actually happened is next week's flyer was published.
 */
export default function PriceChart({
  runs,
  store,
  upcomingFrom,
}: {
  /** Flyer windows already collapsed into runs — see mergePriceRuns. */
  runs: PriceRun[];
  store: string;
  /** `valid_from` of the first not-yet-started window, if any. */
  upcomingFrom?: string | null;
}) {
  /* A run is plotted at its START, which leaves one long run with a
     single point and nothing to draw. It still has something to SHOW —
     "$1.77, held for four weeks" is the answer this chart exists to give
     — so a lone run gets a second point at the day it ends and draws as
     a flat line across the weeks it actually covered. Both ends keep the
     run's full label, so the tooltip reads "Aug 27 – Sep 23" wherever
     you touch it rather than "Sep 23 – Sep 23" at the right edge.

     A single SHORT window is different: that's this week's flyer and
     nothing before it, which is genuinely no history. */
  const ends: { ts: number; window: string; price: number }[] = runs.flatMap((run) => {
    const label = `${shortDate(run.valid_from)} – ${shortDate(run.valid_to)}`;
    const head = { ts: localTs(run.valid_from), window: label, price: run.price };
    if (runs.length > 1 || runLengthDays(run) < 14) return [head];
    return [head, { ts: localTs(run.valid_to), window: label, price: run.price }];
  });

  if (ends.length < 2) {
    return (
      <div className="card-soft px-4 py-5">
        <p className="text-ink-soft text-[13px]">No earlier deals for this product at {store} yet.</p>
      </div>
    );
  }

  const cutoff = upcomingFrom ? localTs(upcomingFrom) : Infinity;
  // The last window that has already started: the dashed segment has to
  // include it, or it draws detached from the line it continues.
  const joinTs = Math.max(...ends.map((p) => p.ts).filter((ts) => ts < cutoff));

  const data = ends.map((point) => {
    const future = point.ts >= cutoff;
    return {
      ts: point.ts,
      window: point.window,
      future,
      // Two keys, one series: the segments share the join point so the
      // dashed part starts where the solid part ends.
      price: future ? null : point.price,
      // Only when there IS a future window — otherwise this would draw a
      // second dot on top of the last real one for no reason.
      upcoming: upcomingFrom && (future || point.ts === joinTs) ? point.price : null,
    };
  });

  return (
    <div className="card-soft h-64 wide:h-80 pt-4 pr-3 pb-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            // A real time scale, not one tick per flyer: a 6-week gap and a
            // 1-week gap have to *look* different or the line draws a shape
            // the prices never made.
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => tsLabel(Number(v))}
            tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
            axisLine={{ stroke: "var(--color-line)" }}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
            width={52}
          />
          <Tooltip
            // Hand-rolled rather than formatter/labelStyle props: the two
            // series share their join point, so the default renderer prints
            // that one price twice.
            content={<PricePoint store={store} />}
            cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
          />
          <Line
            // Smooth, not stepped: `monotone` curves between points without
            // overshooting them, so a dip never draws below its real low.
            type="monotone"
            dataKey="price"
            stroke="var(--color-accent)"
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 4, fill: "var(--color-surface)", stroke: "var(--color-accent)", strokeWidth: 2 }}
            activeDot={{ r: 4.5, fill: "var(--color-accent)", stroke: "var(--color-surface)", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="upcoming"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeDasharray="4 4"
            connectNulls={false}
            dot={{ r: 4, fill: "var(--color-surface)", stroke: "var(--color-accent)", strokeWidth: 2 }}
            activeDot={{ r: 4.5, fill: "var(--color-accent)", stroke: "var(--color-surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One flyer window: what it cost, where, and whether it has happened.
 *  `datum` comes off either series — they carry the same payload. */
function PricePoint({
  active,
  payload,
  store,
}: {
  active?: boolean;
  payload?: { payload: { window: string; future: boolean; price: number | null; upcoming: number | null } }[];
  store?: string;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  const price = datum.price ?? datum.upcoming;
  if (price === null || price === undefined) return null;

  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] shadow-soft-md">
      <p className="text-ink-soft font-semibold">{datum.window}</p>
      <p className="text-ink mt-0.5">
        <span className="font-mono tabular-nums font-semibold">${price.toFixed(2)}</span> at {store}
      </p>
      {datum.future && <p className="text-ink-muted mt-0.5">Next week&apos;s flyer — not yet in effect</p>}
    </div>
  );
}
