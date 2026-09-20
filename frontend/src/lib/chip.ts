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

/* ── Body chips (everything OUTSIDE the header) ──────────────────────
   The dark-ink glass above is the HEADER's chip and stays exactly as it
   is — the header is the one surface that keeps its brutalist treatment,
   and these constants are what make that a deliberate contrast rather
   than an inconsistency. Do not use CHIP_QUIET/CHIP_ACTIVE below the
   header; do not use these two inside it.

   The light pair used to be "CHIP but near-white glass", inheriting
   CHIP's `border-2` + mono caps + backdrop blur. They're now built from
   their own base instead: on white cards a 2px rim and an uppercase mono
   label are exactly the two things that made the body read as brutalist. */
export const CHIP_SOFT =
  "inline-flex items-center justify-center gap-1.5 rounded-control border text-[13px] font-semibold " +
  "px-3 py-1.5 transition-colors disabled:pointer-events-none disabled:cursor-not-allowed";

export const CHIP_QUIET_LIGHT =
  "bg-surface border-line text-ink hover:bg-surface-2 hover:border-line-strong";

/* Current page / selected. A filled accent, not "the same chip but more
   tinted" — on a calm layout the selected state is allowed to be the one
   saturated thing in the row, and it needs to survive being surrounded
   by white. */
export const CHIP_ACTIVE_LIGHT =
  "bg-accent-dark border-accent-dark text-white hover:bg-accent-deep hover:border-accent-deep";

export const CHIP_DISABLED_LIGHT = "bg-surface-2 border-line text-ink-muted";

/* The cue INSIDE a card that is itself the link or button — ActionCard's
   "Open", the cart drawer's footer pair. It used to be bare green bold
   text with an arrow glued on ("Open →", "All shopping trips →"), which
   is the one control style in the app that looked like nothing else in
   it: not a button, not body copy, and on a narrow panel it wrapped
   mid-phrase into two ragged green lines. Same chip as the rest of the
   body now.

   It reacts to hovering the CARD, not itself, so the call site needs
   `group` on the element that is actually the control. Use
   `CHIP_QUIET_LIGHT` instead for a chip that IS the control. */
export const CHIP_CUE =
  `${CHIP_SOFT} bg-surface-2 border-line text-ink-soft ` +
  "group-hover:bg-accent-soft group-hover:border-accent/40 group-hover:text-accent-dark";

/** The arrow that trails a cue or a secondary link — its own element, so
 *  it can nudge on hover and can't be wrapped onto a line by itself the
 *  way a glyph pasted into the label string could. */
export const CHIP_ARROW = "transition-transform duration-200 group-hover:translate-x-0.5";
