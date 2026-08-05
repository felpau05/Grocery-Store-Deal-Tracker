"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { CHIP, CHIP_ACTIVE, CHIP_LOOK, CHIP_QUIET } from "@/lib/chip";
import { useCart } from "@/lib/cart";
import CartGlyph from "./CartGlyph";
import HeaderLiquid from "./HeaderLiquid";

const TABS = [
  { href: "/", label: "Deals" },
  { href: "/list", label: "Plan a trip" },
];

// Routes that open on a full-viewport hero the header floats over:
// "/" (MelonHero) and "/list" (TripIntro). Both need the header out of
// document flow so the hero can be a true h-screen.
const HERO_ROUTES = ["/", "/list"];

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
  // without occupying document flow, so MelonHero/TripIntro can be a
  // true 100vh. Every other page keeps the original `sticky` —
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
  const hasStores = !!user && user.merchants.length > 0;
  const isExample = !user;
  const activePostal = user
    ? user.postal_code ?? (hasStores ? `${user.merchants.length} stores` : null)
    : meta?.default_postal_code ?? null;

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

          Below `sm`, the logo and the cart are the only two things
          pinned in place — home and "the thing you came here to check"
          shouldn't ever require a scroll to reach. Everything between
          them (nav, status, postal, sign-in) rides in a `.scroll-peek-x`
          strip instead: it's deliberately NOT shrunk or wrapped to fit,
          so on a narrow screen it scrolls, and whichever chip lands at
          the edge fades under the mask rather than getting hard-clipped
          — the "there's more, drag me" cue, instead of the row folding
          onto a second line. From `sm` up the strip already fits inside
          one row on its own, so the class reverts to a plain row and
          none of this is visible. */}
      <div className="relative z-10 w-full h-14 sm:h-16 flex items-center gap-2 sm:gap-3">
        <Link href="/" className="group flex items-center gap-2 pl-4 sm:pl-6 shrink-0" title="GroceryDeals — home">
          {/* Below `sm` the wordmark is dropped entirely, not just
              shrunk — every extra px pinned in this bookend is a px the
              scroll-peek strip doesn't get, and the melon alone is
              already a clear, tappable "home" mark at this size. */}
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
          <span className="hidden sm:inline text-[22px] leading-none font-bold text-[var(--color-logo-text)] [font-family:var(--font-serif)]">
            GroceryDeals
          </span>
        </Link>

        <div className="scroll-peek-x flex-1 min-w-0 h-full">
          {/* w-max: lets this row size to its actual content instead of
              being squeezed to fit the strip — that's what makes it
              genuinely overflow (and thus scroll/peek) on mobile rather
              than every chip just shrinking. sm:w-full + sm:justify-end
              restores the original "hugs the right edge" desktop
              layout once the strip stops scrolling. */}
          <div className="flex items-center gap-1.5 sm:gap-2 h-full w-max pr-8 sm:w-full sm:justify-end sm:pr-0">
            <nav className="flex items-center gap-1.5 sm:gap-2">
              {TABS.map((tab) => {
                const active =
                  tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
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
                (status, location, sign-in). */}
            <span aria-hidden className={`w-px h-6 shrink-0 ${divider}`} />

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

            {/* Always-visible postal code — so it's never ambiguous which
                area's deals are on screen. Yellow + "example" only for a
                true anonymous visitor; a signed-in account with no postal
                code yet gets a prompt instead, never the example area. */}
            {activePostal ? (
              <Link
                href={user ? "/settings" : "/login"}
                title={
                  isExample
                    ? "Showing example-area deals — sign in to set your own postal code"
                    : "Your stores drive these deals — click to change them"
                }
                className={`${CHIP} flex items-center gap-1.5 shrink-0 ${chipQuiet}`}
              >
                <span aria-hidden>📍</span>
                {activePostal}
                {isExample && (
                  <span className="text-[9px] uppercase tracking-[0.08em] opacity-70">example</span>
                )}
              </Link>
            ) : (
              user && (
                <Link
                  href="/settings"
                  title="Set your postal code to see deals near you"
                  className={`${CHIP} flex items-center gap-1.5 shrink-0 ${chipQuiet}`}
                >
                  <span aria-hidden>📍</span>
                  <span>Set postal code</span>
                </Link>
              )
            )}

            <Link
              href={user ? "/settings" : "/login"}
              className={`${CHIP} shrink-0 ${
                pathname.startsWith(user ? "/settings" : "/login") ? chipActive : chipQuiet
              }`}
              title={user ? `${user.name} · ${user.postal_code ?? "no postal code"}` : "Sign in to set your stores"}
            >
              <span aria-hidden>⌂</span>
              <span className={user ? "hidden sm:inline sm:ml-1" : "ml-1"}>
                {user ? user.name : "Sign in"}
              </span>
            </Link>
          </div>
        </div>

        <button
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
