"use client";

import { useEffect } from "react";

/**
 * Sets `--vh` (one real, current viewport percent) so MelonHero/TripIntro
 * can size themselves with `calc(var(--vh,1vh)*100)` instead of `100dvh`.
 *
 * Native `dvh` sounds like the right tool — it tracks the visible area
 * as Safari's toolbar shows/hides — but that's exactly the problem: the
 * hero holds a WebGL canvas (the 3D watermelon / the flowing gradient),
 * and every time `dvh` changes mid-scroll the canvas resizes to match,
 * re-rendering the same framed scene at a larger pixel size. The camera
 * math is fine; the visual result is the scene appearing to zoom in as
 * you scroll, since more on-screen pixels are now devoted to the same
 * shot. `h-screen`/100vh had the opposite problem (see MelonHero's own
 * comment) — too tall, never resizing.
 *
 * The fix is to set an accurate height once (so the hero fully covers
 * whatever's visible at load) and then leave it alone through ordinary
 * scroll-driven toolbar animation — only a genuine resize or rotation
 * (which always changes the WIDTH too; toolbar show/hide only ever
 * changes height) updates it again.
 */
export default function ViewportHeightFix() {
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
    };
    setVh();

    let lastWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return; // height-only change — toolbar animating, not a real resize
      lastWidth = window.innerWidth;
      setVh();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", setVh);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", setVh);
    };
  }, []);

  return null;
}
