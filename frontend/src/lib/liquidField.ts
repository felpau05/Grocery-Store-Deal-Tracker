/**
 * One liquid field, many windows onto it.
 *
 * The deal cards' glow rings need the real shader — the same folding
 * gradient as the hero and the page background, not a CSS lookalike.
 * The obvious way to do that (a canvas per card) doesn't work: a canvas
 * is a WebGL context, a full grid is 24 cards, and browsers hand out
 * ~8-16 contexts in total. The later cards would fail outright.
 *
 * So the field is rendered ONCE per frame into a single offscreen
 * canvas covering the viewport, and each ring is a cheap 2D canvas that
 * copies the slice of that field sitting behind it. One WebGL context
 * for the entire grid, and because every ring samples the shared field
 * by its own screen position, the flow is continuous from card to card
 * — one sheet of liquid under the whole page rather than 24 loops
 * running side by side.
 *
 * Everything is lazy and refcounted: the context is created when the
 * first ring subscribes and freed when the last one leaves, so routes
 * without deal cards don't hold a context at all.
 */

import { initLiquidProgram, type LiquidOptions, type LiquidStops } from "@/lib/liquidNoise";

/** Matches the deal cards' flesh palette (globals.css --color-deals-*). */
const STOPS: LiquidStops = {
  from: { varName: "--color-deals-from", fallback: [1.0, 0.66, 0.66] },
  via: { varName: "--color-deals-via", fallback: [1.0, 0.46, 0.46] },
  to: { varName: "--color-deals-to", fallback: [1.0, 0.2, 0.2] },
};

const OPTIONS: LiquidOptions = {
  octaves: 4,
  warps: 2,
  scale: 2.2,
  speed: 0.05,
  /* No highlight: a white fold surfacing under a card would show
     through its frosted glass and fight the text on top. */
  highlight: 0,
};

/* Source resolution, in source pixels per CSS pixel of viewport. The
   field has no edges in it, so the ~3x upscale on the way into each
   ring is invisible — and this is the one buffer the whole grid shares,
   so it's worth keeping small. */
const SOURCE_SCALE = 0.3;

/* Each ring's own buffer, likewise: only a 4-7px sliver of it is ever
   visible past the card's edge. */
const RING_SCALE = 0.14;

const FPS = 30;

type Ring = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
};

const rings = new Map<HTMLCanvasElement, Ring>();

let source: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let uRes: WebGLUniformLocation | null = null;
let uTime: WebGLUniformLocation | null = null;
let raf = 0;
let start = 0;
let lastFrame = 0;
/* Set once the context is known to be unavailable (no WebGL, blocked
   driver, budget already spent). Rings then keep their CSS fallback and
   nothing retries every mount. */
let unavailable = false;

function teardown() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (gl) gl.getExtension("WEBGL_lose_context")?.loseContext();
  gl = null;
  uRes = null;
  uTime = null;
  source = null;
  lastFrame = 0;
}

function setup(): boolean {
  if (unavailable) return false;
  if (gl) return true;

  const canvas = document.createElement("canvas");
  const context =
    (canvas.getContext("webgl", { antialias: false, alpha: false, depth: false }) as WebGLRenderingContext | null) ??
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

  if (!context) {
    unavailable = true;
    return false;
  }

  const uniforms = initLiquidProgram(context, OPTIONS, STOPS);
  if (!uniforms) {
    context.getExtension("WEBGL_lose_context")?.loseContext();
    unavailable = true;
    return false;
  }

  source = canvas;
  gl = context;
  uRes = uniforms.uRes;
  uTime = uniforms.uTime;
  start = performance.now();
  return true;
}

function resizeSource() {
  if (!gl || !source) return;
  const w = Math.max(1, Math.round(window.innerWidth * SOURCE_SCALE));
  const h = Math.max(1, Math.round(window.innerHeight * SOURCE_SCALE));
  if (source.width === w && source.height === h) return;
  source.width = w;
  source.height = h;
  gl.viewport(0, 0, w, h);
  gl.uniform2f(uRes, w, h);
}

function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (document.hidden) return;
  if (now - lastFrame < 1000 / FPS) return;
  lastFrame = now;
  if (!gl || !source) return;

  resizeSource();
  gl.uniform1f(uTime, (now - start) / 1000);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  /* The copies below MUST stay in this callback, right after the draw.
     The WebGL drawing buffer is cleared once the browser composites the
     frame, so reading it from a later task (a timeout, a scroll
     handler, an IntersectionObserver callback) would copy an empty
     buffer and every ring would go blank. */

  /* Read every ring's geometry first, then draw — interleaving
     getBoundingClientRect() with canvas writes would force a layout per
     card instead of one for the whole grid. */
  const visible: { ring: Ring; rect: DOMRect }[] = [];
  for (const ring of rings.values()) {
    const rect = ring.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
    visible.push({ ring, rect });
  }

  for (const { ring, rect } of visible) {
    const w = Math.max(4, Math.round(rect.width * RING_SCALE));
    const h = Math.max(4, Math.round(rect.height * RING_SCALE));
    if (ring.canvas.width !== w || ring.canvas.height !== h) {
      ring.canvas.width = w;
      ring.canvas.height = h;
    }
    // A ring hanging off the edge of the viewport samples partly out of
    // bounds, and drawImage leaves those pixels untouched — clear first
    // so it's last frame's colours that don't survive there, and the
    // element's own CSS gradient shows through instead.
    ring.ctx?.clearRect(0, 0, w, h);
    // The slice of the shared field directly behind this ring, which is
    // what keeps the flow continuous across the grid.
    ring.ctx?.drawImage(
      source,
      rect.left * SOURCE_SCALE,
      rect.top * SOURCE_SCALE,
      rect.width * SOURCE_SCALE,
      rect.height * SOURCE_SCALE,
      0,
      0,
      w,
      h,
    );
  }
}

/**
 * Register a ring canvas. Returns an unsubscribe function; when the last
 * ring unsubscribes the shared context is freed.
 *
 * Returns false if the field is unavailable, so the caller can leave its
 * CSS fallback showing.
 */
export function subscribeLiquidRing(canvas: HTMLCanvasElement): (() => void) | false {
  if (!setup()) return false;

  rings.set(canvas, { canvas, ctx: canvas.getContext("2d") });
  if (!raf) raf = requestAnimationFrame(frame);

  return () => {
    rings.delete(canvas);
    if (rings.size === 0) teardown();
  };
}
