"use client";

import { useRouter } from "next/navigation";

/**
 * Goes back in history so the deals page keeps its search/filter state
 * (which lives in the URL params). Falls back to "/deals" on a direct
 * visit. Pass `href` (and a `label`) for a fixed destination instead.
 *
 * A plain white button, the same size as the primary CTA. It was
 * a grey text link, which read as a caption rather than something you can
 * press. White rather than accent, so it never competes with a page's
 * primary action.
 */
export default function BackLink({ href, label = "Back to deals" }: { href?: string; label?: string } = {}) {
  const router = useRouter();
  return (
    <button
      // With an `href` it always goes THERE — the planner's "← My trips"
      // is a fixed step up, not "wherever you came from" (which could be
      // a deal page, or another trip).
      onClick={() =>
        href ? router.push(href) : window.history.length > 1 ? router.back() : router.push("/deals")
      }
      // Same size as BTN_PRIMARY_CTA ("Save my stores": font-display
      // 15px, py-3, px-6) so the two read as a pair, just white.
      className="btn-soft-quiet shadow-soft inline-flex items-center justify-center px-6 py-3 font-display text-[15px] text-ink"
    >
      {label}
    </button>
  );
}
