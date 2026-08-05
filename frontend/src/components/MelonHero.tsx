"use client";

import { useEffect, useRef, useState } from "react";
import HeroLiquid from "@/components/HeroLiquid";

/**
 * Full-viewport hero with the interactive 3D melon behind the copy.
 *
 * The melon is an <iframe> of /watermelon-hero.html — same reasoning as
 * MelonCorner: the scene and its procedural canvas textures already exist
 * as a standalone page, so embedding reuses it verbatim and keeps three.js
 * out of the app bundle.
 *
 * That page renders transparent, so the background below it is the real
 * one: a HeroLiquid shader over a static CSS gradient of the same three
 * stops. Keeping both here (rather than in the HTML) means the hero
 * stays on-palette with globals.css instead of drifting into its own
 * hardcoded colours.
 */
export default function MelonHero() {
  // Deferred: booting WebGL and generating several 1024px canvas textures
  // shouldn't compete with the deals for first paint.
  const [mounted, setMounted] = useState(false);
  // The scene posts "melon:ready" once it has compiled its shaders and
  // uploaded its textures — i.e. once it can animate without hitching.
  // Until then the iframe is transparent and the gradient below shows
  // through, so the expensive part happens behind a still image instead
  // of behind the intro it would otherwise stutter through.
  const [ready, setReady] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const displaceRef = useRef<SVGFEDisplacementMapElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data === "melon:ready") setReady(true);
    };
    window.addEventListener("message", onMessage);
    // Belt and braces: if the scene never reports in (old cached copy of
    // the HTML, WebGL unavailable, message lost to a race), reveal it
    // anyway rather than leaving the hero permanently empty.
    const failsafe = setTimeout(() => setReady(true), 6000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(failsafe);
    };
  }, []);

  // Park the melon's render loop while the hero is off screen. The scene
  // can't work this out for itself — an IntersectionObserver inside the
  // iframe measures against the iframe's own viewport, where it is
  // always fully visible — so the observation has to happen out here and
  // be posted in.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || !mounted) return;

    const send = (message: "melon:park" | "melon:wake") => {
      frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
    };

    const observer = new IntersectionObserver(
      ([entry]) => send(entry.isIntersecting ? "melon:wake" : "melon:park"),
      // Any sliver on screen counts as visible; the melon is the whole
      // point of this section and must never be caught frozen.
      { threshold: 0 },
    );
    observer.observe(section);

    return () => {
      observer.disconnect();
      // Whatever happens next, don't leave it parked: a route change
      // that unmounts this while scrolled away would otherwise strand a
      // paused scene for the back-navigation to find.
      send("melon:wake");
    };
  }, [mounted]);

  // The heading dissolves into the liquid as you scroll toward the
  // deals — warps, blurs and fades to nothing over DISSOLVE_PX of
  // scroll, then reverses if you scroll back up. Driven straight off
  // scroll position, not a timer, so it's the same "melting away"
  // gesture as pulling a sheet off the page rather than a clip that
  // just happens to play while you scroll.
  //
  // Deliberately NOT wired into HeroLiquid's shader: that would mean
  // rendering the text into the same WebGL scene and warping it through
  // the literal noise field driving the liquid — truer, but a much
  // bigger change to a working shader for a scroll effect that only
  // needs to look right, not be physically identical to the flow. This
  // is an SVG filter instead: feTurbulence draws a fixed (unanimated —
  // no per-frame cost) noise field once, and feDisplacementMap pushes
  // the heading's pixels around by it; only that displacement's
  // strength, plus opacity and a CSS blur, change as you scroll.
  useEffect(() => {
    const section = sectionRef.current;
    const heading = headingRef.current;
    const displace = displaceRef.current;
    if (!section || !heading) return;
    // Scroll-linked distortion is still motion a reduced-motion visitor
    // didn't ask for — leave the heading fully static and readable.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const DISSOLVE_PX = 480; // scroll distance over which it fully dissolves
    const MAX_BLUR_PX = 14;
    const MAX_DISPLACE = 90; // feDisplacementMap `scale` at full dissolve

    let ticking = false;
    const apply = () => {
      ticking = false;
      const t = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / DISSOLVE_PX));
      heading.style.opacity = String(1 - t);
      // Both filter functions in one property: `url(#hero-dissolve)` is
      // the constant reference to the SVG warp above, `blur(...)` the
      // scroll-driven softening — this is the only place that ever
      // writes heading.style.filter (see the h1's own comment for why).
      heading.style.filter = `url(#hero-dissolve) blur(${(t * MAX_BLUR_PX).toFixed(1)}px)`;
      displace?.setAttribute("scale", (t * MAX_DISPLACE).toFixed(1));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };

    apply(); // correct on load if the page opens already scrolled
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // SiteHeader is `fixed` on this page specifically (see SiteHeader.tsx)
    // so it floats over the hero instead of occupying document flow —
    // that's what makes a true full-viewport hero possible here without
    // the header pushing it down.
    //
    // h-dvh, not h-screen: mobile browsers resolve 100vh to the viewport
    // height WITHOUT the address/toolbar chrome, so the hero renders
    // taller than what's actually on screen and the visitor has to
    // scroll further than one screen's worth to clear it. dvh tracks the
    // real, current viewport instead.
    <section ref={sectionRef} className="relative h-dvh min-h-[640px] overflow-hidden border-b-2 border-ink">
      {/* Start three.js downloading now, not in 600ms when the iframe
          mounts and asks for it. React hoists this into <head>, so on a
          cold visit the 600KB is already in cache by the time the scene
          boots — which is most of the difference between a first visit
          and a refresh. Only rendered here, on the one route with a hero
          waiting on it; elsewhere MelonCorner's own delay is slack
          enough to absorb a normal fetch.

          `as="script"` + matching crossOrigin-less same-origin URL, so
          the preload and the iframe's <script> hit the same cache entry
          rather than fetching twice. */}
      <link rel="preload" as="script" href="/vendor/three.r128.min.js" />
      {/* Every stop is a token — edit --color-hero-* in globals.css.
          This static gradient stays underneath the shader at all times as
          its fallback: no WebGL, no context to spare, and the hero is
          still a watermelon wash rather than a blank box. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_25%,var(--color-hero-from)_0%,var(--color-hero-via)_45%,var(--color-hero-to)_100%)]"
      />

      {/* The same flowing gradient as the trip-planner intro, on the
          hero's own three stops. */}
      <HeroLiquid />

      {/* The dissolve heading's filter, defined once and referenced by
          #hero-dissolve below — 0x0 and aria-hidden, it draws nothing
          itself. baseFrequency is low (broad, slow-varying noise) to
          match the liquid's own big soft folds rather than looking like
          television static; numOctaves=2 keeps feTurbulence itself
          cheap to rasterize, since only feDisplacementMap's `scale`
          (set imperatively above) ever needs to move. */}
      <svg aria-hidden className="absolute w-0 h-0">
        <filter id="hero-dissolve">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={2} seed={7} result="noise" />
          <feDisplacementMap ref={displaceRef} in="SourceGraphic" in2="noise" scale={0} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {mounted && (
        <iframe
          ref={frameRef}
          src="/watermelon-hero.html"
          title="Interactive 3D watermelon"
          scrolling="no"
          className={`absolute inset-0 w-full h-full border-0 transition-opacity duration-500 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* pointer-events-none so drags and clicks fall through to the melon;
          the individual controls below re-enable it for themselves. */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6 pointer-events-none">
        {/*<span className="sticker pointer-events-auto text-[11px] bg-hero-eyebrow text-hero-eyebrow-ink mb-5">
          This week&apos;s flyer just dropped
        </span>*/}

        {/* TripIntro's exact treatment (/list) — plain white, one line,
            clamp-sized rather than breakpoint steps, and a soft blurred
            shadow instead of the hard offset block the accent version
            used. `.font-display` already uppercases via globals.css, so
            "Fresh deals near you" reads as caps like "PLAN A TRIP" does
            without the source needing to shout it. */}
        {/* `filter` (and `opacity`) are set imperatively by the scroll
            effect above, never through React's style prop: React
            re-renders this component when `ready` flips true, and if
            `filter` lived in JSX, that re-render would stamp the CSS
            back to whatever the JSX said and silently erase the scroll
            handler's blur(...) — a real bug, not a hypothetical one,
            caught while wiring this up. Leaving `filter` out of the
            style object entirely means React never touches that
            property, so the two update paths can't fight. */}
        <h1
          ref={headingRef}
          className="font-display text-white leading-[0.85] tracking-[-0.02em]
                      text-[clamp(2.75rem,13vw,11rem)] drop-shadow-[0_2px_24px_rgba(0,0,0,0.18)]"
          style={{ willChange: "filter, opacity" }}
        >
          Fresh deals near you
        </h1>

        {/*<p className="text-hero-body font-medium mt-5 max-w-md pointer-events-auto">
          Live prices pulled from every flyer near you — sorted, normalized and
          priced per unit, so you never overpay again.
        </p>*/}


        {/*<span className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-hero-hint/60">
          drag to spin · click to slice
        </span>*/}
      </div>

      {/* The way into the deals is the scroll cue itself, labelled —
          exactly the treatment TripIntro uses on /list, rather than a
          separate button competing with it a few hundred pixels above.
          The whole thing is one link, so the text and the mouse glyph
          are the same target.

          White throughout: `scroll-cue-light` swaps the dipping dot,
          and the outline has to come with it or the dot floats in a
          dark ring. */}
      <a
        href="#deals"
        aria-label="Skip to today's deals"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2
                   font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-white/85
                   hover:text-white transition-colors"
      >
        See today&apos;s deals
        <span
          aria-hidden
          className="scroll-cue scroll-cue-light relative block w-[22px] h-[34px] rounded-xl border-2 border-white/60"
        />
      </a>
    </section>
  );
}
