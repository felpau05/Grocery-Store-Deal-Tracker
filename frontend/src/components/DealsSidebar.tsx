"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";
import type {
  Account,
  DealStatus,
  Merchant,
  PriceUnit,
  SortDir,
  SortMode,
} from "@/lib/api";

const STATUSES: { id: DealStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "On now" },
  { id: "upcoming", label: "Starting soon" },
];

const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: null, label: "Any" },
  { days: 0, label: "Today" },
  { days: 2, label: "≤ 2 days" },
  { days: 7, label: "This week" },
];

/** One standalone card — Sort by, Stores, Categories, and Filters are
 * each their own separate box with a gap between them, not one shared
 * container with internal dividers.
 *
 * The same `.deal-card-glow` + `<LiquidGlow />` ring every product card
 * wears — that pink/tan tint you see on a deal card isn't a flat colour
 * at all, it's this shared shader ring bleeding through the blur — but
 * `GLASS_SURFACE_DENSE`, not GlassCard's default `GLASS_SURFACE`: this
 * panel is mostly small filter/sort labels, not a headline or a photo,
 * and `GLASS_SURFACE`'s /90 opacity still left those labels short of
 * AA contrast at the page gradient's deepest stop. `/95` clears it. */
const CARD_TITLE = "font-display text-ink text-[15px] leading-tight";

/** Eyebrow above a group inside Filters — DealCard's merchant line. */
const EYEBROW = "font-mono font-bold text-[10px] uppercase tracking-[0.14em] text-ink-soft";

function Card({
  title,
  count,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;
  return (
    // No `interactive`/hover-translate — unlike DealCard, these boxes
    // aren't a single clickable link, so there's no one gesture for a
    // hover state to respond to.
    <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-4`}>
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`w-full flex items-center justify-between gap-2 ${CARD_TITLE} hover:text-sale transition-colors`}
        >
          <span>
            {title}
            {count !== undefined && count > 0 && (
              <span className="font-mono text-[12px] text-ink-soft"> ({count})</span>
            )}
          </span>
          <span aria-hidden className="font-mono text-[14px] leading-none">{open ? "−" : "+"}</span>
        </button>
      ) : (
        <div className={`${CARD_TITLE} mb-2.5`}>
          {title}
          {count !== undefined && count > 0 && (
            <span className="font-mono text-[12px] text-ink-soft"> ({count})</span>
          )}
        </div>
      )}
      {showBody && <div className={collapsible ? "mt-3 pt-3 border-t border-ink/10" : ""}>{children}</div>}
    </GlassCard>
  );
}

/** One row within a checkbox card — Stores and Categories, both
 * genuinely multi-select: any number can be checked at once. */
function CheckboxRow({
  checked,
  onClick,
  children,
  count,
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={checked}
      className={`w-full flex items-center gap-2 text-left text-[13px] font-mono font-bold px-2 py-1.5 border-2 mb-1 last:mb-0 transition-all ${
        checked
          ? "bg-produce/90 backdrop-blur-sm text-paper border-ink/70"
          : "border-transparent text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/25"
      }`}
    >
      <span
        aria-hidden
        className={`flex-shrink-0 w-4 h-4 border-2 flex items-center justify-center text-[10px] leading-none ${
          checked ? "bg-paper border-paper text-produce" : "border-current"
        }`}
      >
        {checked && "✓"}
      </span>
      <span className="truncate flex-1">{children}</span>
      {count !== undefined && (
        <span className={checked ? "opacity-80" : "opacity-60"}>{count}</span>
      )}
    </button>
  );
}

/** The "All" row pinned to the top of Stores and Categories. Same shape
 * and counts column as CheckboxRow so it reads as part of the same list,
 * but it's a radio, not a checkbox: "all" isn't one more thing you can
 * tick alongside three stores, it's the state of having ticked nothing.
 * Hence the dot rather than a ✓, and a rule under it separating it from
 * the options it summarises. */
function AllRow({
  checked,
  onClick,
  children,
  count,
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    /* The rule lives on a wrapper, not as a border-b on the button —
       the button already sets all four borders per state, and stacking a
       `border-b-*` colour on top of that depends on which of the two
       lands later in Tailwind's output. */
    <div className="mb-2 pb-2 border-b border-ink/10">
      <button
        onClick={onClick}
        aria-pressed={checked}
        className={`w-full flex items-center gap-2 text-left text-[13px] font-mono font-bold px-2 py-1.5 border-2 transition-all ${
          checked
            ? "bg-produce/90 backdrop-blur-sm text-paper border-ink/70"
            : "border-transparent text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/25"
        }`}
      >
        <span
          aria-hidden
          className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
            checked ? "bg-paper border-paper" : "border-current"
          }`}
        >
          {checked && <span className="w-1.5 h-1.5 rounded-full bg-produce" />}
        </span>
        <span className="truncate flex-1">{children}</span>
        {count !== undefined && (
          <span className={checked ? "opacity-80" : "opacity-60"}>{count}</span>
        )}
      </button>
    </div>
  );
}

/** Single-select row — still used inside Filters (deal status, expiry:
 * exactly one applies at a time, unlike stores/categories). */
function Row({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-[13px] font-mono font-bold px-2 py-1.5 border-2 mb-1 last:mb-0 transition-all ${
        active
          ? "bg-produce/90 backdrop-blur-sm text-paper border-ink/70"
          : "border-transparent text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/25"
      }`}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function DealsSidebar({
  user,
  pillMerchants,
  selectedMerchantIds,
  setSelectedMerchantIds,
  merchantCounts,
  categories,
  selectedCategories,
  setSelectedCategories,
  categoryCounts,
  sort,
  setSort,
  sortDir,
  setSortDir,
  priceUnits,
  setPriceUnits,
  status,
  setStatus,
  expDays,
  setExpDays,
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
  advancedCount,
  onClearAdvanced,
}: {
  user: Account | null;
  pillMerchants: Merchant[];
  selectedMerchantIds: number[];
  setSelectedMerchantIds: (fn: (prev: number[]) => number[]) => void;
  merchantCounts: Map<number, number>;
  categories: string[];
  selectedCategories: string[];
  setSelectedCategories: (fn: (prev: string[]) => string[]) => void;
  categoryCounts: Map<string, number>;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  sortDir: SortDir;
  setSortDir: (fn: (d: SortDir) => SortDir) => void;
  priceUnits: PriceUnit[];
  setPriceUnits: (fn: (prev: PriceUnit[]) => PriceUnit[]) => void;
  status: DealStatus;
  setStatus: (s: DealStatus) => void;
  expDays: number | null;
  setExpDays: (d: number | null) => void;
  priceMin: string;
  setPriceMin: (v: string) => void;
  priceMax: string;
  setPriceMax: (v: string) => void;
  advancedCount: number;
  onClearAdvanced: () => void;
}) {
  // Two different totals, and they sit in two different places. The
  // number beside the CARD TITLE counts the options themselves (how many
  // stores / how many categories there are to pick from); the number on
  // the "All" row inside counts the ITEMS those options add up to, the
  // same kind of number every individual row shows.
  const storeItems = [...merchantCounts.values()].reduce((a, b) => a + b, 0);
  const catItems = [...categoryCounts.values()].reduce((a, b) => a + b, 0);
  const hasOwnStores = !!user && user.merchants.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Filters — everything secondary/advanced (deal status, expiry,
          price range, priced-by) bundled into one expandable card, kept
          separate from Sort/Stores/Categories below. Collapsed by
          default so the sidebar isn't a wall of options up front. */}
      <Card title="Filters" count={advancedCount} collapsible defaultOpen={false}>
        <div className="mb-4 last:mb-0">
          <div className={`${EYEBROW} mb-1.5`}>
            Deal status
          </div>
          {STATUSES.map((s) => (
            <Row key={s.id} active={status === s.id} onClick={() => setStatus(s.id)}>
              {s.label}
            </Row>
          ))}
        </div>

        <div className="mb-4 last:mb-0">
          <div className={`${EYEBROW} mb-1.5`}>
            Expires
          </div>
          {EXPIRY_OPTIONS.map((o) => (
            <Row key={String(o.days)} active={expDays === o.days} onClick={() => setExpDays(o.days)}>
              {o.label}
            </Row>
          ))}
        </div>

        <div className="mb-4 last:mb-0">
          <div className={`${EYEBROW} mb-1.5`}>
            Price range
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.5"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="min $"
              className="w-full min-w-0 bg-paper border-2 border-ink px-2 py-1 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
            />
            <span className="font-mono font-bold text-ink-soft">–</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="max $"
              className="w-full min-w-0 bg-paper border-2 border-ink px-2 py-1 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <div className={`${EYEBROW} mb-1.5`}>
            Priced by
          </div>
          <div className="flex gap-1">
            {(["g", "ml", "each"] as PriceUnit[]).map((u) => {
              const on = priceUnits.includes(u);
              const label = u === "g" ? "Weight" : u === "ml" ? "Volume" : "Each";
              return (
                <button
                  key={u}
                  onClick={() => setPriceUnits((prev) => toggle(prev, u))}
                  className={`flex-1 text-[12px] font-mono font-bold px-1.5 py-1 border-2 transition-all ${
                    on
                      ? "bg-produce/90 backdrop-blur-sm text-paper border-ink/70"
                      : "border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {advancedCount > 0 && (
          <button
            onClick={onClearAdvanced}
            className="w-full mt-4 text-[12px] font-mono font-bold uppercase tracking-[0.1em] px-2 py-1.5 border-2 border-ink bg-tag/85 backdrop-blur-sm text-ink hover:bg-tag/60 transition-colors"
          >
            Clear filters ({advancedCount})
          </button>
        )}
      </Card>

      <Card title="Sort by" collapsible>
        <div className="flex items-center border-2 border-ink bg-paper/85 backdrop-blur-sm p-0.5 mb-2">
          {(["price", "price_per_unit"] as SortMode[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`flex-1 text-[12px] font-mono font-bold px-2 py-1 transition-colors ${
                sort === s ? "bg-produce/90 backdrop-blur-sm text-paper" : "text-ink-soft hover:text-ink"
              }`}
            >
              {s === "price" ? "$ total" : "$/unit"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="w-full text-[12px] font-mono font-bold px-2 py-1 border-2 border-ink bg-paper/85 backdrop-blur-sm text-ink hover:bg-tag/30 transition-colors"
        >
          {sortDir === "asc" ? "↑ Cheapest first" : "↓ Priciest first"}
        </button>
      </Card>

      {pillMerchants.length > 0 && (
        /* "Your stores" whichever account it is — the heading is read by
           the person who owns them, so their own name adds nothing. */
        <Card title={hasOwnStores ? "Your stores" : "Stores"} count={pillMerchants.length} collapsible>
          {/* "All" is a real row, checked exactly when nothing else is —
              which is already what an empty selection MEANS to the deals
              query. Picking it clears back to that, so it doubles as the
              clear button the footer used to carry. */}
          <AllRow
            checked={selectedMerchantIds.length === 0}
            onClick={() => setSelectedMerchantIds(() => [])}
            count={storeItems || undefined}
          >
            All stores
          </AllRow>
          {pillMerchants.map((m) => (
            <CheckboxRow
              key={m.id}
              checked={selectedMerchantIds.includes(m.id)}
              onClick={() => setSelectedMerchantIds((prev) => toggle(prev, m.id))}
              count={merchantCounts.get(m.id)}
            >
              {m.name}
            </CheckboxRow>
          ))}
          {user && (
            <div className="flex justify-end mt-1">
              <Link
                href="/settings"
                className="text-[12px] font-mono font-bold text-ink-soft hover:text-sale transition-colors"
              >
                ✎ edit stores
              </Link>
            </div>
          )}
        </Card>
      )}

      {categories.length > 0 && (
        <Card title="Categories" count={categories.length} collapsible>
          <AllRow
            checked={selectedCategories.length === 0}
            onClick={() => setSelectedCategories(() => [])}
            count={catItems || undefined}
          >
            All categories
          </AllRow>
          {categories.map((c) => (
            <CheckboxRow
              key={c}
              checked={selectedCategories.includes(c)}
              onClick={() => setSelectedCategories((prev) => toggle(prev, c))}
              count={categoryCounts.get(c)}
            >
              {c}
            </CheckboxRow>
          ))}
        </Card>
      )}
    </div>
  );
}
