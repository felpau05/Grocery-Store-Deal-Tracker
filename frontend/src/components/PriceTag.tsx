import { FIELD_LABEL } from "@/lib/fieldLabel";

type PriceTagProps = {
  price: number;
  priceUnit: "g" | "ml" | "each";
  perUnit: number | null;
  perUnitLabel: "kg" | "L" | null;
  highConfidence?: boolean;
};

/**
 * The price, as plain typography.
 *
 * This used to be the app's self-declared "signature element": a -3deg
 * die-cut price-gun sticker with an SVG notch, a punch-hole, faked
 * outline-and-slab drop-shadows and a hover wobble. On a page rendering
 * 24 of them at once it was the loudest object on screen, and it was
 * shouting the one thing nobody needs shouted — a number you can read
 * perfectly well flat.
 *
 * Two distinctions in here carry real meaning and survived the
 * flattening, expressed quietly instead of as decoration:
 *
 *  · `perUnit` — price-per-unit comparison is this whole app's premise,
 *    so it stays on the card face. It's just secondary now: small,
 *    `ink-muted`, under the price rather than beside it. When there's no
 *    size to divide by (`priceUnit === "each"`), the single number IS
 *    both the total and the unit price, so the label says so — "Price /
 *    Unit Price" — rather than splitting into an unlabeled second line.
 *  · `highConfidence` — a `~` prefix marks a price the flyer parser
 *    wasn't sure of. It's a muted tilde plus a softer ink for the whole
 *    price (so an uncertain price reads as slightly provisional at a
 *    glance) rather than its own badge.
 *
 * Mono stays, because these are NUMBERS — the one job the type rules
 * still allow it. `tabular-nums` keeps decimal points aligned down a
 * column of cards.
 *
 * `data-price-tag` must stay on the root element: the deals page's
 * Konami-code easter egg queries it.
 */
export default function PriceTag({ price, priceUnit, perUnit, perUnitLabel, highConfidence = true }: PriceTagProps) {
  // Sold by weight/volume: a real second figure, its own line and label.
  // Sold "each": there's no size to divide by, so the price above already
  // IS the unit price — the top label says both jobs at once and there's
  // no second line to render.
  const priceLabel = perUnit === null && priceUnit === "each" ? "Price / Unit Price:" : "Price:";
  const unitLine = perUnit !== null ? `$${perUnit.toFixed(2)}/${perUnitLabel}` : null;

  return (
    <div
      data-price-tag
      title={highConfidence ? undefined : "Price may be approximate"}
      className="select-none"
    >
      <div
        className={`font-mono font-bold tabular-nums text-[20px] leading-none tracking-tight ${
          highConfidence ? "text-ink" : "text-ink-soft"
        }`}
      >
        <span className={FIELD_LABEL}>{priceLabel}</span>
        {!highConfidence && <span className="font-normal text-ink-muted">~</span>}${price.toFixed(2)}
      </div>
      {unitLine !== null && (
        <div className="mt-1.5 font-mono tabular-nums text-[11px] leading-none text-ink-muted">
          <span className={FIELD_LABEL}>Unit Price:</span>
          {unitLine}
        </div>
      )}
    </div>
  );
}
