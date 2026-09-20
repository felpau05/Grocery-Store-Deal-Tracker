import type { ReactNode } from "react";

import Link from "next/link";
import GlassCard from "@/components/GlassCard";
import { CHIP_ARROW, CHIP_CUE } from "@/lib/chip";

/**
 * A large "do this" tile: icon, title, one line of detail, and an
 * "Open" cue. The home hub's three actions and /list's New trip tile.
 * `href` makes it a link; `onClick` a button; `disabled` greys it out
 * and makes it inert (the detail line should say why).
 *
 * `cta` is the cue's WORDS only — no arrow in the string. The chip adds
 * its own, as an element it can nudge on hover.
 */
export default function ActionCard({
  href,
  onClick,
  icon,
  title,
  detail,
  cta = "Open",
  disabled = false,
  wrapperClassName,
  compactWhenShort = false,
}: {
  href?: string;
  onClick?: () => void;
  /** A 24px line icon from `components/icons` — not an emoji: those
   *  render differently per OS and sit off the baseline. */
  icon: ReactNode;
  title: string;
  detail: string;
  cta?: string;
  disabled?: boolean;
  /** Grid-placement classes (e.g. `sm:col-span-2`) for the OUTER
   *  wrapper — a size/span override, not surface styling. Passed
   *  straight through to GlassCard's own wrapperClassName. */
  wrapperClassName?: string;
  /** On a short `wide:` screen (≤820px tall — a 768/800px laptop, or a
   *  browser whose chrome eats the height), drop the icon and the cue and
   *  tighten the padding — for the home hub, which has to fit one
   *  screen. The whole tile is still the link, so nothing is lost. */
  compactWhenShort?: boolean;
}) {
  const short = compactWhenShort;
  const surface =
    `group relative overflow-hidden rounded-card bg-surface border border-line block w-full h-full p-6 text-left transition-colors ${
      short ? "wide:[@media(max-height:820px)]:px-5 wide:[@media(max-height:820px)]:py-4" : ""
    }`;

  const body = (
    <>
      <span
        aria-hidden
        className={`flex h-11 w-11 items-center justify-center rounded-control bg-accent-soft text-accent-dark ${
          short ? "wide:[@media(max-height:820px)]:hidden" : ""
        }`}
      >
        {icon}
      </span>
      <span
        className={`block mt-4 font-display text-[19px] leading-tight transition-colors ${short ? "wide:[@media(max-height:820px)]:mt-0" : ""} ${
          disabled ? "text-ink-muted" : "text-ink group-hover:text-accent-dark"
        }`}
      >
        {title}
      </span>
      {/* Two lines' worth of room whether or not this line needs it, so
          a row of these lines its cues up instead of stepping down
          wherever each sentence happens to stop. */}
      <span className="block mt-2 min-h-[2.8em] text-[14px] text-ink-soft leading-snug">{detail}</span>
      {!disabled && (
        <span className={`block mt-4 ${short ? "wide:[@media(max-height:820px)]:hidden" : ""}`}>
          <span aria-hidden className={CHIP_CUE}>
            {cta}
            <span className={CHIP_ARROW}>→</span>
          </span>
        </span>
      )}
    </>
  );

  if (disabled) {
    return (
      <div aria-disabled className={`${wrapperClassName ?? ""} ${surface} opacity-70`}>
        {body}
      </div>
    );
  }

  if (href) {
    return (
      <GlassCard
        as={Link}
        href={href}
        interactive
        wrapperClassName={wrapperClassName}
        surfaceClassName={`${surface} hover:border-line-strong`}
      >
        {body}
      </GlassCard>
    );
  }

  return (
    <GlassCard
      as="button"
      onClick={onClick}
      interactive
      wrapperClassName={wrapperClassName}
      surfaceClassName={`${surface} hover:border-line-strong`}
    >
      {body}
    </GlassCard>
  );
}
