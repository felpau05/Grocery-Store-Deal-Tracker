"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Deals" },
  { href: "/list", label: "Plan a trip" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 bg-paper/85 backdrop-blur-sm border-b border-border-tan">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full bg-sale group-hover:scale-125 transition-transform"
          />
          <span className="font-display font-black text-lg text-ink tracking-tight">
            flippwatch
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {TABS.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${
                  active ? "text-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-sale rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
