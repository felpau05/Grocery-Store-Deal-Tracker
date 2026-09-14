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
 *
 * It stands aside rather than sitting on things: the corner is
 * hit-tested against whatever is under it, and the widget fades down to
 * a small pull-tab whenever that turns out to be a link, a price or an
 * input (see the yield effect below). The visitor can pull it back out
 * over content whenever they want it there.
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

/* The widget's own footprint, in the corner, as CSS pixels — w-[150px]
   plus bottom-5/right-5 (20px), and a height of the 130px melon panel
   plus its "Slice me →" label and borders. Written out rather than
   measured off the live node because the yield check below has to ask
   "would the EXPANDED widget be covering something?" even while it is
   retracted and occupying none of that space. Keep in step with the
   classes on the wrapper. */
const BOX_W = 150;
const BOX_H = 160;
const BOX_EDGE = 20;

/* What counts as content worth getting out of the way of: anything the
   visitor can click, read a price off, or type into. Deliberately not
   "any element" — every page has a <body> and a background layer under
   that corner, and yielding to those would mean never showing at all. */
const CONTENT_SELECTOR = "a, button, input, select, textarea, [data-price-tag]";

export default function MelonCorner() {
  // Deferred so the melon never competes with the deals for first paint —
  // the iframe boots a WebGL context and builds several canvas textures.
  const [mounted, setMounted] = useState(false);
  // Lives in the root layout, so this survives client-side navigation for
  // the rest of the session — only a full reload resets it back to shown.
  const [hidden, setHidden] = useState(false);
  // True while real content sits under the corner (see the effect
  // below). The toy is a deliberate bit of personality and stays — but
  // it was parked on top of deal cards and their prices on every page,
  // permanently, which is a different thing from being playful.
  const [covering, setCovering] = useState(false);
  // The visitor pulled it back out while it was covering something.
  // That's an explicit "I want the melon here", so it outranks the
  // automatic yield until they dismiss it with "−" again.
  const [pinned, setPinned] = useState(false);
  // "/" is the only route carrying MelonHero, so it's the only one with
  // an intro to stay out of the way of.
  const pathname = usePathname();
  const delay = pathname === "/" ? DELAY_MS_HERO : DELAY_MS;

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

  // Does the corner currently sit on top of something that matters?
  //
  // Hit-testing the actual page rather than guessing from scroll
  // position or route: "/" puts a full-bleed grid of deal cards under
  // this corner the moment you scroll off the hero, while /settings and
  // /list centre their content in a column that never reaches it. A
  // scroll threshold would retract the melon on all three; asking the
  // document what's underneath retracts it only where it would really
  // be in the way.
  //
  // elementsFromPoint (plural) rather than elementFromPoint: this widget
  // is `fixed` and painted on top, so the singular version would just
  // report the melon back. Skipping everything inside our own subtree
  // and taking the next hit is what's actually underneath it — and it
  // works the same whether we're currently expanded or retracted.
  useEffect(() => {
    // Nothing to yield for below `md:` — the widget doesn't render there
    // at all (see the className), so hit-testing the corner on every
    // scroll frame would be pure cost on exactly the devices that can
    // least afford a forced layout. `mounted` is already false on a
    // narrow screen and flips when the media query changes, so this
    // effect re-runs and attaches/detaches along with it.
    if (!window.matchMedia(WIDE).matches) return;

    const check = () => {
      const right = window.innerWidth - BOX_EDGE;
      const bottom = window.innerHeight - BOX_EDGE;
      const left = right - BOX_W;
      const top = bottom - BOX_H;
      // Corners inset a little, plus the centre — five samples is enough
      // to catch a card edge clipping the box without turning a scroll
      // handler into a hit-test loop.
      const points: [number, number][] = [
        [left + 6, top + 6],
        [right - 6, top + 6],
        [left + 6, bottom - 6],
        [right - 6, bottom - 6],
        [(left + right) / 2, (top + bottom) / 2],
      ];
      const hit = points.some(([x, y]) =>
        document
          .elementsFromPoint(x, y)
          .some(
            (el) =>
              !el.closest("[data-melon-corner]") && !!el.closest(CONTENT_SELECTOR),
          ),
      );
      setCovering(hit);
    };

    // Leading + trailing throttle rather than one per animation frame:
    // five hit tests a frame for the whole length of a scroll is a lot of
    // work for a decoration, and the trailing call is what guarantees the
    // final resting position is the one that decides.
    const THROTTLE_MS = 150;
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(trailing);
      const now = performance.now();
      if (now - last >= THROTTLE_MS) {
        last = now;
        check();
      } else {
        trailing = setTimeout(() => {
          last = performance.now();
          check();
        }, THROTTLE_MS);
      }
    };

    // Once on mount and again shortly after: the deals grid and the
    // account banners above it arrive from their own fetches, so the
    // first measurement can land on a page that is still a skeleton.
    check();
    const settle = setTimeout(check, 1200);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      clearTimeout(trailing);
      clearTimeout(settle);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
    // Re-measured per route (a client-side navigation swaps everything
    // under the corner without firing a scroll event) and whenever the
    // iframe mounts, which is the point the widget has its real size.
  }, [pathname, mounted]);

  // Retracted, but NOT unmounted, when yielding: rebooting
  // watermelon-mini.html is the several-thousand-path synchronous burst
  // described above, and doing that every time the visitor scrolls a
  // deal card under the corner would cost far more than it saves. A
  // manual "−" still unmounts it — that one is a deliberate, once-per-
  // session "away with you", not a scroll position.
  const yielding = covering && !pinned && !hidden;

  if (hidden) {
    return (
      <button
        type="button"
        data-melon-corner
        /* Asking for it back while it's standing aside is an explicit
           choice — pin it so the yield check doesn't immediately put it
           away again. */
        onClick={() => {
          setHidden(false);
          setPinned(true);
        }}
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
    <>
      {/* The same pull-tab the manual "−" leaves behind, so standing
          aside and being dismissed resolve to one identical affordance
          rather than two competing ones — and the toy is never more than
          one click away from any page. */}
      {yielding && (
        <button
          type="button"
          data-melon-corner
          onClick={() => setPinned(true)}
          title="Show the watermelon toy"
          aria-label="Show the watermelon toy"
          className="hidden md:flex fixed bottom-5 right-5 z-20 w-10 h-10 items-center justify-center border-2 border-[var(--color-slice-outline)] bg-[var(--color-slice-panel-mid)] shadow-[3px_3px_0_var(--color-shadow)] font-mono font-bold text-[20px] leading-none text-[var(--color-slice-ink)] hover:-translate-y-0.5 transition-transform"
        >
          +
        </button>
      )}

    {/* Fixed positioning lives on this wrapper rather than the <a> below,
       so the hide button can sit beside the link as a sibling — a
       <button> nested inside an <a> is invalid HTML and would also fire
       the link's navigation on every click. */}
    <div
      /* `inert` while yielding, not just pointer-events-none: at zero
         opacity the link and the hide button are still perfectly
         tabbable otherwise, and a keyboard visitor would land on an
         invisible "Play with the 3D watermelon". */
      inert={yielding}
      data-melon-corner
      /* Hidden on small screens: it would sit on top of the cart drawer
         and the toast stack, both of which matter more than a toy.
         Faded rather than moved off the edge — a `fixed` box translated
         past the right edge can still widen the scrollable area in some
         browsers, and this is a decoration, not something worth risking
         a stray horizontal scrollbar for. */
      className={`hidden md:block fixed bottom-5 right-5 z-20 w-[150px] origin-bottom-right transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        yielding ? "opacity-0 scale-90 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      <button
        type="button"
        /* Dismissing also drops the pin: "−" is the visitor saying they
           don't want it there at all, so bringing it back later should
           start from the automatic behaviour again, not from whatever
           override was set before. */
        onClick={() => {
          setHidden(true);
          setPinned(false);
        }}
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
    </>
  );
}
