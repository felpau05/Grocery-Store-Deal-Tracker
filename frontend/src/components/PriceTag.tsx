type PriceTagProps = {
  price: number;
  priceUnit: "g" | "ml" | "each";
  perUnit: number | null;
  perUnitLabel: "kg" | "L" | null;
  highConfidence?: boolean;
};

/**
 * The signature element: a die-cut price-gun sticker. One rotated tag,
 * a punch hole, everything else on the page stays quiet around it.
 * A `~` prefix marks prices the parser wasn't confident about.
 */
export default function PriceTag({ price, priceUnit, perUnit, perUnitLabel, highConfidence = true }: PriceTagProps) {
  return (
    <div
      data-price-tag
      title={highConfidence ? undefined : "Price may be approximate"}
      className="price-tag relative -rotate-3 select-none transition-transform duration-200 ease-out group-hover:-rotate-1 group-hover:scale-[1.03]"
      style={{
        // clip-path eats real borders/shadows, so the outline and the
        // hard offset shadow are both faked with drop-shadows on the shape.
        //
        // The offset shadow (last term) was 3px/3px — reduced to 2px/2px
        // as a light touch, not a redesign: this is the one hard-pop
        // shadow-for-depth idiom left in the app now that cards get
        // their depth from the LiquidGlow ring instead. The outline
        // itself (the other four terms) is untouched — that's what
        // makes the die-cut sticker actually read as die-cut, and it's
        // the part of this "signature element" not up for reinterpreting.
        filter:
          "drop-shadow(2px 0 0 var(--color-price-tag-outline)) drop-shadow(-2px 0 0 var(--color-price-tag-outline)) drop-shadow(0 2px 0 var(--color-price-tag-outline)) drop-shadow(0 -2px 0 var(--color-price-tag-outline)) drop-shadow(2px 2px 0 var(--color-price-tag-outline))",
      }}
    >
      <div
        className="bg-price-tag-bg pl-5 pr-3 py-1.5"
        style={{
          clipPath: "polygon(14px 0%, 100% 0%, 100% 100%, 14px 100%, 0% 50%)",
        }}
      >
        <span
          aria-hidden
          className="absolute left-[7px] top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-price-tag-hole border border-price-tag-outline"
        />
        <div className="font-mono font-bold text-price-tag-price text-xl leading-none tracking-tight">
          {!highConfidence && <span className="text-price-tag-approx/60">~</span>}${price.toFixed(2)}
        </div>
        {perUnit !== null ? (
          <div className="font-mono text-[11px] font-bold text-price-tag-unit/70 leading-none mt-0.5">
            ${perUnit.toFixed(2)}/{perUnitLabel}
          </div>
        ) : priceUnit === "each" ? (
          <div className="font-mono text-[11px] font-bold text-price-tag-unit/70 leading-none mt-0.5">
            /each
          </div>
        ) : null}
      </div>
    </div>
  );
}
