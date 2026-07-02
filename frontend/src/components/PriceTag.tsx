type PriceTagProps = {
  price: number;
  perUnit: number | null;
  perUnitLabel: "kg" | "L" | null;
};

/**
 * The signature element: a die-cut price-gun sticker. One rotated tag,
 * a punch hole, everything else on the page stays quiet around it.
 */
export default function PriceTag({ price, perUnit, perUnitLabel }: PriceTagProps) {
  return (
    <div
      className="relative -rotate-3 select-none transition-transform duration-200 ease-out group-hover:-rotate-1 group-hover:scale-[1.03]"
      style={{
        clipPath:
          "polygon(14px 0%, 100% 0%, 100% 100%, 14px 100%, 0% 50%)",
      }}
    >
      <div className="bg-tag pl-5 pr-3 py-1.5 shadow-[2px_3px_0_rgba(28,26,22,0.18)]">
        <span
          aria-hidden
          className="absolute left-[7px] top-1/2 -translate-y-1/2 w-[5px] h-[5px] rounded-full bg-paper"
        />
        <div className="font-mono font-bold text-ink text-xl leading-none tracking-tight">
          ${price.toFixed(2)}
        </div>
        {perUnit !== null && (
          <div className="font-mono text-[11px] text-ink-soft leading-none mt-0.5">
            ${perUnit.toFixed(2)}/{perUnitLabel}
          </div>
        )}
      </div>
    </div>
  );
}
