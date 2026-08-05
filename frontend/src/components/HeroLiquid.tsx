"use client";

import LiquidSurface from "@/components/LiquidSurface";

/**
 * Flowing gradient behind the landing-page hero — the trip-planner
 * intro's look on the hero's own three stops (--color-hero-*, the same
 * ones the static radial gradient underneath it uses).
 *
 * The full-strength version of the effect: two warps and four octaves,
 * since this is a full-viewport surface the visitor looks straight at
 * with nothing but the melon on top of it. No cursor wake, though —
 * the 3D melon iframe covers the hero and swallows pointer events, so a
 * window-level listener would be dead everywhere it matters. That's
 * left to /list, where nothing sits on top to eat them.
 *
 * The highlight runs higher than the other surfaces': these three stops
 * sit close together in hue and luminance, and without it the folds
 * barely separate.
 */
export default function HeroLiquid() {
  return (
    <LiquidSurface
      stops={{
        from: { varName: "--color-hero-from", fallback: [1.0, 0.58, 0.58] },
        via: { varName: "--color-hero-via", fallback: [1.0, 0.46, 0.46] },
        to: { varName: "--color-hero-to", fallback: [1.0, 0.2, 0.2] },
      }}
      /* Three octaves, not the trip intro's four-plus: the fourth is
         the finest detail in the field, and at the resolution below it
         lands under a pixel — it was being averaged away before it
         reached the screen. Three through two warps is 15 noise samples
         per pixel, which is what makes pixel count (texelScale) the
         dial that matters most.

         Two warps stay. The folding is the whole look, and it's what
         separates this from a CSS gradient — drop to one and the field
         slides instead of turning over. */
      octaves={3}
      warps={2}
      scale={2.6}
      speed={0.055}
      highlight={0.3}
      /* This surface shares the page with the melon's three.js scene —
         its own renderer, its own loop, in an iframe — so these two are
         the cost dials, in the order worth reaching for.

         texelScale is the cheap one, because fragment cost goes with
         its square: at 0.5 this renders a quarter of the pixels for an
         image you can't tell apart, the field having no edges in it for
         the upscale to soften. 0.35 is another 2x and still holds up.

         fps is the honest one. At 60 the shader asks for the GPU on
         every vsync, alongside the melon. The drift is slow enough
         (speed 0.055) that 30 shows no stepping, so that's the next
         halving available if the hero still feels heavy. */
      texelScale={0.5}
      fps={30}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
