/**
 * Canvas lifecycle + fullscreen-triangle shader setup + capped RAF loop —
 * the scaffolding every raw-WebGL liquid surface in this app hand-rolled
 * a copy of (HeaderLiquid, PageLiquid, TripIntro), each ~60-70 lines of
 * near-identical boilerplate around a genuinely different fragment
 * shader. `LiquidSurface`/`lib/liquidField` don't need this: they run
 * the one shared palette shader via `initLiquidProgram` in
 * liquidNoise.ts, which already bundles the compile/link/buffer/attrib
 * step for THAT specific shader. This is the same idea generalized to
 * an arbitrary shader — LiquidSurface still uses its own
 * `initLiquidProgram` call, but switches to `createManagedCanvas`/
 * `startCappedLoop` here for the canvas-lifecycle/RAF half, so that
 * part of the scaffolding is shared everywhere instead of four of five
 * places.
 *
 * Deliberately three separate exports, not one mega-hook: the real
 * duplication was at this granularity (a canvas-creation block, a
 * compile block, a RAF-loop block), and callers combine differing
 * subsets — LiquidSurface skips compileFullscreenProgram entirely,
 * HeaderLiquid's RAF loop reads an external `active` prop that
 * PageLiquid has no equivalent of. Each piece needs to be freely
 * composable rather than parameterized into one shape that fits all
 * four uses.
 */

import { compileShader } from "./liquidNoise";

/**
 * Creates a canvas, appends it into `container`, and hands back a
 * live WebGL context — or null if nothing usable was obtained, canvas
 * already removed, caller has nothing left to clean up.
 *
 * `getContext` is a callback, not context-attribute options, because
 * callers don't all want the same context-acquisition strategy:
 * HeaderLiquid/PageLiquid make one `getContext("webgl", {...})` call;
 * LiquidSurface and TripIntro fall back to `"experimental-webgl"` if
 * that fails (older/blocklisted-driver support neither of the other
 * two ever needed). Letting each caller supply its own strategy here
 * keeps that real difference intact instead of forcing one shape.
 *
 * The canvas is built with document.createElement, not returned for
 * the caller to render in JSX: the cleanup this pairs with
 * (destroy() calling loseContext()) permanently poisons the DOM
 * element it's called on, and Strict Mode's mount/unmount/remount
 * would otherwise hand a remount that same dead element, where
 * getContext then fails. A canvas built fresh in the caller's effect
 * (which is where this must be invoked from) is fresh on every mount.
 */
export function createManagedCanvas(
  container: HTMLElement,
  className: string,
  getContext: (canvas: HTMLCanvasElement) => WebGLRenderingContext | null,
): { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; destroy: () => void } | null {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const gl = getContext(canvas);
  if (!gl) {
    canvas.remove();
    return null; // caller's CSS fallback stands in
  }

  // Every exit past this point has to free the context as well as the
  // element — a leaked context is one of the ~8-16 the browser will
  // ever hand out, and these components mount on every route/navigation.
  const destroy = () => {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  };

  return { canvas, gl, destroy };
}

/**
 * Compiles, links, and wires up one full-screen triangle — the
 * compile/link/program/buffer/attrib block every bespoke-shader
 * surface (HeaderLiquid, PageLiquid, TripIntro) hand-rolled a copy of,
 * each already importing `compileShader` from liquidNoise.ts but
 * redoing the rest by hand, since `initLiquidProgram` there is
 * hardwired to the shared palette shader's specific u_from/u_via/u_to
 * uniforms. Returns null on any compile/link failure; the caller
 * still does its own `gl.getUniformLocation` calls afterward — this
 * only gets a drawable program onto the GPU, it doesn't know what
 * uniforms any particular shader declares.
 *
 * One full-screen TRIANGLE, not a quad: cheaper, and no seam down the
 * middle the way two triangles making a quad would have.
 */
export function compileFullscreenProgram(
  gl: WebGLRenderingContext,
  vert: string,
  frag: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  return program;
}

/**
 * The RAF "reschedule-then-bail" skeleton duplicated in HeaderLiquid,
 * PageLiquid, and LiquidSurface (TripIntro ran its own copy of this
 * shape too, uncapped — see fps below).
 *
 * `fps` is required, not defaulted to 30: TripIntro's loop has no
 * frame cap at all today, an open question (is that deliberate for a
 * one-time landing hero, or was a cap simply forgotten?) that this
 * refactor isn't resolving — passing 0 here keeps that exact existing
 * behaviour explicit at the call site rather than silently inheriting
 * whatever this function's default happened to be. 0 means uncapped:
 * `minFrameMs` becomes 0, so `now - lastFrame < 0` is never true once
 * time has moved forward at all, and every frame draws — the same
 * `fps > 0 ? 1000/fps : 0` LiquidSurface's own `fps` prop already
 * uses, kept identical here rather than reinvented.
 *
 * `shouldSkip` is a callback, not a flag, because the reasons to skip
 * a frame differ per caller: HeaderLiquid checks an externally-driven
 * `active` prop (via a ref, read fresh each frame) plus `document.hidden`;
 * PageLiquid checks only `document.hidden`; TripIntro (uncapped, so
 * there's no frame-cap step to worry about disturbing) checks
 * `document.hidden` plus its own canvas being scrolled off screen. None
 * of that belongs inside a shared loop — it belongs to whatever each
 * surface actually needs to decide "am I worth drawing right now."
 *
 * Ordering contract, worth knowing before adding a new expensive check:
 * `shouldSkip()` runs on every vsync, BEFORE the fps throttle below it —
 * so it should only ever hold cheap tests. LiquidSurface's own
 * off-screen check (`getBoundingClientRect`, which forces a layout) is
 * deliberately NOT in its `shouldSkip` for exactly this reason; it's
 * the first line of its `draw` callback instead, so it only runs on
 * frames that already passed both `document.hidden` and the frame-cap
 * throttle, same order the original hand-rolled loop had.
 */
export function startCappedLoop(
  fps: number,
  shouldSkip: () => boolean,
  draw: (now: number) => void,
): { stop: () => void } {
  const minFrameMs = fps > 0 ? 1000 / fps : 0;
  let lastFrame = 0;
  let raf = 0;

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (shouldSkip()) return;
    if (now - lastFrame < minFrameMs) return;
    lastFrame = now;
    draw(now);
  };
  raf = requestAnimationFrame(loop);

  return { stop: () => cancelAnimationFrame(raf) };
}
