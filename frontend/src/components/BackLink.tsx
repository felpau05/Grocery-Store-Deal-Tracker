"use client";

import { useRouter } from "next/navigation";

/**
 * Goes back in history so the deals page keeps its search/filter state
 * (which lives in the URL params). Falls back to "/" on a direct visit.
 */
export default function BackLink() {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink-soft hover:text-sale transition-colors"
    >
      ← Back to deals
    </button>
  );
}
