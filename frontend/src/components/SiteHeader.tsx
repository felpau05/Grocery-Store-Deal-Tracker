"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { useCart } from "@/lib/cart";
import CartGlyph from "./CartGlyph";

const TABS = [
  { href: "/", label: "Deals" },
  { href: "/list", label: "Plan a trip" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const { count, openDrawer } = useCart();
  const { user, meta, scrapeStatus } = useAccount();

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
    <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur-sm border-b-2 border-ink">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="group flex items-center">
          <span className="sticker text-[13px] text-ink group-hover:rotate-0 transition-transform">
            flippwatch<span className="text-sale">*</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-2">
            {TABS.map((tab) => {
              const active =
                tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`text-[12px] font-mono font-bold uppercase tracking-[0.1em] px-3 py-1.5 border-2 transition-colors ${
                    active
                      ? "bg-ink text-paper border-ink"
                      : "border-transparent text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {/* Scraping indicator — visible on every page while an
              on-demand scrape runs for the signed-in user's area. */}
          {scrapeStatus?.running && (
            <Link
              href="/settings"
              title={`Gathering flyers for ${scrapeStatus.postal_code ?? "your area"}…`}
              className="flex items-center gap-1.5 text-[12px] font-mono font-bold px-2.5 py-1.5 border-2 border-ink bg-produce text-paper animate-pulse"
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
              className={`flex items-center gap-1.5 text-[12px] font-mono font-bold px-2.5 py-1.5 border-2 transition-all ${
                isExample
                  ? "bg-tag border-ink text-ink hover:shadow-[2px_2px_0_var(--color-ink)]"
                  : "border-ink/25 text-ink hover:border-ink"
              }`}
            >
              <span aria-hidden>📍</span>
              {activePostal}
              {isExample && <span className="text-[9px] uppercase tracking-[0.08em] opacity-70">example</span>}
            </Link>
          ) : (
            user && (
              <Link
                href="/settings"
                title="Set your postal code to see deals near you"
                className="flex items-center gap-1.5 text-[12px] font-mono font-bold px-2.5 py-1.5 border-2 border-ink/25 text-ink hover:border-ink transition-all"
              >
                <span aria-hidden>📍</span>
                <span>Set postal code</span>
              </Link>
            )
          )}

          <Link
            href={user ? "/settings" : "/login"}
            className={`text-[12px] font-mono font-bold px-3 py-1.5 border-2 transition-all ${
              pathname.startsWith(user ? "/settings" : "/login")
                ? "bg-ink text-paper border-ink"
                : user
                  ? "border-ink/25 text-ink hover:border-ink"
                  : "bg-tag border-ink text-ink shadow-[2px_2px_0_var(--color-ink)]"
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
            className="btn-brut relative p-2 bg-card text-ink hover:bg-tag transition-colors"
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
    </header>
  );
}
