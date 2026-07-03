"use client";

import { useCart, type CartSource } from "@/lib/cart";
import { useToast } from "@/lib/toast";
import CartGlyph from "./CartGlyph";

/**
 * Toggles an item on the grocery list. `source` records which deal it
 * came from (store, price at add time, image) so the cart drawer can
 * show it. `compact` is the small pill inside DealCards; the default is
 * the full-size button on the item page. Adding never opens the drawer —
 * the toast offers "View list" instead, so rapid adds stay rapid.
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
  const { has, add, remove, restore, openDrawer } = useCart();
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
      const added = add(name, source);
      if (added) {
        toast(`Added "${added.label}"`, {
          action: { label: "View list", onClick: openDrawer },
          duration: 3000,
        });
      }
    }
  };

  if (compact) {
    return (
      <button
        onClick={(e) => {
          // Cards are links — don't navigate when adding to the list.
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        aria-label={inList ? `Remove ${name} from grocery list` : `Add ${name} to grocery list`}
        title={inList ? "Remove from grocery list" : "Add to grocery list"}
        className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 border-2 transition-all ${
          inList
            ? "bg-produce text-paper border-ink shadow-[2px_2px_0_var(--color-ink)]"
            : "border-ink/30 text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/40"
        }`}
      >
        <CartGlyph className="w-3.5 h-3.5" />
        {inList ? "✓" : "+"}
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      className={`btn-brut inline-flex items-center gap-2 font-display text-sm px-4 py-2.5 transition-colors ${
        inList
          ? "bg-produce text-paper"
          : "bg-tag text-ink hover:bg-tag/80"
      }`}
    >
      <CartGlyph className="w-4 h-4" />
      {inList ? "✓ On your list" : "Add to grocery list"}
    </button>
  );
}
