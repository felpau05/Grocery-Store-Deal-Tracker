import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import LiquidGlow from "./LiquidGlow";

/**
 * The frosted "glass card" surface: a `.deal-card-glow` wrapper (globals.css
 * — position:relative, no z-index, DOM order alone keeps the ring painted
 * behind the card) around a `<LiquidGlow />` ring and an inner surface
 * blurred over it. Four places in the app hand-wrote this exact structure
 * before this component existed — DealCard, DealsSidebar's Card(), the
 * three account-nudge banners on "/", and the search bar — byte-for-byte
 * identical in three of the four. This is that structure, once.
 */

/** The default inner surface. DealCard, DealsSidebar's cards, and the
 *  account-nudge banners all use this verbatim — it's the shared token,
 *  not a per-caller choice.
 *
 *  `/90`, not `/80`: glass, but strong enough to actually read. `/80` was
 *  still letting the page's coral gradient bleed through enough to drop
 *  --color-ink-soft body text under WCAG AA's 4.5:1 floor at the
 *  gradient's deepest stop (measured ~3.5:1). `/90` clears it
 *  (~5.8:1) while keeping the frosted-blur feel. */
export const GLASS_SURFACE =
  "relative overflow-hidden bg-card/90 backdrop-blur-md border border-white/40 p-4";

/** Same surface, denser — for panels that are mostly small body text
 *  (filters/sort sidebar, settings, login, item-detail's spec table)
 *  rather than a big headline or a product photo. Even `/90` still
 *  leaves the deepest gradient stop under 6:1, which is fine for a
 *  headline but tight for a wall of --color-ink-soft labels — `/95`
 *  holds ~6.2:1 there.
 *
 *  No padding baked in (unlike GLASS_SURFACE's `p-4`) — call sites
 *  migrating off `.brut p-5`/`p-6`/etc. bring their own padding, so
 *  compose it yourself: `${GLASS_SURFACE_DENSE} p-5`. */
export const GLASS_SURFACE_DENSE =
  "relative overflow-hidden bg-card/95 backdrop-blur-md border border-white/40";

/** The account-nudge banners' inner surface (no postal code / no stores
 *  / anonymous visitor, on "/" and "/list") — GLASS_SURFACE's border/blur
 *  carried over, but px-4 py-3 + a flex row instead of GLASS_SURFACE's
 *  own p-4, a genuine difference rather than an addition, so it's not
 *  built by appending to GLASS_SURFACE. Shared here rather than defined
 *  per-page since both call sites were already byte-identical strings. */
export const NUDGE_BANNER_SURFACE =
  "relative overflow-hidden bg-card/90 backdrop-blur-md border border-white/40 px-4 py-3 flex items-center justify-between gap-4 flex-wrap";

type BaseProps = {
  /** Wrapper hover-lift — DealCard is the only current consumer. The
   *  ring's own hover-grow (`.deal-card-glow:hover .deal-card-glow-ring`
   *  in globals.css) is unconditional CSS and always applies regardless
   *  of this prop; this only toggles the CARD's own translate. */
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
  // A disabled primary CTA shouldn't glow like it's the thing to click —
  // dim the whole wrapper (ring included), not just the button surface.
  const isDisabledButton = as === "button" && (rest as { disabled?: boolean }).disabled;
  return (
    // First child on purpose, no z-index: same reasoning as every other
    // .deal-card-glow consumer — DOM order is what keeps the ring painted
    // behind the surface, since the surface's own opaque-ish background
    // (bg-card/90 + backdrop-blur) is what makes it look right on top.
    <div
      className={`deal-card-glow ${interactive ? "hover:-translate-x-0.5 hover:-translate-y-0.5 transition-transform " : ""}${isDisabledButton ? "opacity-50 " : ""}${wrapperClassName}`}
    >
      <LiquidGlow />
      <Surface className={surfaceClassName} {...rest}>
        {children}
      </Surface>
    </div>
  );
}
