/* The selected/unselected toggle chip: AddToListButton's in-list badge,
   settings' "groceries only" filter and store checkboxes, and list/page's
   item-pick buttons all hand-write a `selected ? A : B` ternary over a
   border-2/transition-all base — but unlike lib/button.ts's confirmed
   verbatim duplicates, none of these four are actually the same string.
   Padding, selected-state background, and even the shadow's colour
   (--color-shadow vs --color-tag) and size (2px vs 3px) all differ site
   to site, and read as deliberate per-context choices rather than
   copy-paste drift — so this doesn't collapse them to one default the
   way BTN_CART_ADD etc. do. What's actually shared is the SHAPE
   (border-2 + transition-all) and the TERNARY PATTERN itself; both are
   named here so there's one obvious place to reach for "how does a
   toggle chip work" without either guessing at a shared colour that was
   never really shared, or leaving `border-2 transition-all` duplicated
   a 5th time the next this pattern is needed. */

export const TOGGLE_CHIP_BASE = "border-2 transition-all";

/** `${TOGGLE_CHIP_BASE} ${selected ? on : off}` — call-site still owns
 *  its own size (padding/text) and its own selected/unselected colours;
 *  only the skeleton and the branch itself are shared. */
export function toggleChip(selected: boolean, on: string, off: string): string {
  return `${TOGGLE_CHIP_BASE} ${selected ? on : off}`;
}
