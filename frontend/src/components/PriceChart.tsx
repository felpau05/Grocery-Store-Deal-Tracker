"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { HistoryPoint } from "@/lib/api";

export default function PriceChart({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <p className="text-ink-soft text-sm">
        Not enough scrapes yet to chart a trend — check back after a few more nights of scraping.
      </p>
    );
  }

  const data = history.map((point) => ({
    date: new Date(point.scraped_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
    price: point.price,
  }));

  return (
    <div className="h-64 border-2 border-ink bg-card pt-3 pr-2 shadow-[4px_4px_0_var(--color-shadow)]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--color-border-tan)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }} axisLine={{ stroke: "var(--color-ink)" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-ink-soft)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={42}
          />
          <Tooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
            contentStyle={{ background: "var(--color-card)", border: "2px solid var(--color-ink)", borderRadius: 0, fontSize: 12, boxShadow: "3px 3px 0 var(--color-ink)" }}
          />
          <Line type="step" dataKey="price" stroke="var(--color-sale)" strokeWidth={3} dot={{ r: 3.5, fill: "var(--color-sale)", stroke: "var(--color-ink)", strokeWidth: 1.5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
