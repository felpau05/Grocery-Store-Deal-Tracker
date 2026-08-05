"use client";

import { useEffect, useRef } from "react";
import { NOISE_GLSL, fbmGLSL, readHexVar, readNumberVar } from "@/lib/liquidNoise";
import { compileFullscreenProgram, createManagedCanvas, startCappedLoop } from "@/lib/liquidRunner";

/**
 * Slow-flowing watermelon rind behind the site header.
 *
 * Deliberately much cheaper than the trip-planner intro's gradient:
 * this one is on screen on every page, all the time, so it runs 3
 * octaves instead of 5, a single warp instead of a double, and drifts
 * at roughly half the speed. It also parks itself whenever the tab is
 * hidden or the header is transparent (the hero routes), so it costs
 * nothing while the visitor is looking at something else.
 *
 * Colours are --color-header-rind-* in globals.css.
 */

const STOPS = {
  pale: { varName: "--color-header-rind-pale", fallback: [0.58, 0.77, 0.33] },
  light: { varName: "--color-header-rind-light", fallback: [0.7, 0.85, 0.49] },
  dark: { varName: "--color-header-rind-dark", fallback: [0.17, 0.48, 0.18] },
  deep: { varName: "--color-header-rind-deep", fallback: [0.08, 0.32, 0.11] },
};

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
/* highp, not mediump: the hash in NOISE_GLSL needs 32-bit floats to
   survive fract(sin(p) * 43758.5453). Desktop GPUs promote mediump and
   hide the problem; Apple's give you a real 16-bit float and the noise
   collapses into flat blocks. See the note in lib/liquidNoise.ts. */
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_pale;
uniform vec3  u_light;
uniform vec3  u_dark;
uniform vec3  u_deep;
uniform float u_scrim;

${NOISE_GLSL}
${fbmGLSL(3)}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;

  /* The header is ~20x wider than it is tall. Scaling x by the real
     aspect keeps the pattern round instead of smeared into horizontal
     streaks, and 0.9 sizes it to roughly the bar's height. */
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 0.9;

  float t = u_time * 0.04;

  /* Domain warp — the same move the trip-planner intro makes, and the
     reason both read as liquid: the field is dragged through itself, so
     colours fold into each other instead of sliding past. One pass
     here, not the intro's two, since this runs on every page. */
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(4.3, 1.9) - t * 0.8));
  float f = fbm(p + 2.4 * q);

  /* The pale field, mottled and flowing. */
  float n = clamp(f * 2.0 + 0.5, 0.0, 1.0);
  vec3 col = mix(u_pale, u_light, smoothstep(0.10, 0.75, n));

  /* ONE stripe, running the length of the bar. Both its centre-line and
     its edges are displaced by the same warp field driving the colour
     above, so the band flows WITH the rind rather than sitting on top
     of it as a separate shape. */
  /* Wander is kept small on purpose. The logo and nav are vertically
     centred, so the band has to stay under them — let it roam and the
     text drifts over the pale field at some x positions, which is both
     ugly and the worst-contrast case for white text. */
  float wander = q.y * 0.04 + f * 0.02;
  float halfW = 0.58;
  float dy = abs(uv.y - 0.5 + wander) / halfW;   /* 0 at centre, 1 at nominal edge */

  /* Three octaves chewing at the band: the coarse one swells and
     pinches its width along the bar, the middle pushes lobes in and
     out, the fine one frays those into dendrites.

     The weighting is deliberately bottom-heavy (0.10 / 0.40 / 0.70,
     coarse to fine). Weighted the intuitive way round — most energy in
     the coarse octave — the edge just undulates smoothly, which is a
     wavy line, not rind. The branching and the stranded flecks are
     almost entirely the high-frequency term's doing. */
  float chew = fbm(p * 1.1 + vec2(t, t * 0.4)) * 0.10
             + fbm(p * 4.5 - vec2(t, t * 0.4)) * 0.40
             + fbm(p * 10.0 + vec2(t * 2.0, 0.0)) * 0.70;

  /* The ramp window has to sit INSIDE the boundary, not on it. The edge
     naturally lands near dy = 0.55 (where 1 - dy meets the threshold),
     so ramping chew in from 0.55 multiplies it by ~zero exactly where
     it was supposed to bite — that produced a perfect rectangle with a
     ruler-straight edge. Starting at 0.42 puts chew at full strength by
     the time the boundary is reached, while still leaving the core
     untouched: the core is what holds white header text on dark rind
     (see --header-rind-scrim in globals.css). */
  float field = (1.0 - dy) + chew * smoothstep(0.42, 0.50, dy);

  /* A tight threshold across a fractal field is the whole trick: since
     the field carries all three octaves, its level-set is fractal, so
     the boundary comes out branching, with detached flecks stranded
     outside it and pale lacunae bitten into it. Perturbing a smooth
     edge — what this did before — only ever gives a wavy line. */
  float stripe = smoothstep(0.40, 0.50, field);

  /* Blotchy, not solid — real rind stripes are a mesh of dark veins
     with lighter flesh showing through. */
  vec3 dark = mix(u_dark, u_deep, smoothstep(-0.15, 0.35, f));
  col = mix(col, dark, stripe);

  /* Rind is genuinely pale, and the logo and nav on top of it are
     white. Without this the header pattern wins and the text stops
     being readable — see --header-rind-scrim in globals.css. */
  col = mix(col, u_deep, u_scrim);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function HeaderLiquid({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Read in the RAF loop without re-running the WebGL setup effect.
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const managed = createManagedCanvas(container, "absolute inset-0 w-full h-full block", (canvas) =>
      canvas.getContext("webgl", { antialias: false, alpha: false, depth: false }),
    );
    if (!managed) return; // The static gradient in SiteHeader stands in
    const { canvas, gl, destroy } = managed;

    const program = compileFullscreenProgram(gl, VERT, FRAG);
    if (!program) {
      destroy();
      return;
    }

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    gl.uniform3fv(gl.getUniformLocation(program, "u_pale"), readHexVar(STOPS.pale.varName, STOPS.pale.fallback));
    gl.uniform3fv(gl.getUniformLocation(program, "u_light"), readHexVar(STOPS.light.varName, STOPS.light.fallback));
    gl.uniform3fv(gl.getUniformLocation(program, "u_dark"), readHexVar(STOPS.dark.varName, STOPS.dark.fallback));
    gl.uniform3fv(gl.getUniformLocation(program, "u_deep"), readHexVar(STOPS.deep.varName, STOPS.deep.fallback));
    gl.uniform1f(gl.getUniformLocation(program, "u_scrim"), readNumberVar("--header-rind-scrim", 0.4));

    // 1.0 DPR is plenty: the field is soft and only 64px tall, so a
    // retina buffer doubles the pixel cost for nothing visible.
    const resize = () => {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();

    const start = performance.now();
    // Frame-capped: this is ambient background motion nobody tracks
    // closely, and 30fps halves its cost on every page in the app.
    const loop = startCappedLoop(
      30,
      () => !activeRef.current || document.hidden,
      (now) => {
        resize();
        gl.uniform1f(uTime, (now - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    );

    return () => {
      loop.stop();
      destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
