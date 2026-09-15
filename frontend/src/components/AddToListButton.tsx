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
 * `compact` is now icon-only and deliberately recessed at rest (75%
 * opacity, hairline outline, no label): on a 24-card grid it was one
 * more thing competing for attention on every card, when what it
 * actually needs to be is available-when-wanted. It comes fully up on
 * card hover and fills accent on its own hover/focus. Once the item IS
 * on the list that's state worth seeing, so that one stays solid.
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
        // Hover states are split across two properties on purpose:
        // `group-hover` only ever touches opacity, `hover`/`focus` only
        // ever touch colour. Both variants have the same specificity, so
        // having them fight over the same property would leave which one
        // wins up to Tailwind's variant ordering.
        className={`inline-flex h-8 shrink-0 items-center justify-center gap-0.5 px-2.5 active:translate-y-px ${toggleChip(
          inList,
          "border-accent bg-accent text-white hover:bg-accent-dark hover:border-accent-dark",
          "border-line bg-surface text-ink-soft opacity-75 group-hover:opacity-100 focus-visible:opacity-100 hover:border-accent hover:bg-accent hover:text-white",
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
