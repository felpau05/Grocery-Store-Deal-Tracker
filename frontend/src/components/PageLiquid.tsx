"use client";

import { useEffect, useRef } from "react";
import { NOISE_GLSL, fbmGLSL, readHexVar, readNumberVar } from "@/lib/liquidNoise";
import { compileFullscreenProgram, createManagedCanvas, startCappedLoop } from "@/lib/liquidRunner";

/**
 * The animated version of the page's rind stripes (globals.css'
 * `html::before`) — same wandering, torn-edged look as HeaderLiquid,
 * just vertical instead of horizontal and repeating across the whole
 * viewport width instead of running once.
 *
 * That "repeating" part is the one real structural difference from
 * HeaderLiquid, which only ever draws ONE stripe. The static CSS pattern
 * tiles a 240px unit horizontally — on a wide monitor that's a couple
 * dozen stripes, not four — so this can't just place a fixed number of
 * bands. Instead it divides the viewport into repeating cells at a fixed
 * VISUAL pitch (PITCH_PX, independent of how much the canvas itself is
 * downsampled — see u_cellCount below) and draws one wandering stripe
 * per cell, each nudged by a per-cell hash so repeats don't read as
 * identical clones.
 *
 * Kept flat inside each stripe on purpose — no HeaderLiquid-style
 * dark/deep blotch mixed into the fill. The page stripes had that
 * speckle removed on request earlier; only the EDGE stays organic here
 * (the chew/wander below), not the fill texture.
 *
 * `html::before`'s static mask remains the fallback for no-WebGL,
 * reduced-motion, or the instant before this component's effect runs on
 * a fresh load — this canvas simply paints over it once it's live,
 * fading in rather than popping so that handoff isn't a visible snap.
 */

const PITCH_PX = 60; // matches the static SVG tile's ~60px average stripe spacing
const TEXEL_SCALE = 0.4; // full-viewport surface, so this one downsamples (HeaderLiquid's 64px strip doesn't need to)

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform float u_cellCount;
uniform float u_time;
uniform vec3  u_color;
uniform float u_opacity;

${NOISE_GLSL}
${fbmGLSL(3)}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 1.5;

  float t = u_time * 0.08;

  /* Same domain-warp move as every other liquid surface — the field
     dragged through itself, so it folds rather than slides. This one
     texture (p/q/f) is shared by every stripe repeat below: keeping it
     continuous across the whole viewport, rather than restarting per
     cell, is what keeps the pattern reading as one flowing sheet
     instead of independent tiles with visible seams at their edges. */
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(4.3, 1.9) - t * 0.8));
  float f = fbm(p + 2.4 * q);

  /* Repeating cells at a fixed VISUAL pitch. u_cellCount is CSS width /
     PITCH_PX, computed on resize from the canvas's real display size —
     not from u_res, which is the (downsampled) render target. Basing
     the repeat count on render pixels would make the stripe density
     depend on TEXEL_SCALE, which is purely a cost knob and has nothing
     to do with how many stripes should be visible. */
  float cellX = uv.x * u_cellCount;
  float cellIndex = floor(cellX);
  float cellFrac = fract(cellX);

  /* One hash per repeat, not per pixel — cheap, and it's what keeps
     consecutive stripes from reading as identical clones: each gets its
     own centre offset and width from the same seed. */
  float seed = noise(vec2(cellIndex * 3.7, 11.0)) * 0.5 + 0.5;
  float centerFrac = 0.5 + (seed - 0.5) * 0.4;
  float halfW = 0.30 + seed * 0.14;

  /* Wander is capped, not eliminated — this is the one place a repeating
     pattern differs from HeaderLiquid's single stripe: let a stripe here
     drift as far as the header's does and it drifts into its NEIGHBOUR's
     cell, reading as the pattern glitching at the seam rather than as
     organic wander. These coefficients are close to the largest that
     still stays inside the narrowest lane (halfW's floor is 0.30; fbm
     lands in roughly ±0.6, so worst case here is ~0.6*0.22 + 0.6*0.12 =
     0.204, comfortably under that floor) — turned up from an earlier,
     too-conservative pass where the shape genuinely was moving but by so
     little, at colours this close in hue, that it read as static. */
  float wander = q.x * 0.22 + f * 0.12;
  float dx = abs(cellFrac - centerFrac - wander) / halfW;

  /* Three octaves chewing at the edge — coarse swell, mid lobes, fine
     dendrites — the same bottom-heavy weighting as HeaderLiquid, which
     is what makes the boundary branch and fray instead of just undulate.
     This only touches the EDGE shape; the fill below stays flat. */
  float chew = fbm(p * 1.1 + vec2(t, t * 0.4)) * 0.10
             + fbm(p * 4.5 - vec2(t, t * 0.4)) * 0.40
             + fbm(p * 10.0 + vec2(t * 2.0, 0.0)) * 0.70;

  float field = (1.0 - dx) + chew * smoothstep(0.42, 0.50, dx);
  float stripe = smoothstep(0.40, 0.50, field);

  /* Flat fill, straight to the mask's alpha — no per-pixel colour mix.
     Premultiplied on the way out to match the context's default
     premultipliedAlpha, or partially-transparent edges would composite
     against the page a shade too dark. */
  float alpha = stripe * u_opacity;
  gl_FragColor = vec4(u_color * alpha, alpha);
}
`;

export default function PageLiquid() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Appended into containerRef (an otherwise-empty div React itself
    // rendered), not straight onto document.body: body's children ARE
    // React-managed content here (the whole provider tree), so a node
    // shoved in beside them sits somewhere React's reconciler could
    // collide with on a future re-render. An empty ref'd div is a
    // container React never populates itself, so nothing it does can
    // ever step on a child appended into it — the same trick
    // HeaderLiquid and LiquidGlow already use.
    //
    // alpha:true — everywhere outside a stripe has to stay transparent
    // so the existing static gradient on `html` (unrelated to this
    // component) shows through; only the stripe pixels paint anything.
    const managed = createManagedCanvas(
      container,
      "w-full h-full block opacity-0 transition-opacity duration-500",
      (canvas) => canvas.getContext("webgl", { antialias: false, alpha: true, depth: false }),
    );
    if (!managed) return; // html::before's static mask stands in
    const { canvas, gl, destroy } = managed;

    const program = compileFullscreenProgram(gl, VERT, FRAG);
    if (!program) {
      destroy();
      return;
    }

    const uRes = gl.getUniformLocation(program, "u_res");
    const uCellCount = gl.getUniformLocation(program, "u_cellCount");
    const uTime = gl.getUniformLocation(program, "u_time");
    gl.uniform3fv(gl.getUniformLocation(program, "u_color"), readHexVar("--color-rind-stripe", [0.17, 0.48, 0.18]));
    gl.uniform1f(gl.getUniformLocation(program, "u_opacity"), readNumberVar("--rind-stripe-opacity", 0.55));

    // texelScale downsampling — HeaderLiquid renders 1:1 because it's
    // only ever 64px tall; this covers the full viewport, so the same
    // trick HeroLiquid/TripIntro use applies: render small, let the
    // browser's own upscale soften it (invisible on a field with no hard
    // edges), and the fragment cost drops with texelScale squared.
    const resize = () => {
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      const w = Math.max(1, Math.round(cssW * TEXEL_SCALE));
      const h = Math.max(1, Math.round(cssH * TEXEL_SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
      // Independent of the downsample above — this is what keeps stripe
      // DENSITY tied to real screen size rather than render-target size.
      gl.uniform1f(uCellCount, cssW / PITCH_PX);
    };
    resize();

    const start = performance.now();
    let revealed = false;

    // 30fps: ambient background motion nobody tracks closely, and this
    // runs on every route.
    const loop = startCappedLoop(
      30,
      () => document.hidden,
      (now) => {
        resize();
        gl.uniform1f(uTime, (now - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (!revealed) {
          // First real frame is in the buffer — safe to fade in without
          // showing a blank flash before anything's actually drawn.
          revealed = true;
          canvas.style.opacity = "1";
        }
      },
    );

    return () => {
      loop.stop();
      destroy();
    };
  }, []);

  return (
    // -z-10, not left at the default z-index:auto this started with.
    // `position:fixed` always opens its own stacking context, but at
    // z:auto it's still only ever a STACK-LEVEL-0 participant in body's
    // local context — painted in DOM order among OTHER stack-level-0
    // items, but strictly BEFORE anything with a real positive z-index
    // (TripIntro's own heading wrapper is z-10, SiteHeader is z-20).
    // "Mount it early so DOM order wins" was the reasoning the first
    // time this was wired up, and it was wrong: it doesn't matter how
    // early this renders if something else later just declares a higher
    // z-index — which is exactly what put these stripes on top of
    // /list's heading and the Sign In button instead of behind them.
    //
    // A NEGATIVE z-index sidesteps the whole comparison: negative-z
    // content is composited in an earlier painting step than ANY
    // normal-flow or positively-z-indexed content, full stop, regardless
    // of DOM order or what z-index that other content happens to use.
    // That's a structural guarantee instead of one that depends on every
    // future component staying below z-10.
    <div
      ref={containerRef}
      className="fixed inset-0 -z-10 pointer-events-none"
    />
  );
}
