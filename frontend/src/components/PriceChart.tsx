"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { HistoryPoint } from "@/lib/api";

/**
 * 30-day price history. Everything structural (grid, axes, tooltip
 * frame) is a hairline in --color-line with ink-muted labels; the ONE
 * saturated thing is the price line itself, in the accent green that
 * carries price everywhere else in the app.
 */
export default function PriceChart({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <div className="card-soft px-4 py-5">
        <p className="text-ink-soft text-[13px]">
          Not enough scrapes yet to chart a trend — check back after a few more nights of scraping.
        </p>
      </div>
    );
  }

  const data = history.map((point) => ({
    date: new Date(point.scraped_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
    price: point.price,
  }));

  return (
    <div className="card-soft h-64 wide:h-80 pt-4 pr-3 pb-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
            axisLine={{ stroke: "var(--color-line)" }}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={44}
          />
          <Tooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
            cursor={{ stroke: "var(--color-line-strong)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "0 2px 4px rgba(23, 33, 26, 0.06), 0 8px 20px rgba(23, 33, 26, 0.07)",
            }}
            labelStyle={{ color: "var(--color-ink-soft)", fontWeight: 600 }}
            itemStyle={{ color: "var(--color-ink)" }}
          />
          <Line
            type="step"
            dataKey="price"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-surface)", stroke: "var(--color-accent)", strokeWidth: 2 }}
            activeDot={{ r: 4.5, fill: "var(--color-accent)", stroke: "var(--color-surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
