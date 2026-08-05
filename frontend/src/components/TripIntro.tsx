"use client";

import { useEffect, useRef } from "react";
import { NOISE_GLSL, fbmGLSL, readHexVar } from "@/lib/liquidNoise";
import { compileFullscreenProgram, createManagedCanvas, startCappedLoop } from "@/lib/liquidRunner";

/**
 * Full-bleed intro splash for the trip planner: a slow liquid watermelon
 * gradient behind one giant wordmark, which the visitor scrolls past in
 * their own time (via the cue at the bottom, or just scrolling).
 *
 * The gradient is a WebGL fragment shader rather than CSS keyframes —
 * the flowing, marbled look comes from domain-warped fbm noise, which
 * has no CSS equivalent (layered radial-gradients drift, they don't
 * fold into each other). It's ~90 lines of raw WebGL with no library,
 * so it costs the bundle nothing.
 *
 * The container keeps a static CSS gradient underneath at all times, so
 * a failed context (old GPU, blocklisted driver, WebGL off) degrades to
 * a still watermelon wash instead of a blank box.
 */

/**
 * The gradient's five stops live in globals.css as --color-trip-*, so
 * they're edited alongside every other colour in the app rather than
 * buried in this file. The shader needs floats, not CSS colours, so
 * they're read once at startup and parsed — which means they must be
 * plain 3- or 6-digit hex literals. A var() chain or any color function
 * won't parse here and falls back to the value below.
 */
const STOPS = {
  pink: { varName: "--color-trip-pink", fallback: [1.0, 0.36, 0.56] },
  red: { varName: "--color-trip-red", fallback: [0.9, 0.13, 0.29] },
  green: { varName: "--color-trip-green", fallback: [0.18, 0.64, 0.42] },
  lime: { varName: "--color-trip-lime", fallback: [0.49, 0.85, 0.34] },
  orange: { varName: "--color-trip-orange", fallback: [1.0, 0.54, 0.24] },
} as const;

const readStop = ({ varName, fallback }: { varName: string; fallback: readonly number[] }) =>
  readHexVar(varName, fallback);

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

#define TRAIL 14

uniform vec2  u_res;
uniform float u_time;
/* Wake sources dropped along the cursor's path: xy = position in 0-1 UV
   (y flipped for GL), z = the u_time it was born, or -1 for an unused
   slot. Each one keeps expanding and fading on its own after the cursor
   has moved on — that persistence is what reads as water rather than as
   a shape stuck to the pointer. */
uniform vec3  u_trail[TRAIL];
uniform vec2  u_head;    /* where the cursor is right now */
uniform vec2  u_vel;     /* its recent velocity, for the bow wave */
uniform vec3  u_pink;
uniform vec3  u_red;
uniform vec3  u_green;
uniform vec3  u_lime;
uniform vec3  u_orange;

${NOISE_GLSL}
${fbmGLSL(5)}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.6;

  /* The wake. Every displacement here is applied to the sampling domain
     before the warp chain reads it, so the gradient itself bends and
     carries its colours along instead of having rings drawn over it.

     Each trail source emits a wavefront whose radius grows with age
     (ringR) rather than sitting at a fixed distance from the cursor.
     That's the whole difference: the disturbance detaches from the
     pointer and keeps travelling outward on its own, so dragging across
     leaves a spreading V of overlapping fronts behind it. */
  vec2 disp = vec2(0.0);

  for (int i = 0; i < TRAIL; i++) {
    vec3 src = u_trail[i];
    if (src.z < 0.0) continue;              /* unused slot */
    float age = u_time - src.z;
    if (age < 0.0 || age > 2.2) continue;   /* dead — outlived its fade */

    vec2 to = p - vec2(src.x * aspect, src.y) * 2.6;
    float d = length(to);

    float ringR = age * 1.25;               /* wavefront travels outward */
    float band = exp(-pow((d - ringR) * 2.6, 2.0));  /* a crest, not a disc */
    /* Waves lose height as they spread, and the whole source fades out
       over its lifetime — without both, old rings stack into noise. */
    float spread = 1.0 / (1.0 + ringR * 1.6);
    float fade = 1.0 - age / 2.2;

    /* Kept deliberately low: 14 fresh sources from one fast drag overlap
       hard, and their crests sum. Past ~0.4 total (a sixth of the
       field's height) the domain stops reading as water and shreds into
       noise, so this stays well under that even when they stack. */
    disp += (to / max(d, 0.001)) * band * spread * fade * fade * 0.07;
  }

  /* Bow wave: water shoved aside by the object itself, pushed along the
     direction of travel so a fast drag piles up ahead of the cursor
     instead of staying radially symmetric. */
  vec2 toHead = p - vec2(u_head.x * aspect, u_head.y) * 2.6;
  disp += u_vel * exp(-length(toHead) * 2.2) * 0.18;

  p += disp;

  float t = u_time * 0.055;

  /* Two rounds of domain warping — each one drags the field through the
     previous one, which is what folds the colours into each other
     instead of just sliding them around. */
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t),
                fbm(p + vec2(5.2, 1.3) - t * 0.8));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.3),
                fbm(p + 3.0 * q + vec2(8.3, 2.8) + t * 1.1));
  float f = fbm(p + 3.0 * r);

  /* fbm lands in roughly -0.6..0.6, so it has to be stretched to a full
     0..1 before driving a palette — used raw, every stop selector parks
     in its own mid-range and the last mix (orange) simply wins the whole
     frame, which is how this first came out flat orange. */
  float n = clamp(f * 1.9 + 0.5, 0.0, 1.0);
  float m = clamp(r.x * 1.6 + 0.5, 0.0, 1.0);

  /* Rind through flesh, as overlapping smoothstep bands rather than one
     linear ramp — the overlaps are what blend the seams into each other. */
  vec3 col = mix(u_green, u_lime, smoothstep(0.04, 0.40, n));
  col = mix(col, u_pink, smoothstep(0.36, 0.62, n));
  col = mix(col, u_red, smoothstep(0.58, 0.84, n));
  col = mix(col, u_orange, smoothstep(0.45, 0.95, m) * 0.7);

  /* A highlight only where the warp folds hardest, so it reads as
     liquid depth instead of a flat wash over everything. The window is
     tight to |q|'s real range (~0..0.36) — thresholds any higher never
     fire at all, which is a silent no-op rather than a visible bug. */
  col = mix(col, vec3(1.0), smoothstep(0.14, 0.34, length(q)) * 0.28);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function TripIntro({ targetId }: { targetId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  /* ── The gradient ────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The "experimental-webgl" fallback is what TripIntro keeps that
    // HeaderLiquid/PageLiquid don't: this shader is heavier (5 octaves,
    // double warp), and it's worth trying an older/blocklisted-driver
    // API name before giving up rather than dropping straight to the
    // static CSS gradient.
    const managed = createManagedCanvas(container, "absolute inset-0 w-full h-full block", (canvas) =>
      (canvas.getContext("webgl", { antialias: false, alpha: false }) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null),
    );
    if (!managed) return; // CSS gradient underneath stands in
    const { canvas, gl, destroy } = managed;

    const program = compileFullscreenProgram(gl, VERT, FRAG);
    if (!program) {
      destroy();
      return;
    }

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uTrail = gl.getUniformLocation(program, "u_trail");
    const uHead = gl.getUniformLocation(program, "u_head");
    const uVel = gl.getUniformLocation(program, "u_vel");
    gl.uniform3fv(gl.getUniformLocation(program, "u_pink"), readStop(STOPS.pink));
    gl.uniform3fv(gl.getUniformLocation(program, "u_red"), readStop(STOPS.red));
    gl.uniform3fv(gl.getUniformLocation(program, "u_green"), readStop(STOPS.green));
    gl.uniform3fv(gl.getUniformLocation(program, "u_lime"), readStop(STOPS.lime));
    gl.uniform3fv(gl.getUniformLocation(program, "u_orange"), readStop(STOPS.orange));

    // Capped DPR: this shader is 5 octaves of noise per pixel, and a
    // retina-native buffer quadruples that for no visible gain on a
    // field this soft.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();

    /* ── The wake ────────────────────────────────────────────────
       A ring buffer of TRAIL sources. A new one is dropped only once
       the cursor has travelled far enough from the last (MIN_GAP), so a
       single fast flick lays down a spaced-out line of wavefronts
       instead of dumping all 14 slots in one frame at nearly the same
       spot. Slots are seeded z = -1, which the shader reads as unused. */
    // Declared here (not beside the RAF loop) because trail timestamps
    // are measured against it, and they're written from pointer events
    // that can fire before the first frame.
    const start = performance.now();

    const TRAIL = 14;
    const MIN_GAP = 0.035; // in UV, ~3.5% of the canvas
    const trail = new Float32Array(TRAIL * 3);
    for (let i = 0; i < TRAIL; i++) trail[i * 3 + 2] = -1;
    let trailNext = 0;
    let lastDropX = 0.5;
    let lastDropY = 0.5;

    let headX = 0.5;
    let headY = 0.5;
    let velX = 0;
    let velY = 0;

    const clock = () => (performance.now() - start) / 1000;

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      // GL's origin is bottom-left; the DOM's is top-left.
      const ny = 1 - (e.clientY - rect.top) / rect.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

      // Velocity accumulates rather than being set outright, so the bow
      // wave builds through a sustained drag and doesn't spike on one
      // stray event. It's decayed every frame in draw().
      velX = Math.max(-0.35, Math.min(0.35, velX + (nx - headX) * 1.7));
      velY = Math.max(-0.35, Math.min(0.35, velY + (ny - headY) * 1.7));
      headX = nx;
      headY = ny;

      if (Math.hypot(nx - lastDropX, ny - lastDropY) < MIN_GAP) return;
      trail[trailNext * 3] = nx;
      trail[trailNext * 3 + 1] = ny;
      trail[trailNext * 3 + 2] = clock();
      trailNext = (trailNext + 1) % TRAIL;
      lastDropX = nx;
      lastDropY = ny;
    };

    const draw = (seconds: number) => {
      // The bow wave bleeds off so it settles when the cursor stops,
      // while the trail sources keep expanding on their own clock.
      velX *= 0.9;
      velY *= 0.9;
      gl.uniform3fv(uTrail, trail);
      gl.uniform2f(uHead, headX, headY);
      gl.uniform2f(uVel, velX, velY);
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      draw(0); // One frame, frozen — still pretty, no motion.
      const onResize = () => {
        resize();
        draw(0); // A resized buffer comes back cleared; repaint the frame.
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
        destroy();
      };
    }

    // fps: 0 — uncapped, unchanged from before this refactor. Every
    // sibling shader (HeaderLiquid, PageLiquid, LiquidSurface) caps at
    // 30fps; this one never has. Whether that's deliberate (a one-time
    // landing hero, arguably worth the extra cost) or just a forgotten
    // cap is an open question this refactor isn't resolving — see the
    // note on startCappedLoop in lib/liquidRunner.ts. Revisit separately.
    const loop = startCappedLoop(
      0,
      // Off-screen check kept alive rather than cancelling the loop
      // outright: cancelling would miss layout changes on the way back
      // (a Next.js route render, e.g.), which the resize() call below
      // needs to catch.
      () => document.hidden || canvas.getBoundingClientRect().bottom < 0,
      (now) => {
        resize();
        draw((now - start) / 1000);
      },
    );

    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      loop.stop();
      window.removeEventListener("pointermove", onPointerMove);
      destroy();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      // A true full-viewport hero: SiteHeader goes `fixed` on this route
      // (see HERO_ROUTES there), so it floats over the gradient instead
      // of occupying flow and stealing 4rem off the top.
      //
      // calc(var(--vh,1vh)*100), not h-screen/h-dvh: see the matching
      // comment on MelonHero — 100vh overshoots the real visible
      // viewport on mobile, and native dvh overcorrects by resizing
      // this WebGL gradient mid-scroll as Safari's chrome animates,
      // which reads as the scene zooming. --vh only updates on a real
      // resize/rotation.
      className="relative h-[calc(var(--vh,1vh)*100)] min-h-[440px] overflow-hidden border-b-2 border-ink
                 bg-[linear-gradient(135deg,var(--color-trip-pink)_0%,var(--color-trip-orange)_35%,var(--color-trip-lime)_70%,var(--color-trip-green)_100%)]"
    >
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 text-center">
        <h1
          className="font-display text-white leading-[0.85] tracking-[-0.02em]
                     text-[clamp(2.75rem,13vw,11rem)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.18)]"
        >
          PLAN A TRIP
        </h1>
      </div>

      <a
        href={`#${targetId}`}
        aria-label="Skip to the trip planner"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2
                   font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-white/85
                   hover:text-white transition-colors"
      >
        Start planning
        <span
          aria-hidden
          className="scroll-cue scroll-cue-light relative block w-[22px] h-[34px] rounded-xl border-2 border-white/60"
        />
      </a>
    </section>
  );
}
