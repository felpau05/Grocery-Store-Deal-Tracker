"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";
import { BTN_SECONDARY } from "@/lib/button";
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

/** Separate cards, stacked with a gap.
 *
 * These were one card with hairline-separated bands for a while, on the
 * argument that the rail is really a single control panel and four
 * elevations for it made the page noisy. In practice the bands read as
 * stuck together: a collapsed section and an open one are the same slab
 * of white, so the only thing saying where "Sort by" ends and "Your
 * stores" begins is a 1px rule doing the work of a boundary between two
 * independent controls.
 *
 * They're separate cards again. Each section owns its own surface, and
 * the gap between them — not a hairline — is what separates them. No
 * control was added or removed in either direction; this is purely how
 * the same set of controls is grouped. */

/** Section heading. Sentence case, not the old uppercase letterspaced
 *  mono — the count beside it stays mono because it's a number. */
const SECTION_TITLE = "text-[13px] font-semibold text-ink";

/** A sub-label inside Filters ("Deal status", "Expires", …). One tier
 *  quieter than a section heading, still sentence case. */
const GROUP_LABEL = "text-[12px] font-semibold text-ink-soft";

/** Per-row item counts, and only those. Mono + tabular so a column of
 *  them lines up; `ink-muted` because they're skim-past metadata. */
const ROW_COUNT = "font-mono tabular-nums text-[12px] text-ink-muted shrink-0";

/** Disclosure affordance. Two explicit paths rather than a rotated one
 *  — `rotate-*` is off the table in this redesign. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-ink-muted shrink-0"
    >
      <path d={open ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} />
    </svg>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  );
}

/** One card in the rail. It brings its own padding, so it composes
 *  GLASS_SURFACE_DENSE rather than GLASS_SURFACE. */
function Section({
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
  const heading = (
    <span className={SECTION_TITLE}>
      {title}
      {count !== undefined && count > 0 && (
        <span className="font-mono tabular-nums text-[12px] font-normal text-ink-muted"> {count}</span>
      )}
    </span>
  );
  return (
    <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} px-4 py-3.5`}>
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-2 text-left group"
        >
          {heading}
          <Chevron open={open} />
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2">{heading}</div>
      )}
      {showBody && <div className="mt-3">{children}</div>}
    </GlassCard>
  );
}

/** The shared geometry of a selectable list row. The full-bleed is on
 *  the LIST wrapper (`-mx-4`, cancelling Section's px-4), not on each
 *  row: a row that pulls itself wider than its own parent overflows any
 *  scroll container it's later put inside, and `overflow-y: auto` drags
 *  overflow-x to auto with it. Rows just fill the wrapper instead.
 *  Selected rows therefore still read as a band across the whole rail. */
const LIST_ROW =
  "w-full flex items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors";

/** Cancels Section's px-4 so the rows inside run edge to edge. */
const LIST_BLEED = "-mx-4";

/** One row within a multi-select list — Stores, genuinely multi-select:
 * any number can be checked at once. Selected is an accent tint plus a
 * filled accent check; unselected is transparent, and the hairline
 * above it is the only line it owns. */
function CheckboxRow({
  checked,
  onClick,
  children,
  count,
  first = false,
}: {
  checked: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  first?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={checked}
      className={`${LIST_ROW} ${first ? "" : "border-t border-line"} ${
        checked ? "bg-accent-soft text-ink font-medium" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <span
        aria-hidden
        className={`shrink-0 w-4 h-4 rounded-[5px] border flex items-center justify-center ${
          checked ? "bg-accent border-accent text-white" : "border-line-strong"
        }`}
      >
        {checked && <Check />}
      </span>
      <span className="truncate flex-1">{children}</span>
      {count !== undefined && <span className={ROW_COUNT}>{count}</span>}
    </button>
  );
}

/** The "All" row pinned to the top of Stores. Same shape and counts
 * column as CheckboxRow so it reads as part of the same list, but it's
 * a radio, not a checkbox: "all" isn't one more thing you can tick
 * alongside three stores, it's the state of having ticked nothing.
 * Hence the dot rather than a ✓, and a stronger rule under it
 * separating it from the options it summarises. */
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
       the button's own background (bg-accent-soft when selected) would
       otherwise paint right up to a border whose colour has to read
       against the NEXT row, not this one. */
    <div className="border-b border-line-strong">
      <button
        onClick={onClick}
        aria-pressed={checked}
        className={`${LIST_ROW} ${
          checked ? "bg-accent-soft text-ink font-medium" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
        }`}
      >
        <span
          aria-hidden
          className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${
            checked ? "bg-accent border-accent" : "border-line-strong"
          }`}
        >
          {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
        </span>
        <span className="truncate flex-1">{children}</span>
        {count !== undefined && <span className={ROW_COUNT}>{count}</span>}
      </button>
    </div>
  );
}

/** A quiet option pill — deal status, expiry, priced-by. Single- and
 *  multi-select both land here; the difference is what the caller does
 *  on click, not how the chosen option looks. Deliberately NOT
 *  lib/chip.ts's CHIP_*: those are the header's dark-ink glass. */
function OptionPill({
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
      aria-pressed={active}
      className={`rounded-pill px-2.5 py-1 text-[12px] font-medium border transition-colors ${
        active
          ? "bg-accent border-accent text-white"
          : "bg-surface border-line text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Segmented control: one track, N segments, exactly one lit. Used for
 *  the two sort axes (what to sort by, which direction) and for
 *  /settings' All stores / Grocery stores switch — all either/or
 *  choices, which a segmented track says better than two loose buttons
 *  do. Exported so settings wears the same control rather than a
 *  lookalike; see "check before hand-rolling" in CLAUDE.md. */
export function Segmented<T extends string>({
  value,
  options,
  onSelect,
  label,
  className = "",
}: {
  value: T;
  options: { id: T; label: string }[];
  onSelect: (id: T) => void;
  label: string;
  /** Extra classes for the track — e.g. `shrink-0` where it shares a
   *  flex row with something that would otherwise squeeze it. */
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-1 rounded-control border border-line bg-surface-2 p-1 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          aria-pressed={value === o.id}
          /* whitespace-nowrap: a segment label is a name, not copy, and
             breaking one across two lines makes the track grow a row and
             read as two stacked controls rather than one. Two-word
             labels like "Grocery stores" wrapped without it. The parent
             row wraps instead when there genuinely isn't space. */
          className={`flex-1 whitespace-nowrap rounded-[7px] px-2 py-1.5 text-[12px] font-semibold transition-colors ${
            value === o.id ? "bg-accent text-white shadow-soft" : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PRICE_INPUT =
  "w-full min-w-0 rounded-control bg-surface border border-line px-2.5 py-1.5 font-mono tabular-nums text-[13px] text-ink placeholder:text-ink-muted focus:border-line-strong transition-colors";

const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "price_per_unit", label: "Unit Price" },
];

const SORT_DIRS: { id: SortDir; label: string }[] = [
  { id: "asc", label: "Cheapest first" },
  { id: "desc", label: "Priciest first" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function DealsSidebar({
  user,
  pillMerchants,
  selectedMerchantIds,
  setSelectedMerchantIds,
  merchantCounts,
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
  // The number beside the SECTION TITLE counts the options themselves
  // (how many stores there are to pick from); the number on the "All"
  // row inside counts the ITEMS those options add up to, the same kind
  // of number every individual row shows.
  const storeItems = [...merchantCounts.values()].reduce((a, b) => a + b, 0);
  const hasOwnStores = !!user && user.merchants.length > 0;

  return (
    <div className="space-y-3">
      {/* Filters — everything secondary/advanced (deal status, expiry,
          price range, priced-by) bundled into one expandable section,
          kept separate from Sort/Stores/Categories below. Collapsed by
          default so the rail isn't a wall of options up front. */}
      <Section title="Filters" count={advancedCount} collapsible defaultOpen={false}>
        <div className="mb-4 last:mb-0">
          <div className={`${GROUP_LABEL} mb-2`}>Deal status</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <OptionPill key={s.id} active={status === s.id} onClick={() => setStatus(s.id)}>
                {s.label}
              </OptionPill>
            ))}
          </div>
        </div>

        <div className="mb-4 last:mb-0">
          <div className={`${GROUP_LABEL} mb-2`}>Expires</div>
          <div className="flex flex-wrap gap-1.5">
            {EXPIRY_OPTIONS.map((o) => (
              <OptionPill
                key={String(o.days)}
                active={expDays === o.days}
                onClick={() => setExpDays(o.days)}
              >
                {o.label}
              </OptionPill>
            ))}
          </div>
        </div>

        <div className="mb-4 last:mb-0">
          <div className={`${GROUP_LABEL} mb-2`}>Price range</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.5"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="Min $"
              aria-label="Minimum price"
              className={PRICE_INPUT}
            />
            <span aria-hidden className="text-ink-muted">
              –
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="Max $"
              aria-label="Maximum price"
              className={PRICE_INPUT}
            />
          </div>
        </div>

        <div>
          <div className={`${GROUP_LABEL} mb-2`}>Priced by</div>
          <div className="flex flex-wrap gap-1.5">
            {(["g", "ml", "each"] as PriceUnit[]).map((u) => (
              <OptionPill
                key={u}
                active={priceUnits.includes(u)}
                onClick={() => setPriceUnits((prev) => toggle(prev, u))}
              >
                {u === "g" ? "Weight" : u === "ml" ? "Volume" : "Each"}
              </OptionPill>
            ))}
          </div>
        </div>

        {advancedCount > 0 && (
          <button onClick={onClearAdvanced} className={`${BTN_SECONDARY} w-full mt-4`}>
            Clear filters ({advancedCount})
          </button>
        )}
      </Section>

      <Section title="Sort by" collapsible>
        <div className="flex flex-col gap-2">
          <Segmented value={sort} options={SORT_MODES} onSelect={setSort} label="Sort by" />
          <Segmented
            value={sortDir}
            options={SORT_DIRS}
            /* The prop is an updater, not a plain setter — hand it a
               function that ignores the previous direction rather than
               changing the page's interface for this. */
            onSelect={(d) => setSortDir(() => d)}
            label="Sort direction"
          />
        </div>
      </Section>

      {pillMerchants.length > 0 && (
        /* "Your stores" whichever account it is — the heading is read by
           the person who owns them, so their own name adds nothing. */
        <Section
          title={hasOwnStores ? "Your stores" : "Stores"}
          count={pillMerchants.length}
          collapsible
        >
          {/* "All" is a real row, checked exactly when nothing else is —
              which is already what an empty selection MEANS to the deals
              query. Picking it clears back to that, so it doubles as the
              clear button the footer used to carry. */}
          <div className={LIST_BLEED}>
            <AllRow
              checked={selectedMerchantIds.length === 0}
              onClick={() => setSelectedMerchantIds(() => [])}
              count={storeItems || undefined}
            >
              All stores
            </AllRow>
            {pillMerchants.map((m, i) => (
              <CheckboxRow
                key={m.id}
                first={i === 0}
                checked={selectedMerchantIds.includes(m.id)}
                onClick={() => setSelectedMerchantIds((prev) => toggle(prev, m.id))}
                count={merchantCounts.get(m.id)}
              >
                {m.name}
              </CheckboxRow>
            ))}
          </div>
          {user && (
            <div className="flex justify-end mt-2">
              <Link
                href="/settings"
                className="text-[12px] font-medium text-ink-muted hover:text-accent transition-colors"
              >
                Edit stores
              </Link>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
