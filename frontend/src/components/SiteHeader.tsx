"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount } from "@/lib/account";
import { CHIP, CHIP_ACTIVE, CHIP_LOOK, CHIP_QUIET } from "@/lib/chip";
import { tripName, useCart, useTrips } from "@/lib/trips";
import CartGlyph from "./CartGlyph";
import HeaderLiquid from "./HeaderLiquid";

/* ── One format, one size ────────────────────────────────────────────
   The bar is the same row of named slots at every width:

     [logo]  ─── spacer ───  [cart] [menu]

   Navigation lives behind the hamburger on a phone and on a 27" screen
   alike. It used to fan out into a row of tabs past 768px, which meant
   two arrangements to keep in step and a bar whose contents changed
   shape as you resized; one menu is one thing to reason about, and it
   leaves the bar quiet enough that the cart — the only slot you act on
   mid-task — is unmissable.

   Signed in or out, scraping or not, a trip or none — those only change
   the DATA in a slot (its label, link, badge), never the arrangement.
   The menu is a dropdown anchored under the hamburger at every width —
   it must never be in flow, or opening it grows the bar into a tall
   green band and pushes the whole page down. */

/* "Deals" points at /deals, not "/": "/" is the action hub, and the melon
   logo is the way back to it. */
const TABS = [
  { href: "/deals", label: "Browse Deals" },
  { href: "/list", label: "Manage Shopping Trips" },
];

// Routes that open on a full-bleed hero the header floats over. Only
// there is the header `fixed` (out of flow) and transparent at the top.
const HERO_ROUTES = ["/"];
const HERO_REVEAL_PX = 24;

type Slot = {
  key: string;
  icon: ReactNode;
  label: string;
  title: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  /** Count bubble in the top-right corner (the cart). */
  badge?: number;
  pulse?: boolean;
  /** Spinning ⟳ in the corner — a running scrape, without a chip of its own. */
  busy?: boolean;
};

const SLOT_TYPE = "uppercase tracking-[0.06em]";

function SlotCorner({ slot }: { slot: Slot }) {
  if (slot.badge) {
    return (
      <span
        className={`absolute -top-2.5 -right-2.5 inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full bg-sale text-paper border-2 border-ink font-mono text-[10px] font-bold tracking-normal ${
          slot.pulse ? "animate-badge-pulse" : ""
        }`}
      >
        {slot.badge}
      </span>
    );
  }
  if (slot.busy) {
    return (
      <span
        aria-hidden
        className="absolute -top-2 -right-2 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-sale text-paper border-2 border-ink text-[11px] leading-none"
      >
        <span className="animate-spin">⟳</span>
      </span>
    );
  }
  return null;
}

/** One header item. `bar` is icon-only on a phone (the aria-label and
 *  title still carry the words) and gains its label from `sm` up;
 *  `menu` is a full-width row with the label always shown. Same slot
 *  data either way.
 *
 *  The bar label's cap climbs with the breakpoint rather than sitting at
 *  one width, because the label is usually a TRIP NAME the visitor typed
 *  — "Shopping trip…" tells them nothing, and the bar now has the room
 *  the tab row used to take. Still a cap, not `max-w-none`: the ceiling
 *  is what keeps a 60-character name from eating the logo. */
function HeaderSlot({ slot, variant }: { slot: Slot; variant: "bar" | "menu" }) {
  const className =
    variant === "bar"
      ? `${CHIP} ${SLOT_TYPE} relative shrink-0 inline-flex items-center gap-1.5 ${slot.active ? CHIP_ACTIVE : CHIP_QUIET}`
      : `${CHIP} ${SLOT_TYPE} relative w-full flex items-center gap-2 ${slot.active ? CHIP_ACTIVE : CHIP_QUIET}`;

  const icon = (
    <span aria-hidden className="shrink-0 inline-flex items-center">
      {slot.icon}
    </span>
  );
  const label = (
    <span
      className={
        variant === "bar"
          ? "hidden sm:inline-block truncate max-w-[14ch] md:max-w-[22ch] lg:max-w-[32ch] xl:max-w-[44ch]"
          : "min-w-0 truncate"
      }
    >
      {slot.label}
    </span>
  );

  const body = (
    <>
      {icon}
      {label}
      <SlotCorner slot={slot} />
    </>
  );

  return slot.href ? (
    <Link href={slot.href} title={slot.title} aria-label={slot.title} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={slot.onClick} title={slot.title} aria-label={slot.title} className={className}>
      {body}
    </button>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const { count, openDrawer } = useCart();
  const { activeTrip } = useTrips();
  const cartTripName = activeTrip ? tripName(activeTrip) : null;
  const { user, scrapeStatus } = useAccount();
  const hasHero = HERO_ROUTES.includes(pathname);

  // Starts true (transparent) to match the server render of a hero page;
  // corrected on mount from the real scroll position.
  const [atHeroTop, setAtHeroTop] = useState(true);
  useEffect(() => {
    if (!hasHero) return;
    const onScroll = () => setAtHeroTop(window.scrollY < HERO_REVEAL_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasHero]);
  const transparent = hasHero && atHeroTop;

  /* Publish the header's real height as --header-h. /deals, /list,
     /settings, /item and the toasts size themselves against it. The menu
     panel floats BELOW the bar rather than growing it, so this is the
     bar's own height at every size — measured off the element anyway,
     since the two chip sizes and the hero state all move it. */
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

  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    // The panel is a dropdown at every size now, so a click anywhere
    // off the header dismisses it — Escape and a second press of the
    // hamburger were the only ways out while it was phone-only.
    const onDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
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

  /* ── The slots ─────────────────────────────────────────────────────
     No postal code up here: the area is shown where it matters (the
     "You're seeing deals for …" banner, /settings). A running scrape
     rides on the account slot as a corner spinner. */
  const scraping = !!scrapeStatus?.running;
  const scrapeNote = scraping ? ` — gathering flyers for ${scrapeStatus?.postal_code ?? "your area"}…` : "";

  const account: Slot = user
    ? {
        key: "account",
        icon: "⌂",
        label: user.name,
        title: `${user.name} — account settings${scrapeNote}`,
        href: "/settings",
        active: pathname.startsWith("/settings"),
        busy: scraping,
      }
    : {
        key: "account",
        icon: "⌂",
        label: "Sign in",
        title: `Sign in to set your stores${scrapeNote}`,
        href: "/login",
        active: pathname.startsWith("/login"),
        busy: scraping,
      };

  const cart: Slot = {
    key: "cart",
    icon: <CartGlyph className="w-4 h-4 sm:w-5 sm:h-5" />,
    label: cartTripName ?? "List",
    title: `Open ${cartTripName ?? "grocery list"}, ${count} ${count === 1 ? "item" : "items"}`,
    onClick: openDrawer,
    badge: count,
    pulse,
  };

  // The cart stays on the bar at every size; these move into the menu.
  const menuSlots = [account];

  return (
    <header
      ref={headerRef}
      className={`${hasHero ? "fixed" : "sticky"} top-0 left-0 right-0 z-20 transition-all duration-300 ${
        transparent
          ? "bg-transparent border-b-2 border-transparent"
          : "bg-[radial-gradient(circle,var(--color-header-from),var(--color-header-via),var(--color-header-to))] backdrop-blur-sm border-b-2 border-ink"
      }`}
    >
      {/* Flowing rind over the gradient, which stays as the no-WebGL /
          reduced-motion fallback. `overflow-hidden` is on THIS box rather
          than the header, so the canvas is still clipped to the bar while
          the menu panel is free to hang below it. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <HeaderLiquid active={!transparent} />
      </div>

      <div className="relative z-10 flex items-center gap-2 sm:gap-3 h-14 sm:h-16 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2 shrink-0" title="GroceryDeals — home">
          <span aria-hidden className="text-2xl leading-none group-hover:-rotate-12 transition-transform">
            🍉
          </span>
          {/* --font-serif / --color-logo-text via bracket syntax: named
              utilities from new @theme tokens don't reliably appear in dev. */}
          <span className="hidden min-[380px]:inline text-[17px] sm:text-[22px] leading-none font-bold text-[var(--color-logo-text)] [font-family:var(--font-serif)] whitespace-nowrap">
            GroceryDeals
          </span>
        </Link>

        {/* The only spacer in the bar. The logo anchors the left edge,
            the cart and the menu pack against the right — the hamburger
            is the outermost thing on the row, directly above the panel
            it drops. */}
        <div className="flex-1 min-w-0" />

        <HeaderSlot slot={cart} variant="bar" />

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className={`${CHIP_LOOK} relative shrink-0 p-1.5 ${CHIP_QUIET}`}
        >
          {/* Three rules that become an X. */}
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
          {/* A scrape is running but its slot is inside the menu. */}
          {scraping && !menuOpen && <SlotCorner slot={{ ...account, badge: undefined }} />}
        </button>
      </div>

      {/* A panel that HANGS below the bar, not a drawer that grows it.
          In flow it turned the header into a tall green band and shoved
          the page down every time you opened it. Anchored under the
          hamburger, sized to its own contents, gone again on the next
          click anywhere. */}
      {menuOpen && (
        <div
          id="site-menu"
          onClick={() => setMenuOpen(false)}
          className="animate-in absolute top-full right-4 sm:right-6 z-30 mt-2 w-[min(15rem,calc(100vw-2rem))] flex flex-col gap-2 rounded-card border-2 border-ink bg-[var(--color-header-to)] p-2 shadow-soft-lg"
        >
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${CHIP} uppercase tracking-[0.1em] w-full ${
                pathname.startsWith(tab.href) ? CHIP_ACTIVE : CHIP_QUIET
              }`}
            >
              {tab.label}
            </Link>
          ))}
          <span aria-hidden className="h-px w-full bg-paper/35" />
          {menuSlots.map((slot) => (
            <HeaderSlot key={slot.key} slot={slot} variant="menu" />
          ))}
        </div>
      )}
    </header>
  );
}
