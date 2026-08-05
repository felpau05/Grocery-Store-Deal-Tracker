import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import CartDrawer from "@/components/CartDrawer";
import MelonCorner from "@/components/MelonCorner";
import PageLiquid from "@/components/PageLiquid";
import SiteHeader from "@/components/SiteHeader";
import { AccountProvider } from "@/lib/account";
import { CartProvider } from "@/lib/cart";
import { PlansProvider } from "@/lib/plans";
import { ToastProvider } from "@/lib/toast";

const archivo = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-archivo",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-spacemono",
});

export const metadata: Metadata = {
  title: "Grocery Store Deals",
  description:
    "Live deals pulled from local grocery flyers near you.",
  icons: {
    // .ico first for crawlers and older clients that only ever look for
    // /favicon.ico (and never parse this tag); modern browsers pick the
    // SVG since it's the sharper, later match.
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "grocerydeals",
    description:
      "Live deals pulled from local grocery flyers near you.",
    siteName: "grocerydeals",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${grotesk.variable} ${spaceMono.variable}`}>
      <body className="min-h-screen">
        {/* Animates the page's rind stripes — html::before's static CSS
            mask (globals.css) is what's visible until this takes over,
            and remains the fallback for no-WebGL/reduced-motion. Its own
            className carries an explicit -z-10, which is what actually
            keeps it behind real content (see the comment there) — DOM
            order alone was tried first and wasn't enough: it stopped
            content that stays at z:auto from painting on top, but did
            nothing against anything using a real z-index, like /list's
            own z-10 heading or SiteHeader's z-20. */}
        <PageLiquid />
        <ToastProvider>
          <AccountProvider>
            <CartProvider>
              <PlansProvider>
                <SiteHeader />
                {children}
                <CartDrawer />
                <MelonCorner />
              </PlansProvider>
            </CartProvider>
          </AccountProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
