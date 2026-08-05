"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A slowly spinning 3D watermelon parked in the bottom-right corner —
 * the visible teaser for the full toy at /watermelon.html.
 *
 * It's an <iframe> rather than a React component because the scene (and
 * all its procedurally-generated canvas textures) already exists as a
 * standalone page. Embedding it reuses that verbatim and keeps three.js
 * out of the app bundle entirely — the corner preview costs nothing until
 * the browser actually loads the frame.
 *
 * The iframe has pointer-events disabled inside it, so the whole box acts
 * as one link rather than swallowing clicks into the 3D canvas.
 */
/* Matches the `md:` in the className below. The two have to agree: this
   decides whether the iframe LOADS, the class decides whether it shows. */
const WIDE = "(min-width: 768px)";

/* How long to sit out before booting the scene.
 *
 * Booting it is not cheap and not interruptible: watermelon-mini.html
 * generates its rind procedurally — ~1300 blob() calls of 3-5 ellipses
 * each, 2600 speckle arcs, 90 gradient fills, about 8000 filled paths —
 * in one synchronous burst. A same-origin iframe shares this page's main
 * thread, so that burst is OUR dropped frames, not just its own.
 *
 * On the landing page that has to clear MelonHero's intro, where the
 * melon arrives in 8 pieces and knits itself together (INTRO_SECS = 2.8
 * in watermelon-hero.html, starting after its own 600ms mount and load).
 * Firing at 900ms put the burst right in the middle of it, which is
 * exactly when the page can least afford to lose frames. */
const DELAY_MS = 900;
const DELAY_MS_HERO = 4500;

export default function MelonCorner() {
  // Deferred so the melon never competes with the deals for first paint —
  // the iframe boots a WebGL context and builds several canvas textures.
  const [mounted, setMounted] = useState(false);
  // Lives in the root layout, so this survives client-side navigation for
  // the rest of the session — only a full reload resets it back to shown.
  const [hidden, setHidden] = useState(false);
  // "/" is the only route carrying MelonHero, so it's the only one with
  // an intro to stay out of the way of.
  const delay = usePathname() === "/" ? DELAY_MS_HERO : DELAY_MS;

  useEffect(() => {
    // `hidden md:block` alone is not enough to keep this off a phone: a
    // display:none iframe still loads its src, boots three.js, allocates
    // its textures and takes one of the browser's ~8-16 WebGL contexts.
    // Small screens were paying the full cost of a toy they can't see,
    // which is exactly backwards — they're the constrained devices.
    //
    // Re-checked on change rather than once, so rotating a tablet or
    // dragging a desktop window narrow settles on the right answer
    // instead of keeping whatever was true at first paint.
    const mq = window.matchMedia(WIDE);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      clearTimeout(timer);
      if (mq.matches) {
        timer = setTimeout(() => setMounted(true), delay);
      } else {
        // Unmounts the iframe, which frees its context and textures.
        setMounted(false);
      }
    };

    sync();
    mq.addEventListener("change", sync);
    return () => {
      clearTimeout(timer);
      mq.removeEventListener("change", sync);
    };
    // `delay` is route-derived, so navigating to or away from "/" re-arms
    // the timer with the right one rather than keeping the first value.
  }, [delay]);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        title="Show the watermelon toy"
        aria-label="Show the watermelon toy"
        /* Same corner, same hidden-on-small-screens rule as the full
           widget below — just a pull-tab back to it. */
        className="hidden md:flex fixed bottom-5 right-5 z-20 w-10 h-10 items-center justify-center border-2 border-[var(--color-slice-outline)] bg-[var(--color-slice-panel-mid)] shadow-[3px_3px_0_var(--color-shadow)] font-mono font-bold text-[20px] leading-none text-[var(--color-slice-ink)] hover:-translate-y-0.5 transition-transform"
      >
        +
      </button>
    );
  }

  return (
    /* Fixed positioning lives on this wrapper rather than the <a> below,
       so the hide button can sit beside the link as a sibling — a
       <button> nested inside an <a> is invalid HTML and would also fire
       the link's navigation on every click. */
    <div
      /* Hidden on small screens: it would sit on top of the cart drawer
         and the toast stack, both of which matter more than a toy. */
      className="hidden md:block fixed bottom-5 right-5 z-20 w-[150px]"
    >
      <button
        type="button"
        onClick={() => setHidden(true)}
        title="Hide the watermelon toy"
        aria-label="Hide the watermelon toy"
        className="absolute -top-3 -right-3 z-10 w-8 h-8 flex items-center justify-center border-2 border-[var(--color-slice-outline)] bg-[var(--color-slice-panel-mid)] shadow-[2px_2px_0_var(--color-shadow)] font-mono font-bold text-[18px] leading-none text-[var(--color-slice-ink)] hover:-translate-y-0.5 transition-transform"
      >
        −
      </button>
      <a
        href="/watermelon.html"
        title="Play with the 3D watermelon"
        aria-label="Play with the 3D watermelon"
        className="group block w-full"
      >
        <span className="block relative border-2 border-[var(--color-slice-outline)] bg-[var(--color-slice-panel-via)] shadow-[4px_4px_0_var(--color-shadow)] overflow-hidden transition-all group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-[7px_7px_0_var(--color-shadow)]">
          {/* The warm panel the melon spins in — the four stops are
              --color-slice-panel-* in globals.css. It's the fallback
              showing through before the iframe mounts, too, which is why
              it isn't just left to the scene's own background. */}
          <span className="block h-[130px] bg-[radial-gradient(ellipse_at_50%_30%,var(--color-slice-panel-from)_0%,var(--color-slice-panel-via)_35%,var(--color-slice-panel-mid)_70%,var(--color-slice-panel-to)_100%)]">
            {mounted && (
              <iframe
                src="/watermelon-mini.html"
                title="Spinning watermelon"
                tabIndex={-1}
                scrolling="no"
                className="w-full h-full border-0 pointer-events-none"
              />
            )}
          </span>

          {/* Colours live in globals.css as --color-slice-* — tune them
              there. Referenced through bracket syntax rather than named
              utilities for the reason SiteHeader documents for
              --color-logo-text: a utility generated from a brand-new
              @theme token doesn't reliably appear in dev without a full
              server restart, while var() is read directly and updates the
              moment you save. */}
          <span className="block border-t-2 border-[var(--color-slice-outline)] bg-[radial-gradient(circle_at_50%_50%,var(--color-slice-bg-from)_0%,var(--color-slice-bg-via)_45%,var(--color-slice-bg-to)_100%)] px-2 py-1 font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-[var(--color-slice-ink)] text-center">
            Slice me →
          </span>
        </span>
      </a>
    </div>
  );
}
