import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import CartDrawer from "@/components/CartDrawer";
import SiteHeader from "@/components/SiteHeader";
import { AccountProvider } from "@/lib/account";
import { CartProvider } from "@/lib/cart";
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
    "Live deals pulled from local grocery flyers.",
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
    title: "grocerytracker",
    description:
      "Live deals pulled from local grocery flyers.",
    siteName: "grocerytracker",
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
        <ToastProvider>
          <AccountProvider>
            <CartProvider>
              <SiteHeader />
              {children}
              <CartDrawer />
            </CartProvider>
          </AccountProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
