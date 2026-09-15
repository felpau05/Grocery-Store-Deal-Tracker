"use client";

import HomeHub from "@/components/HomeHub";
import MelonHero from "@/components/MelonHero";
import { useHeroSnap } from "@/lib/hooks";

/**
 * The landing page: the 3D melon hero, then ACTIONS.
 *
 * It used to be the hero followed immediately by every deal in the
 * region — a filter rail and 2,249 items — so scrolling off the melon
 * landed straight in "the wall of all the items". Browsing all of them
 * now lives on /deals, organised by category; what sits under the hero
 * is a hub: four things you might want to do, and a six-card taste of
 * this week's best.
 *
 * `useHeroSnap("deals")` measures the section directly below the hero
 * to find where the hero actually ends, so HomeHub keeps `id="deals"`
 * and MelonHero's scroll cue keeps pointing at `#deals`. All three have
 * to move together if that id ever changes.
 */
export default function Home() {
  useHeroSnap("deals");

  return (
    // No bottom padding at `wide:` — HomeHub is exactly one screen there,
    // and any padding would be a strip you could still scroll into.
    <main className="pb-16 wide:pb-0">
      <MelonHero />
      <HomeHub />
    </main>
  );
}
