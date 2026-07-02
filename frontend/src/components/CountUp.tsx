"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from its previous value to `value` with an
 * ease-out, via requestAnimationFrame. Used for the optimizer total so
 * the price visibly "rings up". Respects prefers-reduced-motion.
 */
export default function CountUp({
  value,
  decimals = 0,
  prefix = "",
  durationMs = 750,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <>
      {prefix}
      {display.toFixed(decimals)}
    </>
  );
}
