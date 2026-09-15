import Link from "next/link";
import GlassCard from "@/components/GlassCard";

/**
 * A large "do this" tile: icon, title, one line of detail, and an
 * "Open →" cue. The home hub's four actions and /list's New trip / My
 * trips choice. `href` makes it a link; `onClick` a button; `disabled`
 * greys it out and makes it inert (the detail line should say why).
 */
export default function ActionCard({
  href,
  onClick,
  icon,
  title,
  detail,
  cta = "Open →",
  disabled = false,
  wrapperClassName,
  compactWhenShort = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: string;
  title: string;
  detail: string;
  cta?: string;
  disabled?: boolean;
  /** Grid-placement classes (e.g. `sm:col-span-2`) for the OUTER
   *  wrapper — a size/span override, not surface styling. Passed
   *  straight through to GlassCard's own wrapperClassName. */
  wrapperClassName?: string;
  /** On a short `wide:` screen (≤820px tall — a 768/800px laptop, or a
   *  browser whose chrome eats the height), drop the icon and the "Open →" cue and
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
      <span aria-hidden className={`block text-[30px] leading-none ${short ? "wide:[@media(max-height:820px)]:hidden" : ""}`}>
        {icon}
      </span>
      <span
        className={`block mt-4 font-display text-[19px] leading-tight transition-colors ${short ? "wide:[@media(max-height:820px)]:mt-0" : ""} ${
          disabled ? "text-ink-muted" : "text-ink group-hover:text-accent"
        }`}
      >
        {title}
      </span>
      <span className="block mt-2 text-[14px] text-ink-soft leading-snug">{detail}</span>
      {!disabled && (
        <span aria-hidden className={`block mt-4 text-[14px] font-semibold text-accent ${short ? "wide:[@media(max-height:820px)]:hidden" : ""}`}>
          {cta}
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
