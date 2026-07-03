type PriceTagProps = {
  price: number;
  perUnit: number | null;
  perUnitLabel: "kg" | "L" | null;
  highConfidence?: boolean;
};

/**
 * The signature element: a die-cut price-gun sticker. One rotated tag,
 * a punch hole, everything else on the page stays quiet around it.
 * A `~` prefix marks prices the parser wasn't confident about.
 */
export default function PriceTag({ price, perUnit, perUnitLabel, highConfidence = true }: PriceTagProps) {
  return (
    <div
      data-price-tag
      title={highConfidence ? undefined : "Price may be approximate"}
      className="price-tag relative -rotate-3 select-none transition-transform duration-200 ease-out group-hover:-rotate-1 group-hover:scale-[1.03]"
      style={{
        // clip-path eats real borders/shadows, so the ink outline and the
        // hard offset shadow are both faked with drop-shadows on the shape.
        filter:
          "drop-shadow(2px 0 0 var(--color-ink)) drop-shadow(-2px 0 0 var(--color-ink)) drop-shadow(0 2px 0 var(--color-ink)) drop-shadow(0 -2px 0 var(--color-ink)) drop-shadow(3px 3px 0 var(--color-ink))",
      }}
    >
      <div
        className="bg-tag pl-5 pr-3 py-1.5"
        style={{
          clipPath: "polygon(14px 0%, 100% 0%, 100% 100%, 14px 100%, 0% 50%)",
        }}
      >
        <span
          aria-hidden
          className="absolute left-[7px] top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-paper border border-ink"
        />
        <div className="font-mono font-bold text-ink text-xl leading-none tracking-tight">
          {!highConfidence && <span className="text-ink/60">~</span>}${price.toFixed(2)}
        </div>
        {perUnit !== null && (
          <div className="font-mono text-[11px] font-bold text-ink/70 leading-none mt-0.5">
            ${perUnit.toFixed(2)}/{perUnitLabel}
          </div>
        )}
        {/* Visible on touch too — the title attr alone is desktop-only */}
        {!highConfidence && (
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-ink/60 leading-none mt-0.5">
            approx.
          </div>
        )}
      </div>
    </div>
  );
}
