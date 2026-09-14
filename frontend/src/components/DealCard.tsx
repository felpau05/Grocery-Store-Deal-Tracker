import Link from "next/link";
import type { Deal } from "@/lib/api";
import AddToListButton from "./AddToListButton";
import GlassCard, { GLASS_SURFACE_DENSE } from "./GlassCard";
import { FIELD_LABEL } from "@/lib/fieldLabel";
import PriceTag from "./PriceTag";

/**
 * Only "gone today or tomorrow" (or already gone) changes whether you
 * click. A full "Expires Sep 16" is detail-page material, so anything
 * further out returns null and the card renders no expiry at all —
 * every card carrying a date was most of what made the old meta rows
 * look like a spec sheet.
 */
function urgentExpiry(validTo: string): string | null {
  // Date-only strings parse as UTC midnight; pin to local so "today" is right.
  const end = new Date(validTo.length === 10 ? `${validTo}T00:00:00` : validTo);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(end) - startOfDay(new Date())) / 86_400_000);

  if (days < 0) return "Expired";
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return null;
}

/**
 * One deal in the grid.
 *
 * This card used to render nine things at once — image, merchant in
 * letterspaced mono caps, name, a rotated price sticker, a colour-coded
 * category pill, size, brand list, an expiry line, and a 🟢/🟡/🔴
 * "deal-o-meter" verdict — twenty-four times a screen. The brief for
 * the redesign was that a card only has to tell you whether to click
 * it, so it is now: picture, name, price, store. Category, size,
 * brands, the non-urgent expiry date and the verdict all still exist on
 * the item detail page, one click away; none of them were deleted from
 * the app, only from this face.
 *
 * The layout is a product tile rather than a row: a full-bleed 4:3
 * image well at the top (clipped by the surface's own `rounded-card` +
 * `overflow-hidden`, so it sits flush into the card's top edge) with
 * the text block under it. That gives the photo roughly 8-10x the area
 * the old 64px bordered thumbnail had, which makes it — not the price
 * sticker — the thing you actually scan.
 */
export default function DealCard({
  deal,
}: {
  deal: Deal;
  /**
   * NOT RENDERED, and that is deliberate — do not go looking for the
   * bug. Its only consumer was the hover "deal-o-meter" (this price vs
   * the average price-per-unit of the visible deals in the same
   * category), which was cut from the card face along with the other
   * spec-sheet fields. The prop stays in the signature because three
   * pages compute and pass it, and because the comparison is worth
   * resurrecting somewhere with room for it — the item page, or a sort
   * mode — rather than being thrown away.
   */
  categoryAvgPerUnit?: number;
}) {
  const expiry = urgentExpiry(deal.valid_to);

  return (
    // GLASS_SURFACE_DENSE, not GLASS_SURFACE: identical surface, minus
    // the p-4. The image has to reach the card's edges, so the padding
    // moves onto the text block below it.
    //
    // `interactive` is the wrapper's hover-lift; `group` drives the
    // name's hover colour and the add button's wake-up; `block` because
    // Link is inline by default and this is a block-level card.
    <GlassCard
      as={Link}
      href={`/item/${deal.item_id}`}
      interactive
      surfaceClassName={`group block ${GLASS_SURFACE_DENSE}`}
    >
      <div className="relative aspect-[4/3] bg-surface-2">
        {/* Sits UNDER the image rather than replacing it, so the same
            markup covers both "no product_image" and "the URL 404'd"
            (the onError below just hides the img and uncovers this).
            A full-bleed well that collapses when there's no photo would
            make every row of the grid a different height. */}
        <span aria-hidden className="absolute inset-0 flex items-center justify-center text-ink-muted/30">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-10 w-10"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.75" cy="9.25" r="1.4" />
            <path d="M20.5 15.5 16 11l-5.25 5.25L8.25 13.75 3.5 18.5" />
          </svg>
        </span>
        {deal.product_image && (
          <img
            src={deal.product_image}
            // Empty alt on purpose: the card's accessible name comes
            // from the product name right below, and announcing it
            // twice per card is noise in a 24-card grid.
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain p-3"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        {expiry && (
          <span className="badge-soft-danger absolute left-2.5 top-2.5 shadow-soft">{expiry}</span>
        )}
      </div>

      <div className="p-4">
        {/* The most legible element on the card, by design. */}
        <h3 className="font-display line-clamp-2 text-[15px] leading-snug text-ink transition-colors group-hover:text-accent">
          <span className={FIELD_LABEL}>Name:</span>
          {deal.name}
        </h3>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <PriceTag
              price={deal.price}
              priceUnit={deal.price_unit}
              perUnit={deal.price_per_unit}
              perUnitLabel={deal.price_per_unit_label}
              highConfidence={deal.high_confidence}
            />
            {/* Quiet and sentence case — it was uppercase letterspaced
                mono, which made the store shout louder than the price. */}
            <p className="mt-2 truncate text-[12px] text-ink-soft">
              <span className={FIELD_LABEL}>Store:</span>
              {deal.merchant_name}
            </p>
          </div>
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
        </div>
      </div>
    </GlassCard>
  );
}
