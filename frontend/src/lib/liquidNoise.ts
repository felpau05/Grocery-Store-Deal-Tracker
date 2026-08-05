/**
 * Shared GLSL for the app's flowing-gradient surfaces (the trip-planner
 * intro, the site header). Only the noise field lives here — each
 * surface writes its own main(), because they want genuinely different
 * things out of it: the intro marbles five colours through a deep
 * double warp, the header wants shallow rind mottling across a strip
 * that's 20x wider than it is tall.
 *
 * Kept in one place because this is the part that's easy to get subtly
 * wrong and hard to notice: the hash constants and the 2.03 lacunarity
 * (deliberately not 2.0, which lines octaves up on the integer lattice
 * and prints a visible grid into the result).
 */
export const NOISE_GLSL = `
vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

/* Gradient noise, roughly -1..1. */
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}
`;

/** fbm with an explicit octave count, so thin surfaces can buy fewer. */
export function fbmGLSL(octaves: number): string {
  return `
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < ${octaves}; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
`;
}

/* ── The three-stop liquid program ──────────────────────────────────
   The shader every surface except TripIntro runs (it keeps its own —
   five stops and an interactive cursor wake make it a different
   shader). Kept here rather than in a component because two very
   different consumers need it: LiquidSurface, which paints a container
   directly, and lib/liquidField, which renders one offscreen field that
   many small canvases copy slices of. */

export type LiquidOptions = {
  /** fbm octaves — the dominant per-pixel cost. */
  octaves: number;
  /** Domain-warp passes. Two is deep marbling; one is a softer drift at
   *  roughly half the fragment cost. */
  warps: 1 | 2;
  /** Pattern size: bigger = smaller, busier folds. */
  scale: number;
  /** Drift speed. */
  speed: number;
  /** Strength of the white highlight where the warp folds hardest. */
  highlight: number;
};

export const LIQUID_VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/** GLSL has no int→float coercion, so every literal needs a decimal. */
const glf = (n: number) => n.toFixed(3);

export function buildLiquidFrag({ octaves, warps, scale, speed, highlight }: LiquidOptions): string {
  /* Two warps chain: the second pass reads the field the first one
     already dragged, which is what folds colours into each other rather
     than merely displacing them. One pass is the cheap version. */
  const warp =
    warps === 2
      ? `vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.3),
                       fbm(p + 3.0 * q + vec2(8.3, 2.8) + t * 1.1));
         float f = fbm(p + 3.0 * r);`
      : `float f = fbm(p + 2.6 * q);`;

  return `
/* highp is not optional here, however cheap mediump looks. The hash
   below computes fract(sin(p) * 43758.5453), and desktop GPUs quietly
   promote mediump to 32-bit so it works anyway. Apple's GPUs do not —
   mediump there is a real 16-bit float, where a value of ~43758 has a
   spacing between representable numbers of about 32. Taking fract() of
   that returns the same handful of values everywhere, so the noise
   collapses into flat blocks: fine on every desktop it was written on,
   visibly broken on iPhone. */
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_from;
uniform vec3  u_via;
uniform vec3  u_to;

${NOISE_GLSL}
${fbmGLSL(octaves)}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;

  /* Scaling x by the real aspect keeps the pattern round instead of
     smeared horizontally on wide, short surfaces. */
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * ${glf(scale)};

  float t = u_time * ${glf(speed)};

  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t * 0.8));
  ${warp}

  /* fbm lands in roughly -0.6..0.6, so it has to be stretched to a full
     0..1 before driving a palette — used raw, every stop selector parks
     in its own mid-range and the last mix simply wins the whole frame. */
  float n = clamp(f * 1.9 + 0.5, 0.0, 1.0);

  /* Deep through light, as overlapping smoothstep bands rather than one
     linear ramp — the overlaps are what blend the seams into each
     other. */
  vec3 col = mix(u_to, u_via, smoothstep(0.06, 0.52, n));
  col = mix(col, u_from, smoothstep(0.44, 0.88, n));

  /* A highlight only where the warp folds hardest, so the surface reads
     as liquid depth instead of a flat wash. The window is tight to |q|'s
     real range (~0..0.36) — thresholds any higher never fire at all,
     which is a silent no-op rather than a visible bug. */
  col = mix(col, vec3(1.0), smoothstep(0.13, 0.34, length(q)) * ${glf(highlight)});

  gl_FragColor = vec4(col, 1.0);
}
`;
}

/** The three colour stops, as :root custom properties. */
export type LiquidStops = {
  /** The crests of the folds — the lightest stop. */
  from: LiquidStop;
  via: LiquidStop;
  /** The troughs — the deepest stop. */
  to: LiquidStop;
};

export type LiquidStop = {
  /** A :root custom property holding a plain 3- or 6-digit hex literal.
   *  Parsed into floats at startup, so a var() chain or any colour
   *  function won't resolve and falls back to `fallback`. Changes need a
   *  refresh, not just a repaint. */
  varName: string;
  fallback: readonly number[];
};

/**
 * Compile, link and wire up the liquid program on an existing context:
 * one full-screen triangle (cheaper than a quad, and no seam), the
 * palette read from :root, and the two uniforms the caller drives.
 *
 * Returns null if anything failed — the caller is responsible for
 * freeing the context in that case, since only it knows whether the
 * canvas is worth keeping.
 */
export function initLiquidProgram(
  gl: WebGLRenderingContext,
  options: LiquidOptions,
  stops: LiquidStops,
): { uRes: WebGLUniformLocation | null; uTime: WebGLUniformLocation | null } | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, LIQUID_VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, buildLiquidFrag(options));
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

  gl.uniform3fv(gl.getUniformLocation(program, "u_from"), readHexVar(stops.from.varName, stops.from.fallback));
  gl.uniform3fv(gl.getUniformLocation(program, "u_via"), readHexVar(stops.via.varName, stops.via.fallback));
  gl.uniform3fv(gl.getUniformLocation(program, "u_to"), readHexVar(stops.to.varName, stops.to.fallback));

  return {
    uRes: gl.getUniformLocation(program, "u_res"),
    uTime: gl.getUniformLocation(program, "u_time"),
  };
}

/** Read a plain numeric token off :root (e.g. an opacity, "0.42"). */
export function readNumberVar(varName: string, fallback: number): number {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName));
  return Number.isFinite(n) ? n : fallback;
}

/** Compile a shader, returning null instead of throwing on failure. */
export function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Read a hex colour token off :root for feeding to a shader as floats.
 * Must be plain 3- or 6-digit hex — a var() chain or any colour
 * function won't parse, and falls back to the caller's default.
 */
export function readHexVar(varName: string, fallback: readonly number[]): number[] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)?.[1];
  if (!hex) return [...fallback];
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
