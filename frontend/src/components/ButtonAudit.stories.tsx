import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import Link from "next/link";
import GlassCard from "./GlassCard";
import { CHIP, CHIP_ACTIVE, CHIP_QUIET, CHIP_DISABLED, CHIP_QUIET_LIGHT, CHIP_DISABLED_LIGHT } from "@/lib/chip";
import { BTN_CART_ADD, BTN_FOLLOWUP_CTA, BTN_NUDGE_CTA, BTN_PRIMARY_CTA } from "@/lib/button";

/**
 * Visual companion to BUTTON_AUDIT.md (frontend/) — every distinct
 * button/chip/link treatment currently in the app, rendered side by
 * side and labeled with its audit ID. Cross-reference the .md for
 * file:line and the "what's driving the inconsistency" notes.
 *
 * This is NOT a component library and nothing here is a recommendation
 * — every variant is a literal copy of a real call site's classes,
 * shown here specifically because it's currently DIFFERENT from its
 * neighbors. Once real design rules exist, this file's job is done and
 * it should be deleted (or trimmed to just the survivors) rather than
 * maintained alongside them.
 */

function Item({ id, caption, children }: { id: string; caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 bg-black/30 px-1.5 py-0.5">
        {id} — {caption}
      </span>
      {children}
    </div>
  );
}

/** Selected/unselected pair, rendered as real <button>s so :hover still
 *  works when you actually point at them in the Storybook preview. */
function Pair({ id, caption, base, on, off }: { id: string; caption: string; base: string; on: string; off: string }) {
  return (
    <Item id={id} caption={caption}>
      <div className="flex gap-2">
        <button type="button" className={`${base} ${on}`}>
          selected
        </button>
        <button type="button" className={`${base} ${off}`}>
          unselected
        </button>
      </div>
    </Item>
  );
}

/** The coral page gradient — every one of these renders against the
 *  same background it actually sits on in the app, since fill/border
 *  contrast is half of what's being compared here. */
function Gallery({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-8 p-8 min-h-screen bg-[radial-gradient(circle,#ff9494,#ff7575,#ff3434)]">
      {children}
    </div>
  );
}

const meta: Meta = {
  title: "Audit/Buttons",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

// ── Role A — standalone primary CTA ─────────────────────────────────
export const A_PrimaryCTA: Story = {
  name: "A — Primary CTA (7 variants)",
  render: () => (
    <Gallery>
      <Item id="A1" caption="error.tsx “Try again”">
        <GlassCard as="button" surfaceClassName="glow-btn px-5 py-2.5 bg-produce text-paper font-mono font-bold text-sm">
          Try again
        </GlassCard>
      </Item>
      <Item id="A2" caption="error.tsx “Back to deals”">
        <GlassCard as="button" surfaceClassName="glow-btn px-5 py-2.5 bg-card text-ink font-mono font-bold text-sm">
          ← Back to deals
        </GlassCard>
      </Item>
      <Item id="A3" caption="not-found / settings “Save my stores”">
        <GlassCard as="button" surfaceClassName="glow-btn px-5 py-2.5 bg-sale text-paper font-display text-sm">
          Save my stores
        </GlassCard>
      </Item>
      <Item id="A4" caption="settings “Sign in / create account”">
        <GlassCard as="button" surfaceClassName="glow-btn px-6 py-3 bg-sale text-paper font-display">
          Sign in / create account →
        </GlassCard>
      </Item>
      <Item id="A5" caption="BTN_PRIMARY_CTA (login / list)">
        <div className="w-44">
          <GlassCard as="button" surfaceClassName={BTN_PRIMARY_CTA}>
            Build my trip
          </GlassCard>
        </div>
      </Item>
      <Item id="A6" caption="page.tsx “Clear search & filters”">
        <GlassCard as="button" surfaceClassName="glow-btn px-4 py-2 bg-card text-ink text-[12px] font-mono font-bold uppercase">
          ✕ Clear search &amp; filters
        </GlassCard>
      </Item>
      <Item id="A7a" caption="AddToListButton, full-size (not in list)">
        <GlassCard
          as="button"
          surfaceClassName="glow-btn inline-flex items-center gap-2 font-display text-sm px-4 py-2.5 transition-colors bg-tag text-ink hover:bg-tag/80"
        >
          + Add to grocery list
        </GlassCard>
      </Item>
      <Item id="A7b" caption="AddToListButton, full-size (in list)">
        <GlassCard
          as="button"
          surfaceClassName="glow-btn inline-flex items-center gap-2 font-display text-sm px-4 py-2.5 transition-colors bg-produce text-paper"
        >
          ✓ On your list
        </GlassCard>
      </Item>
    </Gallery>
  ),
};

// ── Role B — secondary / nested action ──────────────────────────────
export const B_Secondary: Story = {
  name: "B — Secondary action (7 variants)",
  render: () => (
    <Gallery>
      <Item id="B1" caption="BTN_CART_ADD">
        <button className={BTN_CART_ADD}>Add</button>
      </Item>
      <Item id="B2" caption="BTN_FOLLOWUP_CTA">
        <button className={BTN_FOLLOWUP_CTA}>Retry</button>
      </Item>
      <Item id="B3" caption="BTN_NUDGE_CTA">
        <button className={BTN_NUDGE_CTA}>Sign up →</button>
      </Item>
      <Item id="B4" caption="settings “Sign out”">
        <button className="btn-brut-ink px-4 py-2 bg-card text-ink font-mono font-bold text-[12px] uppercase">
          Sign out
        </button>
      </Item>
      <Item id="B5" caption="settings “Find stores”">
        <button className="btn-brut-ink px-4 py-2 bg-produce text-paper text-sm font-mono font-bold">
          Find stores
        </button>
      </Item>
      <Item id="B6" caption="login “Continue with Google”">
        <div className="w-56">
          <button className="btn-brut-ink w-full bg-card text-ink font-mono font-bold text-sm py-2.5">
            <svg aria-hidden className="inline-block w-[18px] h-[18px] mr-2 -mt-0.5 align-middle shrink-0" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.68 9c0-.593.102-1.17.284-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>
        </div>
      </Item>
      <Item id="B7" caption="CartDrawer “Plan my trip” (hand-built on the Link itself, not GlassCard)">
        <div className="w-44">
          <Link
            href="#"
            className="block text-center font-display py-3 px-3 transition-colors btn-brut-ink bg-sale text-paper hover:bg-produce"
          >
            Plan my trip →
          </Link>
        </div>
      </Item>
    </Gallery>
  ),
};

// ── Role C — toggle / selected-state chip ───────────────────────────
export const C_ToggleChip: Story = {
  name: "C — Toggle chip (9+ variants)",
  render: () => (
    <Gallery>
      <Pair
        id="C1"
        caption="AddToListButton compact — via toggleChip()"
        base="border-2 transition-all inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1"
        on="bg-produce text-paper border-ink shadow-[2px_2px_0_var(--color-shadow)]"
        off="border-ink/30 text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/40"
      />
      <Pair
        id="C2"
        caption="settings “Groceries only” — via toggleChip()"
        base="border-2 transition-all text-[11px] font-mono font-bold px-2.5 py-1"
        on="bg-produce text-paper border-ink shadow-[2px_2px_0_var(--color-shadow)]"
        off="border-ink/25 text-ink-soft hover:border-ink"
      />
      <Pair
        id="C3"
        caption="settings store row — via toggleChip()"
        base="border-2 transition-all text-left px-3 py-2"
        on="bg-tag/40 border-ink shadow-[2px_2px_0_var(--color-shadow)]"
        off="bg-card border-ink/20 hover:border-ink"
      />
      <Pair
        id="C4"
        caption="DealsSidebar Row/CheckboxRow/AllRow — hand-rolled, backdrop-blur not shadow"
        base="text-[13px] font-mono font-bold px-2 py-1.5 border-2 transition-all"
        on="bg-produce/90 backdrop-blur-sm text-paper border-ink/70"
        off="border-transparent text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/25"
      />
      <Pair
        id="C5"
        caption="DealsSidebar priced-by — hand-rolled, different “off” than C4"
        base="text-[12px] font-mono font-bold px-1.5 py-1 border-2 transition-all"
        on="bg-produce/90 backdrop-blur-sm text-paper border-ink/70"
        off="border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
      />
      <Pair
        id="C6"
        caption="DealsSidebar sort-mode — hand-rolled, no border at all"
        base="text-[12px] font-mono font-bold px-2 py-1 transition-colors"
        on="bg-produce/90 backdrop-blur-sm text-paper"
        off="text-ink-soft hover:text-ink"
      />
      <Pair
        id="C8"
        caption="list.tsx swap-your-picks — hand-rolled, shadow is --color-tag (lime) not --color-shadow (orange)"
        base="text-left text-[12px] px-2.5 py-1.5 border-2 transition-all"
        on="bg-produce text-paper border-ink shadow-[3px_3px_0_var(--color-tag)]"
        off="bg-card border-ink/25 text-ink-soft hover:border-ink hover:text-ink"
      />
      <Item id="C7" caption="list.tsx mode toggle — sliding highlight, not a per-button state (structurally different)">
        <div className="relative flex bg-paper border-2 border-ink p-1 w-56">
          <span className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-produce" aria-hidden />
          <span className="relative z-10 flex-1 text-[12px] font-mono font-bold py-1.5 text-center text-paper">
            Cheapest total
          </span>
          <span className="relative z-10 flex-1 text-[12px] font-mono font-bold py-1.5 text-center text-ink-soft">
            Fewest stops
          </span>
        </div>
      </Item>
      <Item id="C9a / C9b" caption="“quick add” pills — same feature, two shapes (square vs pill)">
        <div className="flex gap-2 items-center">
          <button type="button" className="text-[12px] font-mono font-bold px-2.5 py-1 border-2 border-ink/25 text-ink-soft hover:border-ink hover:text-ink hover:bg-tag/40 transition-all capitalize">
            + milk (list.tsx)
          </button>
          <button type="button" className="text-[12px] px-2.5 py-1 rounded-full border border-border-tan text-ink-soft hover:border-ink hover:text-ink transition-colors capitalize">
            + milk (CartDrawer)
          </button>
        </div>
      </Item>
    </Gallery>
  ),
};

// ── Role D — header / paginator pill (lib/chip.ts) ──────────────────
export const D_HeaderPill: Story = {
  name: "D — Header/paginator pill (already shared — reference)",
  render: () => (
    <Gallery>
      <Item id="D1" caption="CHIP_QUIET (header/hero, dark glass)">
        <div className="flex gap-2 p-3 bg-[radial-gradient(circle,var(--color-header-from),var(--color-header-via),var(--color-header-to))]">
          <button className={`${CHIP} ${CHIP_QUIET}`}>Deals</button>
        </div>
      </Item>
      <Item id="D2" caption="CHIP_ACTIVE (current tab / page)">
        <div className="flex gap-2 p-3 bg-[radial-gradient(circle,var(--color-header-from),var(--color-header-via),var(--color-header-to))]">
          <button className={`${CHIP} ${CHIP_ACTIVE}`}>Plan a trip</button>
        </div>
      </Item>
      <Item id="D3" caption="CHIP_QUIET_LIGHT (paginator, on the page background)">
        <button className={`${CHIP} ${CHIP_QUIET_LIGHT}`}>3</button>
      </Item>
      <Item id="D4" caption="CHIP_DISABLED_LIGHT (paginator ends)">
        <button className={`${CHIP} ${CHIP_DISABLED_LIGHT}`} disabled>
          ←
        </button>
      </Item>
      <Item id="—" caption="CHIP_DISABLED (dark-glass disabled, defined but unused today)">
        <div className="flex gap-2 p-3 bg-[radial-gradient(circle,var(--color-header-from),var(--color-header-via),var(--color-header-to))]">
          <button className={`${CHIP} ${CHIP_DISABLED}`} disabled>
            ←
          </button>
        </div>
      </Item>
    </Gallery>
  ),
};

// ── Role E — plain text link ─────────────────────────────────────────
export const E_TextLink: Story = {
  name: "E — Plain text link (6 “quiet link” + 5 “×” dismiss variants)",
  render: () => (
    <Gallery>
      <Item id="E1" caption="BackLink.tsx">
        <button className="font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink-soft hover:text-sale transition-colors">
          ← Back to deals
        </button>
      </Item>
      <Item id="E2" caption="DealsSidebar “edit stores” (no uppercase/tracking)">
        <button className="text-[12px] font-mono font-bold text-ink-soft hover:text-sale transition-colors">
          ✎ edit stores
        </button>
      </Item>
      <Item id="E3" caption="settings “View my deals” (no tracking)">
        <button className="font-mono font-bold text-[12px] uppercase text-ink-soft hover:text-sale transition-colors">
          View my deals →
        </button>
      </Item>
      <Item id="E4" caption="login “Keep browsing” (text-ink, not -soft)">
        <button className="font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink hover:text-sale transition-colors">
          ← Keep browsing the example flyer
        </button>
      </Item>
      <Item id="E5" caption="list.tsx “clear all”">
        <button className="text-[11px] font-mono font-bold uppercase text-ink-soft hover:text-sale transition-colors">
          clear all
        </button>
      </Item>
      <Item id="E6" caption="CartDrawer “clear all” (/70 opacity — the contrast bug fixed elsewhere still lives here)">
        <button className="text-[11px] font-mono font-bold uppercase text-ink-soft/70 hover:text-sale transition-colors">
          clear all
        </button>
      </Item>
      <Item id="E7" caption="toast.tsx dismiss">
        <div className="bg-produce p-3">
          <button className="text-paper/50 hover:text-paper text-base leading-none">×</button>
        </div>
      </Item>
      <Item id="E8" caption="CartDrawer drawer close">
        <div className="bg-produce p-3">
          <button className="text-paper/60 hover:text-paper text-2xl leading-none">×</button>
        </div>
      </Item>
      <Item id="E9" caption="list.tsx remove entry (/60)">
        <button className="text-ink-soft/60 hover:text-sale text-lg leading-none">×</button>
      </Item>
      <Item id="E10" caption="CartDrawer remove entry (/50 — nearly E9)">
        <button className="text-ink-soft/50 hover:text-sale text-lg leading-none">×</button>
      </Item>
      <Item id="E11" caption="ImageLightbox close (bordered icon button — structurally different)">
        <button className="w-8 h-8 flex items-center justify-center rounded-sm bg-paper/90 text-ink-soft hover:text-ink font-mono text-lg transition-colors">
          ×
        </button>
      </Item>
    </Gallery>
  ),
};

// ── Role F — outside the system entirely ────────────────────────────
export const F_OutsideSystem: Story = {
  name: "F — Outside the system (1 variant)",
  render: () => (
    <Gallery>
      <Item id="F1" caption="MelonCorner “Slice me →” — hand-reimplements the pre-migration .brut hover-grow shadow from scratch">
        <div className="w-[150px] group">
          <div className="relative border-2 border-ink bg-card shadow-[4px_4px_0_var(--color-shadow)] transition-all group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-[7px_7px_0_var(--color-shadow)]">
            <div className="h-16 bg-ink/10" />
            <div className="border-t-2 border-ink px-2 py-1 font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink text-center">
              Slice me →
            </div>
          </div>
        </div>
      </Item>
    </Gallery>
  ),
};

// ── Role G — found during the completeness re-sweep ──────────────────
// A-F above were the original audit. These are real clickable elements
// that pass had zero coverage of — either a plain grep for `<button`/
// `<Link`/`<a ` doesn't catch every call site (a tag that wraps to a
// new line before its first attribute reads as a miss for `<a `), or
// the element just never got looked at. Verified by file:line against
// the live source, not carried over from memory.
export const G_FoundInResweep: Story = {
  name: "G — Found in completeness re-sweep (8 variants)",
  render: () => (
    <Gallery>
      <Item id="G1" caption="DealsSidebar Card() collapsible header — ± indicator, aria-expanded">
        <button className="w-full flex items-center justify-between gap-2 font-mono font-bold text-[13px] text-ink hover:text-sale transition-colors">
          <span>Categories <span className="font-mono text-[12px] text-ink-soft">(4)</span></span>
          <span aria-hidden className="font-mono text-[14px] leading-none">−</span>
        </button>
      </Item>
      <Item id="G2" caption="DealsSidebar “Clear filters (n)”">
        <button className="w-full mt-4 text-[12px] font-mono font-bold uppercase tracking-[0.1em] px-2 py-1.5 border-2 border-ink bg-tag/85 backdrop-blur-sm text-ink hover:bg-tag/60 transition-colors">
          Clear filters (3)
        </button>
      </Item>
      <Item id="G3" caption="DealsSidebar sort-direction toggle">
        <button className="w-full text-[12px] font-mono font-bold px-2 py-1 border-2 border-ink bg-paper/85 backdrop-blur-sm text-ink hover:bg-tag/30 transition-colors">
          ↑ Cheapest first
        </button>
      </Item>
      <Item id="G4" caption="ImageLightbox zoom-in trigger — the image itself, distinct from its close button (E11)">
        <button className="cursor-zoom-in block w-20 h-20 bg-card border-2 border-ink/15" aria-label="Expand image">
          <span className="flex items-center justify-center w-full h-full text-ink-soft/50 text-[10px] font-mono">🍉 img</span>
        </button>
      </Item>
      <Item id="G5" caption="toast.tsx action button — distinct from its dismiss × (E7)">
        <div className="bg-produce p-3">
          <button className="font-mono text-[11px] uppercase tracking-[0.12em] text-tag hover:text-paper px-2 py-1 rounded-sm transition-colors">
            View list
          </button>
        </div>
      </Item>
      <Item id="G6" caption="login “Sign in / Create account” mode toggle — same shape as C6, independent call site">
        <div className="w-56 flex border-2 border-ink p-1 bg-paper">
          <button className="flex-1 text-[12px] font-mono font-bold py-1.5 transition-colors bg-produce text-paper">
            Sign in
          </button>
          <button className="flex-1 text-[12px] font-mono font-bold py-1.5 transition-colors text-ink-soft hover:text-ink">
            Create account
          </button>
        </div>
      </Item>
      <Item id="G7" caption="MelonHero “See today’s deals” scroll-cue — an <a>, missed by a `<a ` grep since the tag wraps before its first attribute">
        <div className="p-4 bg-[radial-gradient(circle,var(--color-hero-from),var(--color-hero-via),var(--color-hero-to))]">
          <a href="#deals" className="flex flex-col items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-white/85 hover:text-white transition-colors">
            See today&apos;s deals
          </a>
        </div>
      </Item>
      <Item id="G8" caption="TripIntro “Start planning” scroll-cue — byte-identical classes to G7, different file">
        <div className="p-4 bg-[radial-gradient(circle,var(--color-hero-from),var(--color-hero-via),var(--color-hero-to))]">
          <a href="#plan" className="flex flex-col items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-white/85 hover:text-white transition-colors">
            Start planning
          </a>
        </div>
      </Item>
    </Gallery>
  ),
};

// ── Role H — Saved trip plans (new feature) ──────────────────────────
// Most of this feature's buttons are straight reuses of B1/E5/E9/E10
// (see BUTTON_AUDIT.md's "Used in" lists) — H1 is the one genuinely new
// treatment it introduced.
export const H_SavedPlans: Story = {
  name: "H — Saved trip plans (1 new variant)",
  render: () => (
    <Gallery>
      <Item id="H1" caption="CartDrawer PlanRow name/date/stats block — a two-line nav trigger, not a Link (it closes the drawer first)">
        <div className="w-64 bg-paper p-2">
          <button type="button" className="flex-1 min-w-0 text-left group/plan">
            <span className="block text-sm text-ink font-medium truncate group-hover/plan:text-sale transition-colors">
              Weekly shop <span className="font-mono text-[11px] text-ink-soft font-normal ml-1.5">Aug 3</span>
            </span>
            <span className="block font-mono text-[11px] text-ink-soft/80 truncate">
              6 items · $42.10
            </span>
          </button>
        </div>
      </Item>
    </Gallery>
  ),
};
