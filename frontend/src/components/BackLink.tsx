"use client";

import { useRouter } from "next/navigation";

/**
 * Goes back in history so the deals page keeps its search/filter state
 * (which lives in the URL params). Falls back to "/deals" on a direct
 * visit. Pass `href` (and a `label`) for a fixed destination instead.
 *
 * A quiet text link with a chevron, not a bordered chip — it's the
 * lowest-priority control on the page and shouldn't look like an action
 * competing with "Add to grocery list".
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
      className="inline-flex items-center gap-1.5 rounded-control text-[13px] font-semibold text-ink-soft hover:text-accent transition-colors"
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="w-3.5 h-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
      {label}
    </button>
  );
}
