"use client";

import { useSyncExternalStore } from "react";

/**
 * Media queries, for the handful of decisions CSS cannot make.
 *
 * Almost all of this site's responsiveness belongs in a stylesheet, and
 * that is where it is: the `sidebar:` / `wide:` / `ultra:` variants in
 * globals.css, and Tailwind's own breakpoints for plain column counts.
 * This file exists for the places a layout is COMPUTED in JavaScript and
 * therefore has to know the answer as a value rather than as a rule.
 *
 * There is exactly one of those today — /list scrolling to its results
 * after a build, which is the wrong move once the results are already on
 * screen beside the form. Adding a second should need a reason: reach
 * for a variant first, and only come here when a variant genuinely
 * cannot express it.
 *
 * `useSyncExternalStore` rather than an effect and a piece of state, so
 * the first client render already has the right answer instead of
 * painting one layout and correcting it a frame later. The server
 * snapshot is the one thing it cannot know, so it answers false — and
 * false is the NARROW layout in every caller, which is both the safe
 * default and what the prerendered HTML contains.
 */

const listeners = new Map<string, Set<() => void>>();
const lists = new Map<string, MediaQueryList>();

function listFor(query: string) {
  let mql = lists.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    lists.set(query, mql);
  }
  return mql;
}

function subscribe(query: string, onChange: () => void) {
  const mql = listFor(query);
  let set = listeners.get(query);
  if (!set) {
    set = new Set();
    listeners.set(query, set);
    // One listener per query however many components ask for it:
    // matchMedia fires on the main thread during a resize, and dragging
    // a window should not run the same comparison a dozen times.
    mql.addEventListener("change", () => {
      for (const l of listeners.get(query) ?? []) l();
    });
  }
  set.add(onChange);
  return () => {
    set.delete(onChange);
  };
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => listFor(query).matches,
    () => false,
  );
}

/**
 * Where a second column of CONTENT fits beside the first.
 *
 * Stated here and once as `@custom-variant wide` in globals.css, rather
 * than as two numbers that happen to agree. If it moves, it moves in
 * both: a JS layout that disagreed with the stylesheet about where the
 * two-pane layout begins is a class of bug with no visible cause — the
 * page would scroll to results that were already on screen, or fail to
 * scroll to results that weren't, and nothing in either file would look
 * wrong on its own.
 *
 * The aspect-ratio half is not decoration; see the comment on the
 * variant in globals.css for why a portrait monitor's width is a lie.
 */
export const WIDE_QUERY = "(min-width: 1280px) and (min-aspect-ratio: 4/3)";

/** True where the layout is two panes rather than one stacked column. */
export function useWide() {
  return useMediaQuery(WIDE_QUERY);
}
