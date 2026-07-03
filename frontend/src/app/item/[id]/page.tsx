import { notFound } from "next/navigation";
import { fetchDealHistory } from "@/lib/api";
import AddToListButton from "@/components/AddToListButton";
import BackLink from "@/components/BackLink";
import PriceChart from "@/components/PriceChart";
import PriceTag from "@/components/PriceTag";
import ImageLightbox from "@/components/ImageLightbox";

function formatSize(size: number | null, unit: string | null): string | null {
  if (!size || !unit) return null;
  if (size >= 1000) return `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)} ${unit === "g" ? "kg" : "L"}`;
  return `${size} ${unit}`;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border-tan/60 last:border-0">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft/70 shrink-0">
        {label}
      </span>
      <span className="font-mono text-sm text-ink text-right">{value}</span>
    </div>
  );
}

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await fetchDealHistory(Number(id));
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") notFound();
    throw err;
  }

  const { item, history } = data;
  const sizeLabel = formatSize(item.size, item.size_unit);
  // Date-only strings parse as UTC midnight — pin to local time or
  // "Jul 2 – Jul 8" renders as "Jul 1 – Jul 7" in negative-offset zones.
  const fmtDate = (s: string) =>
    new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    });
  const validFrom = fmtDate(item.valid_from);
  const validTo = fmtDate(item.valid_to);

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <BackLink />

      {/* Hero */}
      <div className="flex items-start gap-5 mt-6">
        {(item.product_image || item.cutout_image) && (
          <div className="flex gap-2 flex-shrink-0">
            {item.product_image && (
              <div className="w-28 h-28 bg-card border-2 border-ink shadow-[3px_3px_0_var(--color-ink)] overflow-hidden">
                <ImageLightbox src={item.product_image} alt={item.name} />
              </div>
            )}
            {item.cutout_image && item.cutout_image !== item.product_image && (
              <div className="w-28 h-28 bg-card border-2 border-ink shadow-[3px_3px_0_var(--color-ink)] overflow-hidden">
                <ImageLightbox src={item.cutout_image} alt={`${item.name} — flyer cutout`} />
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {item.brands.length > 0 && (
            <p className="font-mono font-bold text-[11px] uppercase tracking-[0.15em] text-ink-soft mb-1">
              {item.brands.join(" · ")}
            </p>
          )}
          <h1 className="font-display text-2xl text-ink leading-[1.05]">
            {item.name}
          </h1>
          <p className="font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink-soft mt-1.5">
            @ {item.merchant_name}
          </p>
        </div>
        <div className="shrink-0 mt-1">
          <PriceTag
            price={item.price}
            perUnit={item.price_per_unit}
            perUnitLabel={item.price_per_unit_label}
            highConfidence={item.high_confidence}
          />
        </div>
      </div>

      <div className="mt-5">
        <AddToListButton
          name={item.name}
          source={{
            itemId: item.id,
            merchantId: item.merchant_id,
            merchantName: item.merchant_name,
            price: item.price,
            image: item.product_image,
          }}
        />
      </div>

      <div className="tear-line my-6" />

      {/* Detail table */}
      <section className="brut px-4 py-1 mb-6">
        <DetailRow
          label="Price"
          value={
            item.price_unit === "each"
              ? `$${item.price.toFixed(2)} / each`
              : `$${item.price.toFixed(2)}`
          }
        />
        {item.price_per_unit !== null && (
          <DetailRow
            label="Price / unit"
            value={`$${item.price_per_unit.toFixed(2)} / ${item.price_per_unit_label}`}
          />
        )}
        {sizeLabel && (
          <DetailRow
            label="Size"
            value={`${sizeLabel}${item.size_unit ? ` (${item.size_unit === "g" ? "weight" : "volume"})` : ""}`}
          />
        )}
        {item.category && (
          <DetailRow label="Category" value={<span className="capitalize">{item.category}</span>} />
        )}
        <DetailRow label="Store" value={item.merchant_name} />
        <DetailRow label="On sale" value={`${validFrom} – ${validTo}`} />
        <DetailRow
          label="Confidence"
          value={
            item.high_confidence ? (
              <span className="text-produce">✓ High</span>
            ) : (
              <span className="text-sale">⚠ Low — price may be approximate</span>
            )
          }
        />
      </section>

      {/* Raw flyer data */}
      {(item.original_name || item.original_description) && (
        <section className="mb-6">
          <h2 className="font-display text-ink text-lg mb-3">From the flyer</h2>
          <div className="bg-card border-2 border-ink/25 px-4 py-3 space-y-2">
            {item.original_name && item.original_name !== item.name && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-soft/70 mb-0.5">Original name</p>
                <p className="text-sm text-ink">{item.original_name}</p>
              </div>
            )}
            {item.original_description && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-soft/70 mb-0.5">Description</p>
                <p className="text-sm text-ink leading-relaxed">{item.original_description}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Price history */}
      <h2 className="font-display text-ink text-lg mb-3">30-day price history</h2>
      <PriceChart history={history} />
    </main>
  );
}
