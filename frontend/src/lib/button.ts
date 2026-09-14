/* Size + colour for the app's buttons. The SHAPE and the PRESS live in
   globals.css (`.btn-brut-ink`, `.glow-btn`) — these constants are the
   layer on top, and they exist because every call site used to
   hand-write its own combination and several of those turned out to be
   byte-identical strings living in 2-3 different files.

   Soft-modern now: `rounded-control`, a diffuse shadow, a 1px press.
   The class names still say "brut" because the CSS rules do; see the
   migration note at the top of globals.css. Three of the four
   (CART_ADD, FOLLOWUP_CTA, NUDGE_CTA) are secondary/repeated actions
   nested inside an already-elevated card, so they stay on
   `.btn-brut-ink`. Only PRIMARY_CTA is ever a page or panel's single
   standalone action, so it alone uses `.glow-btn` and expects to be
   wrapped in `<GlassCard as="button">`. */

/** CartDrawer's cart-row "+ Add" action, and list/page.tsx's matching
 *  one — verbatim in both. */
export const BTN_CART_ADD =
  "btn-brut-ink rounded-control px-3 py-2 bg-accent text-white text-sm font-semibold hover:bg-accent-dark";

/** page.tsx's "Retry" button and list/page.tsx's matching follow-up CTAs
 *  below other content (its own Retry, and "Save as draft" under the
 *  trip total) — verbatim in each, including the shared mt-4. */
export const BTN_FOLLOWUP_CTA =
  "btn-brut-ink rounded-control mt-4 px-4 py-2 bg-accent text-white text-sm font-semibold hover:bg-accent-dark";

/** The account-nudge banners on "/" and "/list" (no postal code / no
 *  stores / anonymous visitor) — verbatim ×3 in the same file. No
 *  longer uppercase mono: the banner is one quiet sentence with one
 *  action, and shouting the action was most of why it read as an alert
 *  rather than a suggestion. */
export const BTN_NUDGE_CTA =
  "btn-brut-ink rounded-control px-3.5 py-1.5 bg-accent text-white font-semibold text-[13px] shrink-0 hover:bg-accent-dark";

/** A secondary action beside a primary one — "Cancel", "Clear filters",
 *  "Fewest stops". Outlined, fills only on hover. New: every call site
 *  that needed this previously reached for a second FILLED button, which
 *  is why so many panels had two things competing to be pressed. */
export const BTN_SECONDARY =
  "btn-soft-quiet px-4 py-2 text-sm font-semibold";

/** login/page.tsx's sign-in submit button, and list/page.tsx's "Build my
 *  trip" button — same base string in both. Each is the single primary
 *  action of its page/panel, so it wears `.glow-btn`, not
 *  `.btn-brut-ink` — wrap the call site in `<GlassCard as="button"
 *  surfaceClassName={BTN_PRIMARY_CTA}>` rather than using this as a bare
 *  button className; the shadow lives on that wrapper
 *  (`.deal-card-glow`), not on the button itself.
 *
 *  list/page.tsx additionally wants `mt-5 disabled:cursor-not-allowed`,
 *  kept at that call site rather than folded in here: login's disabled
 *  state is rare enough that the missing class may be deliberate rather
 *  than drift. `disabled:opacity-40` stays dropped — GlassCard already
 *  dims the whole wrapper to 50% when `as="button"` is disabled, and
 *  keeping both compounded to ~20%, a ghosted look on this exact
 *  button. */
export const BTN_PRIMARY_CTA =
  "glow-btn w-full bg-accent text-white font-display text-[15px] py-3 hover:bg-accent-dark transition-colors";
