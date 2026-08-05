/* The header's frosted-glass chip, lifted out of SiteHeader so anything
   else that needs to look like a header button (the deals-page paginator)
   is styled by the same strings rather than a hand-copied lookalike that
   drifts the first time one of them is tuned.

   The tint is deliberately dark (ink, not white): these sit on the light
   coral hero, the dark watermelon rind, and the pale rind gradient behind
   the deals grid. A white/light glass goes unreadable over the coral,
   which would force several styling sets kept in sync; darkening works on
   all three, so one set holds everywhere. It's also the ceiling on how
   sheer they can get — much past ~45% and white text drops under WCAG AA
   over the coral. Lighten it and the text has to darken with it.

   Still obviously pressable: a visible rim, a rim+tint step on hover, and
   it pushes down on click. */
/* Everything that makes a chip a chip EXCEPT its size — the rim, the
   blur, the type treatment, the press. Split out so a bigger control
   (the hero's CTA) can wear the same look at its own scale: appending
   `text-sm px-6 py-3` to the full CHIP would leave two font-size and two
   padding utilities on one element, and Tailwind resolves that by
   stylesheet order, not by the order you wrote them. */
export const CHIP_LOOK =
  "font-mono font-bold border-2 backdrop-blur-md transition-all active:translate-y-px " +
  /* Without this, a disabled button (the paginator's ← / → at either
     end) can still visibly react to the mouse: `:disabled` blocks
     CLICKS, but browsers keep matching `:hover` on it regardless, so
     CHIP_QUIET_LIGHT's hover tint was flashing in over a button that
     was supposedly off. pointer-events-none stops the pointer from
     registering on it at all — hover, active, the lot. */
  "disabled:pointer-events-none disabled:cursor-not-allowed";

/* Smaller by default, full size from `sm:` up — the header wears these
   at mobile widths where every chip on the row is competing for space
   (see SiteHeader), and the deals paginator inherits the same shrink for
   free since it's on the shared string. The hero CTA is unaffected: it
   builds off CHIP_LOOK directly, not this sized constant. */
export const CHIP = `text-[10px] px-2 py-1 sm:text-[12px] sm:px-3 sm:py-1.5 ${CHIP_LOOK}`;

export const CHIP_QUIET =
  "bg-ink/45 border-paper/40 text-paper hover:bg-ink/60 hover:border-paper/80";

/* The only variant: current page / running-scrape state, and it differs
   from CHIP_QUIET purely by strength — same tint, same rim colour, just
   more of both. Anything that changes the rim's COLOUR stops reading as
   the same control and starts looking like a different kind of button,
   which is why there is no third style here. */
export const CHIP_ACTIVE = "bg-ink/70 border-paper/85 text-paper";

/* Disabled chips (the paginator's ← / → at either end) — no hover step,
   and faded rather than removed so the row keeps its shape. */
export const CHIP_DISABLED = "bg-ink/25 border-paper/25 text-paper/50";

/* Paginator-only light variant. CHIP_QUIET's dark-ink glass above is
   deliberate for the header/hero — it has to hold up over the coral
   hero, the dark rind header, AND the pale rind page gradient all at
   once. The paginator no longer sits on any of those (it's directly on
   the page's own pale striped background now, no gradient panel behind
   it), so it can go the other way instead: a near-white glass with dark
   text and a solid ink rim, closer to how the rest of the app's cards
   read. Scoped to the paginator alone — CHIP_QUIET/CHIP_ACTIVE stay
   exactly as they are for SiteHeader and MelonHero's CTA. */
export const CHIP_QUIET_LIGHT =
  "bg-white/70 border-ink/70 text-ink hover:bg-white/90 hover:border-ink";

/* Was bg-white/35 + text-ink/40 — a translucent white on a page that's
   ALSO pale, so a disabled chip and an enabled one differed mainly in
   how bold the border was, easy to miss at a glance. This version
   trades translucency for an actual flat grey wash — bg-ink/8 reads as
   dull stone rather than "lighter white" next to CHIP_QUIET_LIGHT's
   crisp bg-white/70, and ink-soft (already a mid-grey token) at half
   opacity keeps the glyph itself visibly faded rather than just a
   thinner black. */
export const CHIP_DISABLED_LIGHT = "bg-ink/8 border-ink/15 text-ink-soft/50";
