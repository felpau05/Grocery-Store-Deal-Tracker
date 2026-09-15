import { notFound } from "next/navigation";
import { fetchDealHistory } from "@/lib/api";
import AddToListButton from "@/components/AddToListButton";
import BackLink from "@/components/BackLink";
import PriceChart from "@/components/PriceChart";
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
  stacked = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  /** Label above a full-width value — for prose (the flyer's own text)
   *  that reads wrong squeezed right-aligned beside its label. */
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="py-2.5 border-b border-line last:border-0">
        <dt className="text-[13px] text-ink-soft">{label}</dt>
        <dd className="text-[14px] text-ink mt-1 leading-relaxed whitespace-pre-line">{value}</dd>
      </div>
    );
  }
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
    // At `wide:` one fixed screen under the header, like the trip pages
    // and settings — the page itself never scrolls. The left card is just
    // the product (photos, name, add); everything we know about it lives
    // in the right pane, which is the one region that scrolls. Below
    // `wide:` it's one ordinary scrolling column.
    <main className="max-w-[1200px] mx-auto px-6 pt-6 pb-10 wide:pb-6 wide:h-[calc(100svh-var(--header-h))] wide:flex wide:flex-col wide:overflow-hidden">
      <div className="shrink-0">
        <BackLink />
      </div>

      <div className="mt-4 grid grid-cols-1 wide:grid-cols-[minmax(0,400px)_1fr] wide:grid-rows-[minmax(0,1fr)] gap-6 wide:gap-8 wide:flex-1 wide:min-h-0">
      {/* ── Left: the product — photos, name, and what you can do ── */}
      <GlassCard
        wrapperClassName="wide:min-h-0 wide:h-full"
        surfaceClassName={`${GLASS_SURFACE_DENSE} p-5 sm:p-6 flex flex-col gap-5 wide:h-full`}
      >
        {(item.product_image || item.cutout_image) && (
          // The photo takes whatever height the card has left over, so a
          // tall screen gets a big picture instead of empty card.
          <div className="flex gap-3 h-64 wide:h-auto wide:flex-1 wide:min-h-0">
            {item.product_image && (
              <div className="flex-1 min-w-0 rounded-control border border-line bg-surface-2 overflow-hidden p-3">
                <ImageLightbox src={item.product_image} alt={item.name} />
              </div>
            )}
            {item.cutout_image && item.cutout_image !== item.product_image && (
              <div className="w-24 sm:w-28 shrink-0 self-start aspect-square rounded-control border border-line bg-surface-2 overflow-hidden p-2">
                <ImageLightbox src={item.cutout_image} alt={`${item.name} — flyer cutout`} />
              </div>
            )}
          </div>
        )}

        <div className="shrink-0">
          <h1 className="font-display text-2xl text-ink leading-tight">{item.name}</h1>
          <div className="mt-4">
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
      </GlassCard>

      {/* ── Right pane: everything we know about it ────────────────
          The one scrolling region at `wide:`; the padding pair keeps the
          cards' soft shadows inside the clip. */}
      <div className="min-w-0 wide:min-h-0 wide:overflow-y-auto wide:-mx-2 wide:px-2 wide:pb-2">
      {/* ── Specs ────────────────────────────────────────────────── */}
      <h2 className="font-display text-ink text-lg mb-3">Details</h2>
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} px-5 py-1`}>
        <dl>
          <SpecRow
            label="Price"
            value={
              <span className="text-accent text-[18px] font-semibold">
                {item.price_unit === "each" ? `$${item.price.toFixed(2)} each` : `$${item.price.toFixed(2)}`}
              </span>
            }
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
          {/* The raw text as the store printed it, before our cleanup —
              where variants, per-kg prices and fine print show up. */}
          {item.original_name && item.original_name !== item.name && (
            <SpecRow label="Name in the flyer" value={item.original_name} stacked />
          )}
          {item.original_description && (
            <SpecRow label="Flyer description" value={item.original_description} stacked />
          )}
        </dl>
      </GlassCard>

      {/* ── Price history ────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap mt-8 mb-3">
        <h2 className="font-display text-ink text-lg">Past deals at {item.merchant_name}</h2>
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
      <PriceChart history={history} store={item.merchant_name} />
      {/* The same points as the chart, as dates you can read — a flyer
          history is a handful of sale windows, not a continuous line. */}
      {history.length >= 2 && (
        <ul className="mt-3 card-soft divide-y divide-line">
          {[...history].reverse().map((p) => {
            const current = p.valid_from === item.valid_from && p.valid_to === item.valid_to;
            return (
              <li key={`${p.valid_from}-${p.valid_to}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                <span className="text-ink-soft">
                  {fmtDate(p.valid_from)} – {fmtDate(p.valid_to)}
                  {current && (
                    <span className="ml-2 rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-dark">now</span>
                  )}
                </span>
                <span className={`font-mono tabular-nums font-semibold ${current ? "text-accent" : "text-ink"}`}>
                  ${p.price.toFixed(2)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      </div>
      </div>
    </main>
  );
}
