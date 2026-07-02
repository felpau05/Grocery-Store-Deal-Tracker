import Link from "next/link";
import type { Deal } from "@/lib/api";
import PriceTag from "./PriceTag";

const CATEGORY_COLORS: Record<string, string> = {
  meat: "bg-sale/10 text-sale-dark",
  seafood: "bg-sale/10 text-sale-dark",
  produce: "bg-produce/10 text-produce",
  dairy: "bg-ink/5 text-ink-soft",
  bakery: "bg-tag/30 text-ink-soft",
  frozen: "bg-ink/5 text-ink-soft",
  beverages: "bg-produce/10 text-produce",
};

function formatSize(size: number | null, unit: "g" | "ml" | null): string | null {
  if (size === null || unit === null) return null;
  if (size >= 1000) return `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)} ${unit === "g" ? "kg" : "L"}`;
  return `${size} ${unit}`;
}

function unitLabel(deal: Deal): string | null {
  if (deal.price_per_unit_label) return `/ ${deal.price_per_unit_label}`;
  if (deal.price_unit === "each") return "/ each";
  return null;
}

export default function DealCard({ deal }: { deal: Deal }) {
  const sizeLabel = formatSize(deal.size, deal.size_unit);
  const categoryClass = deal.category ? CATEGORY_COLORS[deal.category] ?? "bg-ink/5 text-ink-soft" : null;
  const unit = unitLabel(deal);

  return (
    <Link
      href={`/item/${deal.item_id}`}
      className="group relative overflow-hidden block bg-card border border-border-tan rounded-sm p-4 hover:-translate-y-0.5 hover:shadow-[3px_4px_0_rgba(28,26,22,0.12)] transition-all"
    >
      <span className="sheen" aria-hidden />
      <div className="flex items-start gap-3 mb-3">
        {deal.product_image && (
          <img
            src={deal.product_image}
            alt={deal.name}
            className="w-16 h-16 object-contain rounded-sm flex-shrink-0 bg-ink/5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-ink-soft font-medium truncate">
            {deal.merchant_name}
          </div>
          <h3 className="font-display font-extrabold text-ink text-base leading-tight mt-0.5 group-hover:text-sale transition-colors">
            {deal.name}
          </h3>
          {unit && (
            <span className="inline-block font-mono text-[10px] text-ink-soft/70 mt-0.5">
              {unit}
            </span>
          )}
        </div>
        <PriceTag price={deal.price} perUnit={deal.price_per_unit} perUnitLabel={deal.price_per_unit_label} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {categoryClass && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-sm ${categoryClass}`}>
            {deal.category}
          </span>
        )}
        {sizeLabel && (
          <span className="text-[11px] font-mono text-ink-soft">{sizeLabel}</span>
        )}
        {deal.brands.length > 0 && (
          <span className="text-[11px] text-ink-soft truncate">{deal.brands.join(" · ")}</span>
        )}
      </div>
    </Link>
  );
}
