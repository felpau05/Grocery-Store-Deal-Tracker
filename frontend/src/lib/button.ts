/* .btn-brut-ink/.glow-btn (globals.css) already are the shape+press
   layer — chip.ts's CHIP_LOOK equivalent for this button family. What
   was missing is the size+color layer: every call site hand-wrote its
   own combination inline, and several of those combinations turned out
   to be byte-identical strings living in 2-3 different files. These are
   exactly those confirmed duplicates, lifted out once.

   Three of the four (CART_ADD, FOLLOWUP_CTA, NUDGE_CTA) are secondary/
   repeated actions nested inside an already-glowing GlassCard panel, so
   they stay on .btn-brut-ink's flat black shadow. Only PRIMARY_CTA is
   ever a page/panel's single standalone action, so it alone uses
   .glow-btn and expects to be wrapped in <GlassCard as="button">. */

/** CartDrawer's cart-row "+ Add" action, and list/page.tsx's matching
 *  one — verbatim in both. */
export const BTN_CART_ADD =
  "btn-brut-ink px-3 py-2 bg-produce text-paper text-sm font-mono font-bold";

/** page.tsx's "Retry" button and list/page.tsx's matching follow-up CTA
 *  below other content — verbatim in both, including the shared mt-4. */
export const BTN_FOLLOWUP_CTA =
  "btn-brut-ink mt-4 px-4 py-2 bg-produce text-paper text-sm font-mono font-bold";

/** The 3 account-nudge banners on "/" (no postal code / no stores /
 *  anonymous visitor) — verbatim ×3 in the same file. btn-brut-ink
 *  (no orange shadow), not plain btn-brut, since it sits on the
 *  frosted GlassCard surface rather than directly on the page. */
export const BTN_NUDGE_CTA =
  "btn-brut-ink px-3.5 py-1.5 bg-sale text-paper font-mono font-bold text-[12px] uppercase shrink-0";

/** login/page.tsx's sign-in submit button, and list/page.tsx's "Build my
 *  trip" button — same base string in both. Each is the single primary
 *  action of its page/panel, so it wears `.glow-btn`, not `.btn-brut-ink`
 *  — wrap the call site in `<GlassCard as="button" surfaceClassName={
 *  BTN_PRIMARY_CTA}>` rather than using this as a bare button className;
 *  the shadow now lives on that wrapper's LiquidGlow ring, not on the
 *  button itself. list/page.tsx additionally wants `mt-5
 *  disabled:cursor-not-allowed`, kept at that call site rather than
 *  folded in here: login's disabled state is rare enough that the
 *  missing class may be deliberate, not drift, and this refactor isn't
 *  the place to guess and silently change one page's behaviour to match
 *  the other's. (`disabled:shadow-none` dropped — dead now that
 *  `.glow-btn` never paints a shadow to hide. `disabled:opacity-40`
 *  dropped too — GlassCard already dims the whole wrapper to 50% when
 *  `as="button"` is disabled; keeping both compounded to ~20% opacity,
 *  a washed-out/ghosted look on this exact button.) */
export const BTN_PRIMARY_CTA =
  "glow-btn w-full bg-sale text-paper font-display py-3 hover:bg-produce transition-colors";
