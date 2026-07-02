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
    <div className="h-64 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#D9CDB0" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5B5648" }} axisLine={{ stroke: "#D9CDB0" }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#5B5648" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={42}
          />
          <Tooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
            contentStyle={{ background: "#FFFDF8", border: "1px solid #D9CDB0", borderRadius: 2, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="price" stroke="#D6402C" strokeWidth={2} dot={{ r: 3, fill: "#D6402C" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
