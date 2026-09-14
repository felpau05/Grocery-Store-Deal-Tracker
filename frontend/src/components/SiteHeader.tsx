"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { CHIP, CHIP_ACTIVE, CHIP_LOOK, CHIP_QUIET } from "@/lib/chip";
import { useCart } from "@/lib/trips";
import CartGlyph from "./CartGlyph";
import HeaderLiquid from "./HeaderLiquid";

/* "Deals" points at /deals, not "/". "/" is the action hub now — hero,
   then four big choices — and the full browsable catalogue lives on its
   own route so landing on the site no longer means landing in a
   2,000-item grid. The melon logo to the left is the way back to "/". */
const TABS = [
  { href: "/deals", label: "Deals" },
  { href: "/list", label: "Plan a shopping trip" },
];

// Routes that open on a full-bleed hero the header floats over — just
// "/" (MelonHero). It needs the header out of document flow so the hero
// starts at the true top of the viewport rather than being pushed down
// by 64px of header. /list was here while it had a banner; without one
// the header has nothing to float over and goes back to `sticky`, in
// flow, like every other route.
const HERO_ROUTES = ["/"];

// Below this scroll depth on a hero page, the header is transparent
// (floating over the hero, logo/nav still fully visible and clickable);
// past it, its background fades in and it behaves like a normal header.
const HERO_REVEAL_PX = 24;

export default function SiteHeader() {
  const pathname = usePathname();
  const { count, openDrawer } = useCart();
  const { user, meta, scrapeStatus } = useAccount();
  const hasHero = HERO_ROUTES.includes(pathname);

  // Only hero pages have something to float over — elsewhere this state
  // never matters. Starts true (transparent) to match the server-rendered
  // guess for a fresh hero-page load; corrected on mount from the real
  // scroll position in case of a reload mid-scroll or back/forward nav.
  const [atHeroTop, setAtHeroTop] = useState(true);

  useEffect(() => {
    if (!hasHero) return;
    const onScroll = () => setAtHeroTop(window.scrollY < HERO_REVEAL_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasHero]);

  // `fixed` only on hero pages: the header has to float OVER the hero
  // without occupying document flow, so MelonHero can begin
  // at y=0. Every other page keeps the original `sticky` —
  // unaffected by any of this. Content (logo, nav, cart) stays visible
  // and clickable either way; only the background/border/blur toggle.
  const transparent = hasHero && atHeroTop;

  /* Frosted glass, not the solid .btn-brut-ink chips used elsewhere —
     the rind reads through them rather than being blocked out. Defined
     in lib/chip so the deals paginator wears the same button, not a
     hand-copied lookalike. */
  const chipQuiet = CHIP_QUIET;
  const chipActive = CHIP_ACTIVE;
  const divider = transparent ? "bg-ink/20" : "bg-paper/35";

  // A signed-in account NEVER falls back to the example area (see
  // page.tsx's isSignedInBlocked) — so the chip must show the account's
  // own postal code (or nothing, if they haven't set one yet), never
  // meta.default_postal_code. Only a true anonymous visitor sees the
  // example chip.
  // (`isExample` used to live here as `!user`; the markup below now
  // branches on `user` itself, since signed-in and signed-out are two
  // different arrangements rather than one with a flag.)
  const hasStores = !!user && user.merchants.length > 0;
  const activePostal = user
    ? user.postal_code ?? (hasStores ? `${user.merchants.length} stores` : null)
    : meta?.default_postal_code ?? null;

  /* ── When to collapse: measured, not guessed ──────────────────────
     This was a `md:` breakpoint, and a breakpoint is the wrong tool for
     it. What decides whether the chips fit is their own width, and that
     changes with the content: an account name is 3 characters or 30, the
     postal chip is "EXAMPLE DATA (K2J4G8)" signed out and "K2J4G8"
     signed in, and the "Scraping…" chip appears and vanishes on its own.
     At 830px — comfortably past `md` — "PLAN A TRIP" was wrapping onto
     two lines and the chips were crowding the wordmark, because 768 was
     a number picked for one particular set of labels.

     So measure. Two thresholds, in the order they bite:

       1. The chips don't fit beside the wordmark → collapse to the
          hamburger.
       2. Even the hamburger doesn't fit beside the wordmark → drop the
          wordmark and keep the melon, which is still a clear tappable
          "home". Narrower than that there is nothing left to give, and
          it degrades the way it always did.

     `fit === null` means "needs measuring": the effect below renders the
     row off-layout (absolute + invisible, so it still has a width),
     reads what everything actually needs, and commits a decision. It
     runs in useLayoutEffect, so it resolves before paint and no one ever
     sees the measuring pass. */
  const barRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const cartRef = useRef<HTMLButtonElement>(null);

  const [fit, setFit] = useState<{ row: boolean; wordmark: boolean } | null>(null);

  // Anything that changes how wide the chips want to be invalidates the
  // measurement. Re-measuring is one off-layout pass, so it is cheap to
  // be liberal here — a stale `fit` is a wrapped header.
  const fitSignature = `${user?.name ?? ""}|${activePostal ?? ""}|${scrapeStatus?.running ?? false}|${pathname}`;
  useLayoutEffect(() => setFit(null), [fitSignature]);

  useLayoutEffect(() => {
    if (fit !== null) return;
    const bar = barRef.current;
    const logo = logoRef.current;
    const mark = markRef.current;
    const menu = menuRef.current;
    const cart = cartRef.current;
    const handle = handleRef.current;
    if (!bar || !logo || !menu || !cart || !handle) return;

    // The bar's own side padding lives on the logo and the cart, so the
    // only slack unaccounted for is the flex gaps between the three or
    // four children — one `gap-x-3` each, plus a little air so the chips
    // never end up literally touching the wordmark.
    const SLACK = 28;
    const avail = bar.clientWidth;
    const logoW = logo.scrollWidth;
    const markW = mark?.scrollWidth ?? 0;
    const cartW = cart.scrollWidth;

    setFit({
      row: logoW + menu.scrollWidth + cartW + SLACK <= avail,
      wordmark:
        logoW + menu.scrollWidth + cartW + SLACK <= avail ||
        logoW + handle.scrollWidth + cartW + SLACK <= avail ||
        // Nothing left to drop but the name itself.
        markW === 0,
    });
  }, [fit]);

  /* Re-measure when the bar's WIDTH changes — and only its width.
     Observing size outright is an infinite loop: committing a decision
     changes the header's HEIGHT (a row bar is h-16, a collapsed one
     h-14, and the measuring pass takes the menu out of flow entirely),
     the observer sees a resize, invalidates, re-measures, and commits
     the same height change again forever. Width is the only input the
     decision actually reads, so it is the only change worth acting on. */
  /* Publish the header's real height as --header-h.

     Anything that has to sit exactly below a sticky header needs this
     number, and hardcoding it has already caused one bug (useHeroSnap
     assumed 64 when the bar is 58 on a phone, leaving 6px of the hero
     showing under it). It is h-14 sm:h-16 plus a 2px border, and taller
     again while the menu panel is open, so the only reliable source is
     the element. /deals reads it to size its own scroll area. */
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--header-h",
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lastWidth = useRef(-1);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => {
      const w = bar.clientWidth;
      if (w === lastWidth.current) return;
      lastWidth.current = w;
      setFit(null);
    });
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const measuring = fit === null;
  // Default to the collapsed arrangement for the server render and the
  // first paint: a hamburger that widens into a row is a smaller visual
  // correction than a row that collapses, and it can never be the one
  // that overflows.
  const asRow = fit?.row ?? false;
  const showWordmark = fit?.wordmark ?? true;

  // The narrow-screen menu. Everything that used to ride in a
  // horizontally-scrolling strip lives behind this instead.
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating closes it — otherwise tapping "Deals" leaves the panel
  // hanging open over the page you just asked for.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Pulse the badge when the count goes up (something was added).
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 450);
      prevCount.current = count;
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  return (
    <header
      ref={headerRef}
      className={`${hasHero ? "fixed" : "sticky"} top-0 left-0 right-0 z-20 overflow-hidden transition-all duration-300 ${
        transparent
          ? "bg-transparent border-b-2 border-transparent"
          : "bg-[radial-gradient(circle,var(--color-header-from),var(--color-header-via),var(--color-header-to))] backdrop-blur-sm border-b-2 border-ink"
      }`}
    >
      {/* Flowing rind over the gradient above, which stays as the
          fallback for no-WebGL and reduced-motion. Fades out with the
          rest of the header on the hero routes. */}
      <HeaderLiquid active={!transparent} />

      {/* Full-bleed: logo and cart sit at the true edges of the viewport,
          same as the deals page's own grid below it.

          Below `md`, the logo, the hamburger and the cart are the only
          things on the bar — home and "the thing you came here to
          check" shouldn't ever require a tap to reach. Everything
          between them (nav, status, postal, sign-in) moves into the
          menu panel, which is the SAME ELEMENT re-flowed rather than a
          second copy of the markup: `flex-wrap` plus `w-full` on that
          container drops it onto its own line under the bar, and
          `md:w-auto md:flex-1` puts it back in the row. One set of
          chips, one set of states, two arrangements.

          This replaces a `.scroll-peek-x` strip that let the chips
          scroll sideways under a fade. It worked, but it hid live
          state — a running scrape or "no postal code" could be parked
          off-screen with only a fade hinting at it — and a horizontal
          drag inside a fixed header is an awkward gesture next to a
          vertically scrolling page. A menu says how many things there
          are and shows all of them at once.

          The panel expands the header rather than floating beneath it,
          which is why none of this needs to escape the `overflow-hidden`
          that clips HeaderLiquid — and the rind simply grows to fill
          the taller header behind it. */}
      <div ref={barRef} className="relative z-10 w-full flex flex-wrap items-center gap-x-2 sm:gap-x-3">
        <Link ref={logoRef} href="/" className="group flex items-center gap-2 pl-4 sm:pl-6 shrink-0 h-14 sm:h-16" title="GroceryDeals — home">
          {/* The wordmark used to vanish at a fixed `sm`, to buy width
              for the old scrolling chip strip. It now stays until it
              genuinely cannot fit — see the measuring pass above — so on
              most phones the site gets to say its name, and it is only
              given up when the hamburger and cart would otherwise be
              pushed into it. Kept mounted while measuring so there is
              something to measure. */}
          <span aria-hidden className="text-2xl leading-none group-hover:-rotate-12 transition-transform">
            🍉
          </span>
          {/* --font-serif and --color-logo-text live in globals.css —
              tune them there without touching --font-display or
              --color-ink, which the rest of the header still uses.
              Referenced via arbitrary-value brackets (not a named
              text-logo-text/font-serif utility): named utilities
              generated from a *brand-new* @theme token don't reliably
              show up in dev without a full server restart, while
              bracket syntax reads the variable directly and always
              updates immediately — same reason shadow-[...] classes
              elsewhere in this app never have that problem. */}
          <span
            ref={markRef}
            className={`text-[17px] sm:text-[22px] leading-none font-bold text-[var(--color-logo-text)] [font-family:var(--font-serif)] whitespace-nowrap ${
              showWordmark || measuring ? "" : "hidden"
            }`}
          >
            GroceryDeals
          </span>
        </Link>

        {/* One element, three states.

            ROW — it sits in the bar and `flex-1` pushes the cart to the
            right edge. PANEL — `order-last w-full` drops it onto its own
            line under the bar, stacked, and it expands the header rather
            than floating over the page (which is why none of this has to
            escape the `overflow-hidden` that clips HeaderLiquid).
            MEASURING — laid out as a row but `absolute invisible`, so it
            still reports a natural width while taking up no space and
            showing nothing. `inert` keeps it out of the tab order for
            the sub-frame it exists in that state. */}
        <div
          ref={menuRef}
          id="site-menu"
          inert={measuring || undefined}
          onClick={() => setMenuOpen(false)}
          className={
            measuring
              ? "absolute invisible pointer-events-none whitespace-nowrap flex items-center gap-1.5 sm:gap-2"
              : asRow
              ? "order-none w-auto flex-1 h-16 min-w-0 justify-end flex items-center gap-1.5 sm:gap-2"
              : `order-last w-full min-w-0 flex-col items-start gap-2 px-4 pb-4 pt-3 border-t border-paper/20 ${
                  menuOpen ? "flex" : "hidden"
                }`
          }
        >
            <nav className="flex items-center gap-1.5 sm:gap-2">
              {TABS.map((tab) => {
                /* Every tab href is a real path segment now, so the
                   old `tab.href === "/" ? pathname === "/"` special case
                   is gone — it existed only because "/" is a prefix of
                   every route and startsWith would have lit the Deals
                   tab up on every page. */
                const active = pathname.startsWith(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`${CHIP} uppercase tracking-[0.1em] ${active ? chipActive : chipQuiet}`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>

            {/* Divider between navigation and everything account-related
                (status, location, sign-in). Vertical between two groups
                in a row; horizontal between two groups in the stacked
                panel, where a 1px column 24px tall would read as a
                rendering artefact. */}
            <span aria-hidden className={`shrink-0 w-px h-6 max-md:w-full max-md:h-px ${divider}`} />

            {/* Scraping indicator — visible on every page while an
                on-demand scrape runs for the signed-in user's area. */}
            {scrapeStatus?.running && (
              <Link
                href="/settings"
                title={`Gathering flyers for ${scrapeStatus.postal_code ?? "your area"}…`}
                className={`${CHIP} flex items-center gap-1.5 shrink-0 ${chipActive} animate-pulse`}
              >
                <span aria-hidden>⟳</span>
                <span>Scraping…</span>
              </Link>
            )}

            {/* Signed in, this is ONE control: the two chips it replaces
                both pointed at /settings, so they were two rims and two
                tap targets for one destination. It reads as one fact —
                who you are, then where you're shopping.

                Signed OUT they stay two, and deliberately. "Sign in" is
                the call to action and the example-data notice is a
                statement about the data on screen; folding a CTA into a
                status readout makes the button the smaller half of
                something you're meant to click. They also no longer
                share a destination once signed out — one is the way in,
                the other explains what you're looking at until you take
                it. */}
            {user ? (
              <Link
                href="/settings"
                className={`${CHIP} flex items-center gap-1.5 shrink-0 ${
                  pathname.startsWith("/settings") ? chipActive : chipQuiet
                }`}
                title={`${user.name} · ${user.postal_code ?? "no postal code"} — change your area and stores`}
              >
                <span aria-hidden>⌂</span>
                <span>{user.name}</span>
                <span aria-hidden className="opacity-45 font-normal">|</span>
                <span aria-hidden>📍</span>
                <span>{activePostal ?? "Set postal code"}</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={`${CHIP} flex items-center gap-1.5 shrink-0 ${
                    pathname.startsWith("/login") ? chipActive : chipQuiet
                  }`}
                  title="Sign in to set your stores"
                >
                  <span aria-hidden>⌂</span>
                  <span>Sign in</span>
                </Link>
                {activePostal && (
                  <Link
                    href="/login"
                    title="Showing example-area deals — sign in to set your own postal code"
                    className={`${CHIP} flex items-center gap-1.5 shrink-0 ${chipQuiet}`}
                  >
                    <span aria-hidden>📍</span>
                    {/* The area is the parenthetical, not the headline:
                        what matters to someone who hasn't signed in is
                        that none of this is their data yet. It used to
                        lead with the postal code and trail a small
                        "example", which read as "here are your deals"
                        with a footnote. */}
                    <span className="uppercase tracking-[0.06em]">Example data</span>
                    <span className="opacity-70">({activePostal})</span>
                  </Link>
                )}
              </>
            )}
        </div>

        {/* The handle. `ml-auto` is what pins it and the cart to the
            right edge while the menu is on its own line; in row mode it
            is gone and the menu's own `flex-1` does that job. Rendered
            (invisibly) during the measuring pass too, since one of the
            two thresholds is "does the hamburger itself still fit". */}
        <button
          ref={handleRef}
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className={`${CHIP_LOOK} ml-auto shrink-0 p-1.5 ${chipQuiet} ${
            measuring ? "invisible" : asRow ? "hidden" : ""
          }`}
        >
          {/* Three rules that become an X — drawn rather than typed so
              it animates, and so it doesn't depend on a glyph the
              system font may not have. */}
          <span aria-hidden className="relative block w-5 h-5">
            <span
              className={`absolute left-0 block h-[2px] w-5 bg-current transition-all duration-200 ${
                menuOpen ? "top-1/2 -translate-y-1/2 rotate-45" : "top-[5px]"
              }`}
            />
            <span
              className={`absolute left-0 top-1/2 -translate-y-1/2 block h-[2px] w-5 bg-current transition-opacity duration-200 ${
                menuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 block h-[2px] w-5 bg-current transition-all duration-200 ${
                menuOpen ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-[5px]"
              }`}
            />
          </span>
        </button>

        <button
          ref={cartRef}
          onClick={openDrawer}
          aria-label={`Open grocery list, ${count} ${count === 1 ? "item" : "items"}`}
          /* CHIP_LOOK, not CHIP: CHIP already bakes in its own px/py,
             and stacking a second padding utility (p-2) on top of it
             is exactly the trap CHIP_LOOK's own definition warns
             about — Tailwind resolves the conflict by stylesheet
             order, not source order, so it silently made this button
             taller than its siblings rather than sized the same.
             CHIP_LOOK carries everything else (border, blur, press)
             without the sizing, so this owns its padding outright. */
          className={`${CHIP_LOOK} relative shrink-0 mr-4 sm:mr-6 p-1.5 sm:p-2 ${chipQuiet}`}
        >
          <CartGlyph className="w-5 h-5" />
          {count > 0 && (
            <span
              className={`absolute -top-2.5 -right-2.5 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-sale text-paper border-2 border-ink font-mono text-[10px] font-bold ${
                pulse ? "animate-badge-pulse" : ""
              }`}
            >
              {count}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
