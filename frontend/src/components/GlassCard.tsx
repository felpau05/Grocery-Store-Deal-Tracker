import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * The app's card: a `.deal-card-glow` wrapper (globals.css) carrying the
 * shadow, around an inner surface. Four places hand-wrote this exact
 * structure before this component existed — DealCard, DealsSidebar's
 * Card(), the account-nudge banners, and the search bar — byte-for-byte
 * identical in three of the four. This is that structure, once.
 *
 * It is no longer "glass". The name is kept because ~20 call sites
 * import it, but the surface is opaque white with a hairline edge and a
 * diffuse shadow; there is no blur and nothing shows through. The
 * backdrop-blur it used to carry existed to keep text readable over the
 * coral page gradient, and the page isn't coral any more.
 *
 * Two things still stand outside this component, both deliberate:
 *   · the animated fog is the PAGE BACKGROUND (PageLiquid) and the
 *     HEADER (HeaderLiquid) only — never a card, hero or panel surface;
 *   · `LiquidGlow.tsx` and the `.deal-card-glow-ring` CSS still exist
 *     and nothing renders them.
 */

/** The default inner surface. DealCard, DealsSidebar's cards, and the
 *  account-nudge banners all use this verbatim — it's the shared token,
 *  not a per-caller choice.
 *
 *  Fully opaque, unlike the `bg-card/90 backdrop-blur-md` this replaces.
 *  That translucency was a contrast workaround: at `/80` the coral page
 *  gradient bled through far enough to drop --color-ink-soft body text
 *  to ~3.5:1, under WCAG AA's 4.5:1 floor, and `/90` was the minimum
 *  that cleared it. On white over a pale page there is nothing to bleed
 *  and ink-soft measures 6.6:1, so the blur is pure GPU cost on every
 *  card in a 24-card grid for no legibility gain. */
export const GLASS_SURFACE =
  "relative overflow-hidden rounded-card bg-surface border border-line p-4";

/** Same surface, minus the padding — for panels that bring their own
 *  (filters/sort sidebar, settings, login, item-detail's spec table).
 *  It used to differ in opacity too (`/95` vs `/90`, to hold ~6.2:1
 *  under a wall of small ink-soft labels); both are opaque white now,
 *  so padding is the only remaining difference.
 *
 *  Compose it yourself: `${GLASS_SURFACE_DENSE} p-5`. */
export const GLASS_SURFACE_DENSE =
  "relative overflow-hidden rounded-card bg-surface border border-line";

/** The account-nudge banners' inner surface (no postal code / no stores
 *  / anonymous visitor, on "/" and "/list") — GLASS_SURFACE's border/blur
 *  carried over, but px-4 py-3 + a flex row instead of GLASS_SURFACE's
 *  own p-4, a genuine difference rather than an addition, so it's not
 *  built by appending to GLASS_SURFACE. Shared here rather than defined
 *  per-page since both call sites were already byte-identical strings. */
export const NUDGE_BANNER_SURFACE =
  "relative overflow-hidden rounded-card bg-accent-soft border border-line px-4 py-3 flex items-center justify-between gap-4 flex-wrap";

type BaseProps = {
  /** Wrapper hover-lift — DealCard is the only current consumer. The
   *  shadow's own hover-deepen (`.deal-card-glow:hover` in globals.css)
   *  is unconditional CSS and always applies regardless of this prop;
   *  this only toggles the CARD's own translate. */
  interactive?: boolean;
  /** Classes for the outer `.deal-card-glow` wrapper — spacing like
   *  `mb-6`, not surface styling. */
  wrapperClassName?: string;
  /** A FULL REPLACEMENT for the inner surface's classes, not something
   *  merged with GLASS_SURFACE — defaults to GLASS_SURFACE untouched.
   *  The search bar needs a completely different border/padding, not an
   *  addition to the default one, which is why this isn't additive. */
  surfaceClassName?: string;
  children: ReactNode;
};

type DivProps = BaseProps & { as?: "div" } & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">;
type LinkProps = BaseProps & { as: typeof Link } & Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children">;
type ButtonProps = BaseProps & { as: "button" } & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

type GlassCardProps = DivProps | LinkProps | ButtonProps;

export default function GlassCard(props: GlassCardProps) {
  const { as, interactive, wrapperClassName = "", surfaceClassName = GLASS_SURFACE, children, ...rest } = props;
  // `as any`, not `as ElementType` — tried that first, and JSX still
  // checked `<Surface {...rest}>` against plain div HTMLAttributes
  // anyway (it falls back to that branch when it can't disambiguate),
  // so it didn't actually help. `rest`'s real type is only narrowed to
  // match `as` at each CALL site via the GlassCardProps union above —
  // inside this one shared render path, TS only ever sees "some div
  // props or some Link props, unclear which," which no honest type for
  // `Surface` resolves without a dedicated polymorphic-component helper
  // (this app has no such library, and one felt like overkill for a
  // closed 2-member union with 4 known call sites). This is the
  // deliberate, common escape hatch for that exact situation: type
  // safety for the render path is traded away here, but the PUBLIC
  // GlassCardProps union above still enforces it at every call site
  // (e.g. `as={Link}` without `href` still fails to compile) — which is
  // the boundary that actually matters to callers.
  const Surface = (as ?? "div") as any;
  // A disabled primary CTA shouldn't sit proud like it's the thing to
  // click — dim the whole wrapper (shadow included), not just the
  // button surface.
  const isDisabledButton = as === "button" && (rest as { disabled?: boolean }).disabled;
  return (
    // The wrapper is still its own element rather than folding
    // .deal-card-glow into the surface: a shadow can't be cast from an
    // element that clips its own overflow, and a GlassCard-wrapped
    // button presses INSIDE a wrapper that holds still — see
    // `.glow-btn` in globals.css.
    //
    // The lift is straight up now. It used to also translate left
    // (-translate-x-0.5), which was correct when the card sat on a
    // down-RIGHT offset slab — moving up-left is what widened the gap
    // to the slab. With a centred diffuse shadow a sideways drift has
    // nothing to move away from and just reads as the card sliding.
    <div
      className={`deal-card-glow ${interactive ? "hover:-translate-y-0.5 transition-transform " : ""}${isDisabledButton ? "opacity-50 " : ""}${wrapperClassName}`}
    >
      <Surface className={surfaceClassName} {...rest}>
        {children}
      </Surface>
    </div>
  );
}
