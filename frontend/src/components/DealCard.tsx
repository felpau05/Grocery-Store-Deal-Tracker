import Link from "next/link";
import type { Deal } from "@/lib/api";
import AddToListButton from "./AddToListButton";
import GlassCard, { GLASS_SURFACE_DENSE } from "./GlassCard";
import PriceTag from "./PriceTag";

/**
 * Only "gone today or tomorrow" (or already gone) changes whether you
 * click. A full "Expires Sep 16" is detail-page material, so anything
 * further out returns null and the card renders no expiry at all.
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
 * One deal in the grid: picture, store, name, price.
 *
 * Category, size, brands, the non-urgent expiry date and the
 * cheap/average/dear verdict all still exist on the item detail page,
 * one click away — a card only has to tell you whether to click it.
 *
 * The layout is a product tile: a full-bleed 4:3 image well at the top
 * (clipped by the surface's own `rounded-card` + `overflow-hidden`),
 * then a text block whose FIRST TWO ROWS ARE FIXED-HEIGHT. That is what
 * keeps a row of cards aligned: store is one line, the name reserves
 * two whether it needs them or not, so every price in a row sits on the
 * same baseline instead of floating wherever its own name happened to
 * stop. Names are ragged; a grid of them shouldn't be.
 *
 * Nothing here is labelled. It carried "Name:", "Price:", "Unit Price:"
 * and "Store:" captions in tiny uppercase before, which cost four rows
 * of grey text per card to announce what a photo, a dollar sign and a
 * supermarket's name already say.
 */
export default function DealCard({
  deal,
  fillAtWide = false,
}: {
  deal: Deal;
  /**
   * At `wide:`, fill the height the parent gives instead of sizing to
   * the 4:3 image: the image well takes whatever is left after the
   * text. For a strip that has to fit a fixed-height screen (the home
   * hub) — a short laptop gets a shorter photo rather than a scrollbar.
   */
  fillAtWide?: boolean;
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
      wrapperClassName={fillAtWide ? "wide:h-full" : ""}
      surfaceClassName={`group flex flex-col ${GLASS_SURFACE_DENSE} ${fillAtWide ? "wide:h-full" : ""}`}
    >
      {/* This well is always FILLED edge to edge, which is what stops a
          row of cards looking ragged: every flyer image arrives a
          different shape, and a plain `object-contain` gave each card a
          differently-sized picture floating in a differently-shaped
          pool of white.

          It's filled by a blurred copy of the product's own photo, not
          by cropping the photo itself. Straight `object-cover` does
          produce one clean band, but on packaged goods it cuts the
          label — a bag of chips lost its brand off the left edge, and
          the brand is most of why you'd click it. Two layers cost
          nothing extra (same URL, one download, the browser serves the
          second from cache) and settle the card's colour as a bonus:
          the well picks up whatever the product is, so a row reads as a
          row of products rather than six white boxes on a pink page. */}
      <div
        className={`relative aspect-[4/3] overflow-hidden border-b border-line bg-surface-2 ${
          fillAtWide ? "wide:aspect-auto wide:flex-1 wide:min-h-12" : ""
        }`}
      >
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
          <>
            {/* Scaled up past the edges so the blur has something to
                bleed FROM — at scale-100 its own softened border shows
                as a grey frame just inside the well. */}
            <img
              src={deal.product_image}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-2xl"
            />
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
          </>
        )}
        {/* Keeps `danger` — expiry is a warning and it should look like
            one. Only the SIZE changed: at full badge size, six cards in
            a row all ending today read as six warning labels across the
            strip, and this is meant to be read once you're already
            looking at one card. It was briefly a dark ink chip, on a
            contrast argument (the pale pink pill is weak on a red-meat
            photo); the pill sits on the white image well rather than on
            the photo itself now, so that argument no longer applies. */}
        {expiry && (
          <span className="badge-soft-danger badge-xs absolute left-2 top-2 shadow-soft">
            {expiry}
          </span>
        )}
      </div>

      <div className={`flex flex-col p-3.5 ${fillAtWide ? "wide:shrink-0" : ""}`}>
        {/* Store first, as the tile's eyebrow — one line, always. */}
        <p className="truncate text-[11.5px] font-medium text-ink-muted">{deal.merchant_name}</p>

        {/* The most legible element on the card, by design. The min-h
            is two lines at this leading: a one-line name leaves the
            gap rather than pulling the price up out of line with its
            neighbours. */}
        <h3 className="font-display mt-1 line-clamp-2 min-h-[2.6em] text-[14.5px] leading-[1.3] text-ink transition-colors group-hover:text-accent">
          {deal.name}
        </h3>

        {/* The add button belongs beside the price, not up in the
            photo's corner: over a full-bleed image it read as part of
            the picture, and on the card's one row of controls it reads
            as the card's one control. Centred against the two price
            lines. */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <PriceTag
            price={deal.price}
            priceUnit={deal.price_unit}
            perUnit={deal.price_per_unit}
            perUnitLabel={deal.price_per_unit_label}
            highConfidence={deal.high_confidence}
          />
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
