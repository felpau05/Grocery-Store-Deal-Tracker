type PriceTagProps = {
  price: number;
  priceUnit: "g" | "ml" | "each";
  perUnit: number | null;
  perUnitLabel: "kg" | "L" | null;
  highConfidence?: boolean;
};

/**
 * The price, as plain typography: the figure, then its comparison
 * basis on the line under it.
 *
 * Two distinctions in here carry real meaning:
 *
 *  · `perUnit` — price-per-unit comparison is this whole app's premise,
 *    so it stays on the card face, as the quiet half of the pair. It
 *    gets its OWN LINE and the word "per" spelled out, because the two
 *    figures are the one place on this card where dropping the old
 *    "Price:" / "Unit Price:" captions actually cost something: side by
 *    side and both in mono, "$1.48 $3.26/kg" is two numbers with
 *    nothing saying which is which. A line break and one English word
 *    do that job without a caption. When there's no size to divide by
 *    (`priceUnit === "each"`) the figure IS both the total and the unit
 *    price, and "each" says so.
 *  · `highConfidence` — a `~` prefix marks a price the flyer parser
 *    wasn't sure of, plus a `title` explaining it. The tilde is the
 *    whole marker: the figure itself stays the same accent green as a
 *    confirmed one. Greying it out as well was tried and dropped —
 *    across a grid, two shades of price read as two kinds of card
 *    rather than as one uncertain number, and the price is the one
 *    thing on the card that should look the same on every card.
 *
 * Mono stays, because these are NUMBERS — the one job the type rules
 * still allow it. `tabular-nums` keeps figures the same width down a
 * column of cards.
 *
 * The price carries the accent green — the app's stated rule is one
 * green for price, CTA and selected state, and this is the price.
 *
 * `data-price-tag` must stay on the root element: the deals page's
 * Konami-code easter egg queries it.
 */
export default function PriceTag({ price, priceUnit, perUnit, perUnitLabel, highConfidence = true }: PriceTagProps) {
  const basis =
    perUnit !== null ? `$${perUnit.toFixed(2)} per ${perUnitLabel}` : priceUnit === "each" ? "each" : null;

  return (
    <div
      data-price-tag
      title={highConfidence ? undefined : "Price may be approximate"}
      className="min-w-0 select-none"
    >
      <div
        className="font-mono text-[21px] font-bold leading-none tracking-tight tabular-nums text-accent-dark"
      >
        {!highConfidence && <span className="font-normal text-accent/60">~</span>}${price.toFixed(2)}
      </div>
      {basis !== null && (
        // Never truncated: a comparison figure cut to "$12.96 per…" is
        // worse than useless, since the unit is half of what makes it a
        // comparison. Its own line means it never has to be.
        <div className="mt-1.5 font-mono text-[11px] leading-none tabular-nums text-ink-muted">{basis}</div>
      )}
    </div>
  );
}
