/* The selected/unselected toggle chip: AddToListButton's in-list badge,
   settings' "groceries only" filter and store checkboxes, and list/page's
   item-pick buttons all hand-write a `selected ? A : B` ternary over a
   shared hairline/transition base — but unlike lib/button.ts's confirmed
   verbatim duplicates, none of these four are actually the same string.
   Padding and the selected-state background differ site to site, and
   read as deliberate per-context choices rather than copy-paste drift —
   so this doesn't collapse them to one default the way BTN_CART_ADD etc.
   do. What's actually shared is the SHAPE (a 1px border, a pill radius,
   a transition) and the TERNARY PATTERN itself; both are named here so
   there's one obvious place to reach for "how does a toggle chip work"
   without either guessing at a shared colour that was never really
   shared, or leaving the base duplicated a 5th time the next time this
   pattern is needed.

   Soft-modern now: `border` not `border-2`, plus `rounded-pill`. The
   per-call-site COLOURS are still the call site's own business and are
   still mid-migration — several of them name the old brutalist tokens
   (border-ink, hard offset shadows) and belong to whoever owns that
   file. Anything a call site passes here that carries its own radius
   will fight `rounded-pill`; override it there, not in this base. */

export const TOGGLE_CHIP_BASE = "border rounded-pill transition-all";

/** `${TOGGLE_CHIP_BASE} ${selected ? on : off}` — call-site still owns
 *  its own size (padding/text) and its own selected/unselected colours;
 *  only the skeleton and the branch itself are shared. */
export function toggleChip(selected: boolean, on: string, off: string): string {
  return `${TOGGLE_CHIP_BASE} ${selected ? on : off}`;
}
