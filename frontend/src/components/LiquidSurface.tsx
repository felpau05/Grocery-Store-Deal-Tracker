"use client";

import { useEffect, useRef } from "react";
import { initLiquidProgram, type LiquidOptions, type LiquidStops } from "@/lib/liquidNoise";
import { createManagedCanvas, startCappedLoop } from "@/lib/liquidRunner";

/**
 * A container painted with the app's three-stop flowing gradient.
 *
 * The look is the trip-planner intro's (TripIntro): domain-warped fbm,
 * which is what makes the colours fold into each other instead of
 * sliding past. TripIntro keeps its own copy because it's a genuinely
 * different shader — five stops and an interactive cursor wake — but
 * every other full surface in the app is this one at different
 * settings, so they share it. HeroLiquid is the only caller today; the
 * settings are props rather than constants so the next one doesn't
 * have to fork it.
 *
 * Small, numerous surfaces don't use this at all. The deal cards' glow
 * rings would need one context each, so they share a single offscreen
 * field instead — see lib/liquidField.
 *
 * Two things every caller inherits:
 *
 *  - A fresh <canvas> per mount. It's created in the effect rather than
 *    rendered in the JSX because the cleanup calls loseContext(), which
 *    permanently poisons the element it's called on — Strict Mode's
 *    mount/unmount/remount would otherwise hand the remount a dead
 *    element and getContext would fail.
 *  - A freed context on unmount, on every exit path. A leaked one is
 *    one of the ~8-16 the browser will ever hand out, and client-side
 *    routing burns through them: that's what made the canvas fail
 *    silently and drop back to the CSS gradient after a few navigations.
 *
 * Every caller is expected to keep a static CSS gradient underneath, so
 * a failed context (old GPU, blocklisted driver, WebGL off) degrades to
 * a still wash rather than a blank box.
 */

type Props = Partial<LiquidOptions> & {
  stops: LiquidStops;
  /** Positioning and layout for the container div. It must be a
   *  positioned box the canvas can fill (`absolute`/`fixed inset-0`). */
  className?: string;
  /** Buffer resolution as a multiple of CSS pixels. Below 1 is usually
   *  free-looking: these fields have no edges for the upscale to blur. */
  texelScale?: number;
  /** Frame cap. 0 runs uncapped at display rate. */
  fps?: number;
};

export default function LiquidSurface({
  stops,
  className = "",
  octaves = 3,
  warps = 1,
  scale = 1.6,
  speed = 0.03,
  highlight = 0.2,
  texelScale = 1,
  fps = 30,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Settings only ever come from a wrapper's own constants, so the setup
  // effect deliberately doesn't depend on them — a re-render must not
  // tear down and rebuild the context.
  const settings = useRef({ stops, octaves, warps, scale, speed, highlight, texelScale, fps });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { stops, texelScale, fps, ...options } = settings.current;

    const managed = createManagedCanvas(container, "absolute inset-0 w-full h-full block", (canvas) =>
      (canvas.getContext("webgl", { antialias: false, alpha: false, depth: false }) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null),
    );
    if (!managed) return; // The caller's CSS gradient stands in
    const { canvas, gl, destroy } = managed;

    const uniforms = initLiquidProgram(gl, options, stops);
    if (!uniforms) {
      destroy();
      return;
    }
    const { uRes, uTime } = uniforms;

    const density = Math.min(window.devicePixelRatio || 1, 1.5) * texelScale;
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * density));
      const h = Math.max(1, Math.round(canvas.clientHeight * density));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();

    const draw = (seconds: number) => {
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(0); // One frame, frozen — still pretty, no motion.
      const onResize = () => {
        resize();
        draw(0); // A resized buffer comes back cleared; repaint it.
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        destroy();
      };
    }

    const start = performance.now();

    const loop = startCappedLoop(
      fps,
      // Cheap check only — document.hidden. The expensive one
      // (getBoundingClientRect, which forces a layout) deliberately
      // stays out of here: shouldSkip runs on every vsync regardless of
      // the fps cap, and paying for a layout that often just to
      // possibly skip the frame is exactly what this was written to
      // avoid. Putting it as the first line of `draw` instead means it
      // only ever runs on frames that already passed BOTH document.hidden
      // AND the frame-cap throttle — same order the original loop had.
      () => document.hidden,
      (now) => {
        // Off-screen surfaces keep their loop alive but stop drawing —
        // cancelling it outright would miss layout changes on the way
        // back (a Next.js route render, a collapsing filter section).
        if (canvas.getBoundingClientRect().bottom < 0) return;
        resize();
        draw((now - start) / 1000);
      },
    );

    return () => {
      loop.stop();
      destroy();
    };
  }, []);

  return <div ref={containerRef} aria-hidden className={className} />;
}
