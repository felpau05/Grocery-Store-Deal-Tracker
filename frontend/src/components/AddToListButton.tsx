"use client";

import { useCart, useTrips, type CartSource } from "@/lib/trips";
import { useToast } from "@/lib/toast";
import { toggleChip } from "@/lib/toggleChip";
import CartGlyph from "./CartGlyph";

/** The in-list tick. Icon-only buttons can't lean on a "✓" character
 *  for their state, so the compact variant swaps the glyph entirely. */
function CheckGlyph({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

function PlusGlyph({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * Toggles an item on the active trip's grocery list. `source` records
 * which deal it came from (store, price at add time, image) so the cart
 * drawer can show it. `compact` is the small button inside DealCards;
 * the default is the full-size button on the item page. Adding goes
 * through `requestAdd`, which asks which trip only the first time (see
 * lib/trips.tsx) and otherwise never opens anything — the toast offers
 * "Change" and "View list" instead, so rapid adds stay rapid.
 *
 * `compact` is icon-only and wears the accent at rest — a pale green
 * fill with a green rule and glyph, going solid green on its own hover
 * or focus, and solid green with a tick once the item is on the list.
 * It spent a while recessed instead (75% opacity, grey hairline, only
 * coming up on card hover), on the theory that 24 of them shouldn't
 * compete for attention. What that actually produced was a grey ghost
 * that didn't read as a control at all until you were already on top of
 * it, on a card whose only other colour was the product photo. Being
 * the one accent-coloured thing on the card is what makes it legible as
 * the card's one button.
 *
 * It still goes through `toggleChip()` — the helper's base is a
 * hairline + `rounded-pill` + a transition now, which at 32px tall is
 * exactly the "+ cart" pill this wants, so there's nothing
 * to fight and no reason to hand-roll a fifth copy of the shape.
 */
export default function AddToListButton({
  name,
  source,
  compact = false,
}: {
  name: string;
  source?: CartSource;
  compact?: boolean;
}) {
  const { has, remove, restore } = useCart();
  const { requestAdd } = useTrips();
  const { toast } = useToast();
  const inList = has(name);

  const onToggle = () => {
    if (inList) {
      const removed = remove(name);
      if (removed) {
        toast(`Removed "${removed.label}"`, {
          action: { label: "Undo", onClick: () => restore(removed) },
        });
      }
    } else {
      requestAdd(name, source);
    }
  };

  const label = inList ? `Remove ${name} from grocery list` : `Add ${name} to grocery list`;
  const hint = inList ? "Remove from grocery list" : "Add to grocery list";

  if (compact) {
    return (
      <button
        onClick={(e) => {
          // Cards are links — don't navigate when adding to the list.
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        aria-label={label}
        aria-pressed={inList}
        title={hint}
        className={`inline-flex h-8 shrink-0 items-center justify-center gap-0.5 px-2.5 active:translate-y-px ${toggleChip(
          inList,
          "border-accent bg-accent text-white hover:bg-accent-dark hover:border-accent-dark",
          "border-accent/35 bg-accent-soft text-accent-dark hover:border-accent hover:bg-accent hover:text-white",
        )}`}
      >
        {/* "+ cart" to add, "✓ cart" once added — the same width either
            way, so toggling never shifts the card's price row. */}
        {inList ? <CheckGlyph className="h-3.5 w-3.5" /> : <PlusGlyph className="h-3.5 w-3.5" />}
        <CartGlyph className="h-4 w-4" />
      </button>
    );
  }

  return (
    // Plain button, not a GlassCard-wrapped `.glow-btn`: that pairing
    // exists for a page's single standalone CTA, where the WRAPPER
    // carries the depth. `.btn-soft` already brings the radius, the
    // hairline and the 1px press, and it brings its own shadow, which is
    // the right weight for an action nested inside the item page's
    // content column.
    <button
      onClick={onToggle}
      aria-label={label}
      aria-pressed={inList}
      className={`btn-soft inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${
        inList
          ? "bg-accent-soft text-accent-dark hover:bg-surface-3"
          : "bg-accent text-white hover:bg-accent-dark"
      }`}
    >
      {inList ? "On your list" : "Add to grocery list"}
      {/* The same "+ cart" / "✓ cart" mark as the deal cards' button. */}
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {inList ? <CheckGlyph className="h-3.5 w-3.5" /> : <PlusGlyph className="h-3.5 w-3.5" />}
        <CartGlyph className="h-4 w-4" />
      </span>
    </button>
  );
}
