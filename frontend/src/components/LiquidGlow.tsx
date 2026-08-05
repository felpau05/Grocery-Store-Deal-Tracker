"use client";

import { useEffect, useRef } from "react";
import { subscribeLiquidRing } from "@/lib/liquidField";

/**
 * A deal card's glow ring: the offset slab peeking out from under the
 * card, painted with the app's flowing liquid gradient.
 *
 * The canvas holds no context of its own — it's a 2D window onto the
 * single shared WebGL field (lib/liquidField), which is what makes this
 * affordable 24 times over on one page, and what makes the flow
 * continuous from card to card instead of 24 identical loops.
 *
 * Its CSS class carries a drifting gradient as the background (see
 * .deal-card-glow-ring in globals.css). Nothing is drawn over it when
 * the field is unavailable — no WebGL, or the context budget already
 * spent elsewhere — so the ring degrades to that instead of vanishing.
 */
export default function LiquidGlow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const unsubscribe = subscribeLiquidRing(canvas);
    if (!unsubscribe) return; // CSS gradient stands in

    // The shader now covers the fallback completely, so stop animating
    // it — otherwise every card composites a gradient nobody can see.
    canvas.dataset.live = "";

    return () => {
      delete canvas.dataset.live;
      unsubscribe();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="deal-card-glow-ring" />;
}
