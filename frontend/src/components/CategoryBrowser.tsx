"use client";

import GlassCard from "@/components/GlassCard";
import { CategoryIcon, IconCart, categoryTint } from "@/components/icons";

/* Categories arrive from the API as lowercase slugs with spaces —
   "meat seafood", "dry goods pasta", "breakfast and cereal". The raw
   string is what every filter/facet call needs, so it stays the value
   everywhere; this is display only. Joining words stay lowercase so
   "Breakfast and Cereal" doesn't read as a shouted headline. */
const SMALL_WORDS = new Set(["and", "or", "the", "of", "a", "an", "in", "to", "with"]);

export function categoryLabel(raw: string): string {
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}


/* Shelf order for the tiles. Sorting by item count (the first version)
   put Personal Care and Household — the two biggest buckets in every
   flyer — ahead of Produce on a grocery site. Food comes first, roughly
   in the order you walk a store; non-food trails; "other" is always
   last. Anything the backend adds later that isn't listed lands between
   the two groups, ordered by count. */
export const FOOD_CATEGORIES = [
  "produce",
  "meat seafood",
  "meat",
  "seafood",
  "dairy eggs",
  "dairy",
  "bakery",
  "deli",
  "frozen",
  "pantry",
  "dry goods pasta",
  "canned goods",
  "breakfast",
  "breakfast and cereal",
  "snacks",
  "beverages",
  "international",
  "alcohol",
];
const NON_FOOD_CATEGORIES = ["babies", "pets", "personal care", "household", "other"];

/** The fresh shelves — what the home page's "This week's best" strip
 *  draws from, so it shows cabbages and chicken rather than the
 *  cheapest report cover in the flyer. */
export const FRESH_CATEGORIES = ["produce", "meat seafood", "meat", "seafood", "dairy eggs", "dairy", "bakery", "deli"];

function shelfRank(name: string): number {
  const food = FOOD_CATEGORIES.indexOf(name);
  if (food !== -1) return food;
  const nonFood = NON_FOOD_CATEGORIES.indexOf(name);
  return nonFood !== -1 ? 200 + nonFood : 100;
}

function SkeletonTile({ delay }: { delay: number }) {
  return (
    <div
      className="card-soft animate-shimmer px-4 py-5"
      style={{ animationDelay: `${delay}ms` }}
      aria-hidden
    >
      <div className="h-7 w-7 rounded-control bg-surface-3" />
      <div className="mt-3 h-4 w-3/4 rounded-control bg-surface-3" />
      <div className="mt-2 h-3 w-12 rounded-control bg-surface-2" />
    </div>
  );
}

/**
 * The first thing /deals shows: pick a shelf, not a page of 2,249
 * items. Only rendered while nothing is narrowing the grid (no search,
 * no category, no advanced filter) — the moment one of those is on, the
 * page swaps back to the normal card grid.
 *
 * Counts come from the same `fetchDealFacets` call the paginator and the
 * sidebar pills already use, so a tile's number is always the number of
 * cards the grid will show for it under the CURRENT store/region scope,
 * not a global constant.
 */
export default function CategoryBrowser({
  categories,
  counts,
  total,
  loading = false,
  onSelect,
  onSeeEverything,
}: {
  /** Every category available in the current scope (from /categories). */
  categories: string[];
  /** Item count per category for the current filters (from /deals/facets). */
  counts: Map<string, number>;
  /** Exact total for the current scope, for the "see everything" line. */
  total: number | null;
  loading?: boolean;
  onSelect: (category: string) => void;
  onSeeEverything: () => void;
}) {
  // Facets only list categories that actually matched, so once they've
  // landed they're the truth about what's worth showing a tile for.
  // Before that, fall back to the plain category list rather than
  // rendering an empty page.
  const tiles = (counts.size > 0 ? categories.filter((c) => (counts.get(c) ?? 0) > 0) : categories)
    .map((name) => ({ name, count: counts.get(name) ?? null }))
    .sort((a, b) => shelfRank(a.name) - shelfRank(b.name) || (b.count ?? 0) - (a.count ?? 0));

  return (
    // The whole section is the scroll area on sidebar layouts — there is
    // no heading to pin any more, so nothing sits above the tiles.
    //
    // The padding/negative-margin pairs on three sides are NOT spacing:
    // they're clearance for things that paint OUTSIDE a tile's box. A
    // scroll container clips at its padding box, and with no padding the
    // top row's `shadow-soft` was sliced off flat along the container's
    // edge — row one looked like it had a hard top edge while every row
    // under it had a soft shadow — and `interactive`'s 2px hover lift
    // took the top of a hovered tile with it. The negative margin gives
    // that clearance back without moving the grid, so the tiles still
    // line up with the search bar above them. `pr` is the one side that
    // was already here, for the scrollbar.
    <section
      aria-label="Browse by category"
      className="sidebar:flex-1 sidebar:min-h-0 sidebar:overflow-y-auto sidebar:pb-16 sidebar:-mt-3 sidebar:pt-3 sidebar:-ml-3 sidebar:pl-3 sidebar:-mr-3 sidebar:pr-3"
    >
      {loading && tiles.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonTile key={i} delay={i * 80} />
          ))}
        </div>
      ) : tiles.length === 0 ? (
        <p className="text-ink-soft text-sm py-10 text-center">
          No categories to browse in this scope yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
          {/* The escape hatch, as the first tile. Browsing everything is
              still one click away — the category grid is the default, not
              a gate. Accent-tinted so it doesn't read as just another shelf. */}
          <div className="animate-in">
            <GlassCard
              as="button"
              interactive
              onClick={onSeeEverything}
              surfaceClassName="relative overflow-hidden rounded-card bg-accent-soft border border-accent/30 w-full h-full px-4 py-5 text-left hover:border-accent transition-colors"
            >
              {/* Same chip as every shelf below, in the accent — now
                  that the shelves wear their own hues, a bare icon here
                  read as an unstyled tile rather than the odd one out. */}
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-control bg-accent/15 text-accent-dark"
              >
                <IconCart size={22} />
              </span>
              <span className="block mt-3 text-[15px] font-semibold text-ink">All</span>
              <span className="block mt-1 text-[13px] text-ink-muted">
                {total !== null ? (
                  <>
                    <span className="font-mono">{total.toLocaleString()}</span> deal
                    {total === 1 ? "" : "s"}
                  </>
                ) : (
                  "See everything"
                )}
              </span>
            </GlassCard>
          </div>
          {tiles.map(({ name, count }, i) => (
            <div key={name} className="animate-in" style={{ animationDelay: `${(i + 1) * 25}ms` }}>
              <GlassCard
                as="button"
                interactive
                onClick={() => onSelect(name)}
                surfaceClassName="relative overflow-hidden rounded-card bg-surface border border-line w-full h-full px-4 py-5 text-left hover:border-line-strong transition-colors"
              >
                {/* The shelf's own colour, not the accent — see
                    `categoryTint`. The chip stays a small tinted square
                    on a white card; the tile itself never takes the hue. */}
                <span
                  aria-hidden
                  className={`flex h-10 w-10 items-center justify-center rounded-control ${categoryTint(name)}`}
                >
                  <CategoryIcon name={name} size={22} />
                </span>
                <span className="block mt-3 text-[15px] font-semibold text-ink">
                  {categoryLabel(name)}
                </span>
                {/* Mono on the number only — the word beside it is body
                    type, per the type rules. */}
                <span className="block mt-1 text-[13px] text-ink-muted">
                  {count !== null ? (
                    <>
                      <span className="font-mono">{count.toLocaleString()}</span> deal
                      {count === 1 ? "" : "s"}
                    </>
                  ) : (
                    "Browse"
                  )}
                </span>
              </GlassCard>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
