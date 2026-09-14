import Link from "next/link";
import type { StorePlan } from "@/lib/api";

/**
 * One store's shopping plan, rendered as a receipt: the merchant at the
 * top, a dotted leader between each item and its price, a ruled
 * subtotal, and an entrance that prints the card down from its top edge
 * (`.animate-print`).
 *
 * The thermal-printer COSTUME is gone — the 2px ink border, the torn
 * zigzag bottom edge (`.receipt::after`, now `display:none`), the
 * uppercase mono item names and the decorative barcode number. What
 * survives is the part that was doing real work: a leader line is the
 * clearest way to tie a name on the left to a price on the right, and
 * the print-down entrance is how you tell four receipts apart as they
 * arrive. Mono is now on the NUMBERS only.
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
      className="receipt bg-surface border border-line px-5 pt-4 pb-5 animate-print"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="text-center border-b border-dashed border-line-strong pb-3 mb-3">
        <div className="font-display text-ink text-lg leading-tight">
          {plan.merchant_name}
        </div>
        <div className="text-[12px] text-ink-muted mt-1">
          Stop <span className="font-mono tabular-nums">{index + 1}</span> ·{" "}
          <span className="font-mono tabular-nums">{plan.items.length}</span>{" "}
          {plan.items.length === 1 ? "item" : "items"}
        </div>
      </div>

      <ul className="space-y-2">
        {plan.items.map((item) => (
          <li key={item.item_id} className="flex items-end text-[13px]">
            <Link
              href={`/item/${item.item_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink hover:text-accent transition-colors truncate max-w-[60%] capitalize"
              title={item.name}
            >
              {item.name.toLowerCase()}
            </Link>
            <span className="leader" aria-hidden />
            <span className="font-mono tabular-nums text-ink font-semibold whitespace-nowrap">
              ${item.price.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-dashed border-line-strong mt-3 pt-3 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink-soft">
          Subtotal
        </span>
        <span className="font-mono tabular-nums font-bold text-ink text-lg">
          ${plan.subtotal.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
