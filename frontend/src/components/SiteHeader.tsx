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

      {/* Full-bleed: logo and nav sit at the true edges of the viewport,
          same as the deals page's own grid below it.

          Below `sm`, every level here (this row, the nav+account group,
          the account sub-group) is flex-wrap instead of the old fixed
          h-16 + overflow-hidden — so a too-narrow line reflows onto
          another line instead of silently clipping. Content of any
          length (a long postal code, a long name) just reflows; nothing
          gets cut off and invisible the way it did before. `justify-
          between` still keeps exactly two top-level boxes (logo, the
          nav+account group) so the group wraps as a whole unit onto its
          own line rather than logo and its first tab awkwardly sharing
          one — the group's OWN children are what further wrap inside
          it once it's on its own row. */}
      <div className="relative z-10 w-full px-4 sm:px-6 py-2.5 sm:py-0 sm:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2">
        <Link href="/" className="group flex items-center gap-2">
          <span aria-hidden className="text-xl sm:text-2xl leading-none group-hover:-rotate-12 transition-transform">
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
          <span className="text-[17px] sm:text-[22px] leading-none font-bold text-[var(--color-logo-text)] [font-family:var(--font-serif)]">
            GroceryDeals
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-5">
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
              (status, location, sign-in, cart) — previously one flat
              row with no grouping. Kept at every width: on the rare
              wrap where nav and account land on separate lines it's a
              harmless trailing/leading mark, and losing it made the two
              groups on one line read as one undifferentiated cluster of
              chips. */}
          <span aria-hidden className={`w-px h-6 shrink-0 ${divider}`} />

          {/* Everything account-related as one sub-group, tighter gap
              than the outer nav/divider/account split above. */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Scraping indicator — visible on every page while an
              on-demand scrape runs for the signed-in user's area. */}
          {scrapeStatus?.running && (
            <Link
              href="/settings"
              title={`Gathering flyers for ${scrapeStatus.postal_code ?? "your area"}…`}
              className={`${CHIP} flex items-center gap-1.5 ${chipActive} animate-pulse`}
            >
              <span aria-hidden>⟳</span>
              <span className="hidden sm:inline">Scraping…</span>
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
              className={`${CHIP} flex items-center gap-1.5 ${chipQuiet}`}
            >
              <span aria-hidden>📍</span>
              {activePostal}
              {isExample && (
                <span className="hidden sm:inline text-[9px] uppercase tracking-[0.08em] opacity-70">example</span>
              )}
            </Link>
          ) : (
            user && (
              <Link
                href="/settings"
                title="Set your postal code to see deals near you"
                className={`${CHIP} flex items-center gap-1.5 ${chipQuiet}`}
              >
                <span aria-hidden>📍</span>
                <span className="hidden sm:inline">Set postal code</span>
              </Link>
            )
          )}

          <Link
            href={user ? "/settings" : "/login"}
            className={`${CHIP} ${
              pathname.startsWith(user ? "/settings" : "/login") ? chipActive : chipQuiet
            }`}
            title={user ? `${user.name} · ${user.postal_code ?? "no postal code"}` : "Sign in to set your stores"}
          >
            <span aria-hidden>⌂</span>
            <span className={user ? "hidden sm:inline sm:ml-1" : "ml-1"}>
              {user ? user.name : "Sign in"}
            </span>
          </Link>

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
            className={`${CHIP_LOOK} relative p-1.5 sm:p-2 ${chipQuiet}`}
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
        </div>
      </div>
    </header>
  );
}
