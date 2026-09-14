import { notFound } from "next/navigation";
import { fetchDealHistory } from "@/lib/api";
import AddToListButton from "@/components/AddToListButton";
import BackLink from "@/components/BackLink";
import PriceChart from "@/components/PriceChart";
import PriceTag from "@/components/PriceTag";
import ImageLightbox from "@/components/ImageLightbox";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";

function formatSize(size: number | null, unit: string | null): string | null {
  if (!size || !unit) return null;
  if (size >= 1000) return `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)} ${unit === "g" ? "kg" : "L"}`;
  return `${size} ${unit}`;
}

// Date-only strings parse as UTC midnight — pin to local time or
// "Jul 2 – Jul 8" renders as "Jul 1 – Jul 7" in negative-offset zones.
function localDate(s: string): Date {
  return new Date(s.length === 10 ? `${s}T00:00:00` : s);
}

function fmtDate(s: string): string {
  return localDate(s).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

/** The card used to carry this ("Expires today", in red). The card is
 *  now image/name/price/store only, so the urgency has to live here —
 *  a sale window with no sense of how much of it is left is the one
 *  fact on this page that changes what you do next. */
function expiryInfo(validTo: string): { label: string; urgent: boolean } {
  const end = localDate(validTo);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(end) - startOfDay(new Date())) / 86_400_000);

  if (days < 0) return { label: "This deal has expired", urgent: true };
  if (days === 0) return { label: "Last day", urgent: true };
  if (days === 1) return { label: "Ends tomorrow", urgent: true };
  return { label: `${days} days left`, urgent: days <= 2 };
}

/** One line of the spec block. Sentence-case label, value on the right,
 *  mono only when the value is a number. */
function SpecRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 border-b border-line last:border-0">
      <dt className="text-[13px] text-ink-soft shrink-0">{label}</dt>
      <dd className={`text-[14px] text-ink text-right font-medium ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
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
  const validFrom = fmtDate(item.valid_from);
  const validTo = fmtDate(item.valid_to);
  const expiry = expiryInfo(item.valid_to);

  // The deal-o-meter the cards used to show rated a price against its
  // category average. That average only exists on the deals page (it's
  // computed from what's on screen), so the honest version here is the
  // item's OWN history — same question, answered with data this page
  // actually holds.
  const prices = history.map((p) => p.price);
  const low = prices.length > 0 ? Math.min(...prices) : null;
  const high = prices.length > 0 ? Math.max(...prices) : null;
  const atLow = low !== null && high !== null && high > low && item.price <= low;

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <BackLink />

      {/* Two columns at `wide:`: what the thing IS on the left, what we
          KNOW about it on the right. 1200px rather than this site's
          usual 1400 because the right column is a specs table and two
          blocks of flyer prose — past about 700px a description line
          stops being readable, and the cap is what holds it there.

          The left pane is sticky so the price and the add button stay
          put while the specs and 30 days of history scroll past them. */}
      <div className="mt-5 grid grid-cols-1 wide:grid-cols-[minmax(0,420px)_1fr] gap-8 items-start">
      {/* ── Product header ───────────────────────────────────────── */}
      <div className="wide:sticky wide:top-20">
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-5 sm:p-6`}>
        {/* sm: puts the photos beside the text; `wide:` puts them back
            above it, because the pane they are in is now narrower than
            the full-width banner this row was laid out for. */}
        <div className="flex flex-col sm:flex-row wide:flex-col gap-5 sm:gap-6">
          {(item.product_image || item.cutout_image) && (
            <div className="flex gap-2 shrink-0">
              {item.product_image && (
                <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-control border border-line bg-surface-2 overflow-hidden p-2">
                  <ImageLightbox src={item.product_image} alt={item.name} />
                </div>
              )}
              {item.cutout_image && item.cutout_image !== item.product_image && (
                <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-control border border-line bg-surface-2 overflow-hidden p-2">
                  <ImageLightbox src={item.cutout_image} alt={`${item.name} — flyer cutout`} />
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {item.brands.length > 0 && (
              <p className="text-[13px] font-semibold text-ink-soft mb-1">
                {item.brands.join(" · ")}
              </p>
            )}
            <h1 className="font-display text-2xl text-ink leading-tight">{item.name}</h1>
            <p className="text-[14px] text-ink-soft mt-1.5">at {item.merchant_name}</p>

            <div className="flex items-center gap-2 flex-wrap mt-3">
              {item.category && (
                <span className="badge-soft capitalize">{item.category}</span>
              )}
              {sizeLabel && <span className="badge-soft-quiet font-mono">{sizeLabel}</span>}
              <span className={expiry.urgent ? "badge-soft-danger" : "badge-soft-quiet"}>
                {expiry.label}
              </span>
            </div>

            {/* PriceTag is plain typography now and carries the
                price-per-unit line itself, so this doesn't restate it —
                the tint block is what gives the number the weight a
                detail page's headline price wants. */}
            <div className="flex items-center gap-4 flex-wrap mt-5">
              <div className="rounded-control bg-accent-soft px-4 py-3">
                <PriceTag
                  price={item.price}
                  priceUnit={item.price_unit}
                  perUnit={item.price_per_unit}
                  perUnitLabel={item.price_per_unit_label}
                  highConfidence={item.high_confidence}
                />
              </div>
              <p className="text-[13px] text-ink-soft leading-snug">
                On sale
                <br />
                <span className="font-mono text-ink">
                  {validFrom} – {validTo}
                </span>
              </p>
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
          </div>
        </div>
      </GlassCard>

      </div>

      {/* ── Right pane: everything we know about it ──────────────── */}
      <div className="min-w-0">
      {/* ── Specs ────────────────────────────────────────────────── */}
      <h2 className="font-display text-ink text-lg mt-8 wide:mt-0 mb-3">Details</h2>
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} px-5 py-1`}>
        <dl>
          <SpecRow
            label="Price"
            value={item.price_unit === "each" ? `$${item.price.toFixed(2)} each` : `$${item.price.toFixed(2)}`}
            mono
          />
          {item.price_per_unit !== null && (
            <SpecRow
              label="Price per unit"
              value={`$${item.price_per_unit.toFixed(2)} / ${item.price_per_unit_label}`}
              mono
            />
          )}
          {sizeLabel && (
            <SpecRow
              label="Size"
              value={
                <>
                  <span className="font-mono">{sizeLabel}</span>
                  {item.size_unit && (
                    <span className="text-ink-soft font-normal">
                      {" "}
                      ({item.size_unit === "g" ? "weight" : "volume"})
                    </span>
                  )}
                </>
              }
            />
          )}
          {item.brands.length > 0 && <SpecRow label="Brand" value={item.brands.join(" · ")} />}
          {item.category && (
            <SpecRow label="Category" value={<span className="capitalize">{item.category}</span>} />
          )}
          <SpecRow label="Store" value={item.merchant_name} />
          <SpecRow
            label="Sale window"
            value={
              <>
                <span className="font-mono">
                  {validFrom} – {validTo}
                </span>
                <span className={`ml-2 font-normal ${expiry.urgent ? "text-danger" : "text-ink-soft"}`}>
                  {expiry.label.toLowerCase()}
                </span>
              </>
            }
          />
          <SpecRow
            label="Price confidence"
            value={
              item.high_confidence ? (
                <span className="text-accent-dark">High</span>
              ) : (
                <span className="text-danger">Low — price may be approximate</span>
              )
            }
          />
        </dl>
      </GlassCard>

      {/* ── Raw flyer data ───────────────────────────────────────── */}
      {(item.original_name || item.original_description) && (
        <>
          <h2 className="font-display text-ink text-lg mt-8 mb-3">From the flyer</h2>
          <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} px-5 py-4 space-y-3`}>
            {item.original_name && item.original_name !== item.name && (
              <div>
                <p className="text-[13px] text-ink-soft mb-0.5">Original name</p>
                <p className="text-[14px] text-ink">{item.original_name}</p>
              </div>
            )}
            {item.original_description && (
              <div>
                <p className="text-[13px] text-ink-soft mb-0.5">Description</p>
                <p className="text-[14px] text-ink leading-relaxed">{item.original_description}</p>
              </div>
            )}
          </GlassCard>
        </>
      )}

      {/* ── Price history ────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap mt-8 mb-3">
        <h2 className="font-display text-ink text-lg">30-day price history</h2>
        {low !== null && high !== null && history.length >= 2 && (
          <p className="text-[13px] text-ink-soft">
            {atLow ? (
              <span className="text-accent-dark font-semibold">Lowest price we&apos;ve seen</span>
            ) : (
              <>
                Low <span className="font-mono text-ink">${low.toFixed(2)}</span> · High{" "}
                <span className="font-mono text-ink">${high.toFixed(2)}</span>
              </>
            )}
          </p>
        )}
      </div>
      <PriceChart history={history} />
      </div>
      </div>
    </main>
  );
}
