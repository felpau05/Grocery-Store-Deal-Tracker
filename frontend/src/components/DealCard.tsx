import Link from "next/link";
import type { Deal } from "@/lib/api";
import AddToListButton from "./AddToListButton";
import GlassCard, { GLASS_SURFACE } from "./GlassCard";
import PriceTag from "./PriceTag";

const CATEGORY_COLORS: Record<string, string> = {
  meat: "bg-sale/10 text-sale-dark",
  seafood: "bg-sale/10 text-sale-dark",
  "meat seafood": "bg-sale/10 text-sale-dark",
  deli: "bg-sale/10 text-sale-dark",
  alcohol: "bg-sale/10 text-sale-dark",
  produce: "bg-produce/10 text-produce",
  beverages: "bg-produce/10 text-produce",
  international: "bg-produce/10 text-produce",
  pets: "bg-produce/10 text-produce",
  dairy: "bg-ink/5 text-ink-soft",
  "dairy eggs": "bg-ink/5 text-ink-soft",
  frozen: "bg-ink/5 text-ink-soft",
  "canned goods": "bg-ink/5 text-ink-soft",
  "personal care": "bg-ink/5 text-ink-soft",
  household: "bg-ink/5 text-ink-soft",
  other: "bg-ink/5 text-ink-soft",
  bakery: "bg-tag/30 text-ink-soft",
  breakfast: "bg-tag/30 text-ink-soft",
  "breakfast and cereal": "bg-tag/30 text-ink-soft",
  "dry goods pasta": "bg-tag/30 text-ink-soft",
  pantry: "bg-tag/30 text-ink-soft",
  snacks: "bg-tag/30 text-ink-soft",
  babies: "bg-tag/30 text-ink-soft",
};

function formatSize(size: number | null, unit: "g" | "ml" | null): string | null {
  if (size === null || unit === null) return null;
  if (size >= 1000) return `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)} ${unit === "g" ? "kg" : "L"}`;
  return `${size} ${unit}`;
}

function expiryInfo(validTo: string): { label: string; urgent: boolean } {
  // Date-only strings parse as UTC midnight; pin to local so "today" is right.
  const end = new Date(validTo.length === 10 ? `${validTo}T00:00:00` : validTo);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(end) - startOfDay(new Date())) / 86_400_000);

  if (days < 0) return { label: "Expired", urgent: true };
  if (days === 0) return { label: "Expires today", urgent: true };
  if (days === 1) return { label: "Expires tomorrow", urgent: true };
  return {
    label: `Expires ${end.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`,
    urgent: days <= 2,
  };
}

function dealScore(perUnit: number, categoryAvg: number): { emoji: string; label: string } {
  const ratio = perUnit / categoryAvg;
  if (ratio < 0.85) return { emoji: "🟢", label: "Great deal" };
  if (ratio <= 1.1) return { emoji: "🟡", label: "Fair" };
  return { emoji: "🔴", label: "Pricey" };
}

export default function DealCard({
  deal,
  categoryAvgPerUnit,
}: {
  deal: Deal;
  /** Average price-per-unit of visible deals in the same category, for the hover deal-o-meter. */
  categoryAvgPerUnit?: number;
}) {
  const sizeLabel = formatSize(deal.size, deal.size_unit);
  const categoryClass = deal.category ? CATEGORY_COLORS[deal.category] ?? "bg-ink/5 text-ink-soft" : null;
  const expiry = expiryInfo(deal.valid_to);
  const score =
    deal.price_per_unit !== null && categoryAvgPerUnit
      ? dealScore(deal.price_per_unit, categoryAvgPerUnit)
      : null;

  return (
    // interactive: true is the hover-lift (.deal-card-glow's own
    // hover:-translate). `group`/`block` are added on top of the shared
    // GLASS_SURFACE — `group` for `group-hover:text-sale` below, `block`
    // since Link defaults to inline and this needs to be a block-level
    // card. Neither conflicts with any GLASS_SURFACE utility, so it's
    // safe to just append them.
    <GlassCard as={Link} href={`/item/${deal.item_id}`} interactive surfaceClassName={`group block ${GLASS_SURFACE}`}>
      <span className="sheen" aria-hidden />
      <div className="flex items-start gap-3 mb-4">
        {deal.product_image && (
          <img
            src={deal.product_image}
            alt={deal.name}
            className="w-16 h-16 object-contain flex-shrink-0 bg-paper border-2 border-ink/15"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold text-[10px] uppercase tracking-[0.14em] text-ink-soft truncate">
            {deal.merchant_name}
          </div>
          <h3 className="font-display text-ink text-[15px] leading-tight mt-0.5 group-hover:text-sale transition-colors">
            {deal.name}
          </h3>
        </div>
        <PriceTag
          price={deal.price}
          priceUnit={deal.price_unit}
          perUnit={deal.price_per_unit}
          perUnitLabel={deal.price_per_unit_label}
          highConfidence={deal.high_confidence}
        />
      </div>

      {/* One meta line instead of a separate bordered box per fact —
          category still gets its own color-coded pill (it's the one
          thing worth scanning for at a glance); size/brands are now
          plain text, dot-separated, no borders of their own. Was 3
          individually-outlined badges plus 2 more below fighting for
          attention in two thin rows. */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono font-bold text-ink-soft">
        {categoryClass && (
          <span className={`uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5 ${categoryClass}`}>
            {deal.category}
          </span>
        )}
        {(sizeLabel || deal.brands.length > 0) && (
          <span className="truncate">
            {[sizeLabel, deal.brands.join(" · ")].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {expiry.urgent ? (
          <span className="stamp text-sale-dark text-[9px]">{expiry.label}</span>
        ) : (
          <span className="text-[11px] font-mono text-ink-soft/80">{expiry.label}</span>
        )}
        <span className="flex items-center gap-2">
          {/* Deal-o-meter: always visible — rates this price against the
              category average of what's currently on screen. Plain text
              now, not its own bordered badge — one less box. */}
          {score && (
            <span className="text-[10px] font-mono font-bold uppercase text-ink-soft whitespace-nowrap">
              {score.emoji} {score.label}
            </span>
          )}
          <AddToListButton
            name={deal.name}
            compact
            source={{
              itemId: deal.item_id,
              merchantId: deal.merchant_id,
              merchantName: deal.merchant_name,
              price: deal.price,
              image: deal.product_image,
            }}
          />
        </span>
      </div>
    </GlassCard>
  );
}
