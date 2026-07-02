import Link from "next/link";
import type { StorePlan } from "@/lib/api";

/**
 * One store's shopping plan, rendered as a thermal-printer receipt:
 * monospace, dotted leaders between item and price, a torn zigzag
 * bottom edge (.receipt in globals.css). Fits the flyer/coupon theme
 * rather than fighting it with a generic card.
 */
export default function ReceiptCard({
  plan,
  index,
}: {
  plan: StorePlan;
  index: number;
}) {
  return (
    <div
      className="receipt bg-card border border-border-tan rounded-t-sm px-5 pt-4 pb-6 animate-print"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="text-center border-b border-dashed border-border-tan pb-3 mb-3">
        <div className="font-display font-extrabold text-ink text-lg leading-tight">
          {plan.merchant_name}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-1">
          Stop #{index + 1} · {plan.items.length}{" "}
          {plan.items.length === 1 ? "item" : "items"}
        </div>
      </div>

      <ul className="space-y-2">
        {plan.items.map((item) => (
          <li key={item.item_id} className="flex items-end font-mono text-[13px]">
            <Link
              href={`/item/${item.item_id}`}
              className="text-ink hover:text-sale transition-colors truncate max-w-[60%]"
              title={item.name}
            >
              {item.name}
            </Link>
            <span className="leader" aria-hidden />
            <span className="text-ink font-semibold whitespace-nowrap">
              ${item.price.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-dashed border-border-tan mt-3 pt-3 flex items-baseline justify-between font-mono">
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink-soft">
          Subtotal
        </span>
        <span className="font-bold text-ink text-base">
          ${plan.subtotal.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
