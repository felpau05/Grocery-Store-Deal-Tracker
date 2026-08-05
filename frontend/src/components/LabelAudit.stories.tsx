import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import GlassCard, { GLASS_SURFACE_DENSE } from "./GlassCard";

/**
 * Visual companion to LABEL_AUDIT.md (frontend/) — every distinct
 * non-clickable UI text treatment (stamps, eyebrows, pills/badges)
 * currently in the app, rendered side by side and labeled with its
 * audit ID. Cross-reference the .md for file:line.
 *
 * Same rules as ButtonAudit.stories.tsx (Audit/Buttons): a literal
 * copy of a real call site's classes, shown here because it's
 * currently DIFFERENT from its neighbors — not a recommendation.
 * Buttons/links live in ButtonAudit.stories.tsx; this file is only
 * the non-clickable half.
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

/** Same coral backdrop ButtonAudit uses, for the same reason — a couple
 *  of these (the stamps) really do render straight on the page gradient
 *  with no card behind them. Items that actually sit on a white/card
 *  surface nest their own GlassCard or bg-card wrapper below, same
 *  convention as ButtonAudit's D-role (header pills on dark glass). */
function Gallery({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-8 p-8 min-h-screen bg-[radial-gradient(circle,#ff9494,#ff7575,#ff3434)]">
      {children}
    </div>
  );
}

const meta: Meta = {
  title: "Audit/Labels",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

// ── Role LA — Stamps (.stamp, globals.css) ───────────────────────────
export const LA_Stamps: Story = {
  name: "LA — Stamp (3 variants)",
  render: () => (
    <Gallery>
      <Item id="LA1" caption=".stamp text-sale-dark — the shared, working treatment (6 call sites)">
        <div className="flex flex-wrap gap-3">
          <span className="stamp text-sale-dark text-lg">Something tore</span>
          <span className="stamp text-sale-dark text-lg">Sold out</span>
          <span className="stamp text-sale-dark text-[9px]">Expires today</span>
          <span className="stamp text-sale-dark text-sm">No deals found</span>
          <span className="stamp text-sale-dark text-sm">Deals unavailable</span>
          <span className="stamp text-sale-dark text-sm">Trip planner unavailable</span>
        </div>
      </Item>
      <Item id="LA2" caption="settings “Members only” — same .stamp class but text-sale, not text-sale-dark like every other one">
        <span className="stamp text-sale text-sm">Members only</span>
      </Item>
      <Item id="LA3" caption="list.tsx “PLAN” summary — .animate-stamp, a different class: a bordered box, not a text-only stamp">
        <div
          className="animate-stamp font-display text-produce border-[3px] border-produce px-3 py-1.5 text-center leading-none"
          aria-hidden
        >
          <div className="text-[10px] tracking-widest">PLAN</div>
          <div className="text-xl">3🛒</div>
        </div>
      </Item>
    </Gallery>
  ),
};

// ── Role LB — Eyebrows (small uppercase tracked mono micro-labels) ───
export const LB_Eyebrows: Story = {
  name: "LB — Eyebrow (12 variants, 6 different tracking values)",
  render: () => (
    <Gallery>
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-4 flex flex-col gap-3`}>
        <Item id="LB1" caption="DealsSidebar EYEBROW constant — shared, 4 call sites (Stores/Categories/etc. group headers)">
          <div className="font-mono font-bold text-[10px] uppercase tracking-[0.14em] text-ink-soft">Stores</div>
        </Item>
        <Item id="LB2" caption="DealCard merchant name — byte-identical string to LB1, hand-rolled instead of importing EYEBROW">
          <div className="font-mono font-bold text-[10px] uppercase tracking-[0.14em] text-ink-soft">No Frills</div>
        </Item>
        <Item id="LB3" caption="item/[id] DetailRow label — tracking-[0.15em], text-[11px]">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-soft">Category</span>
        </Item>
        <Item id="LB4" caption="item/[id] brands line — same size/tracking as LB3, different call site">
          <p className="font-mono font-bold text-[11px] uppercase tracking-[0.15em] text-ink-soft">Kraft · Heinz</p>
        </Item>
        <Item id="LB5" caption="item/[id] “@ merchant” — text-[12px] tracking-[0.1em], different scale than LB3/LB4">
          <p className="font-mono font-bold text-[12px] uppercase tracking-[0.1em] text-ink-soft">@ No Frills</p>
        </Item>
        <Item id="LB6" caption="item/[id] “Original name” / “Description” — text-[10px] tracking-[0.15em]">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-soft">Original name</p>
        </Item>
        <Item id="LB7" caption="ReceiptCard “Stop #N” — text-[10px] tracking-[0.18em]">
          <div className="font-mono font-bold text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Stop #1 · 4 items
          </div>
        </Item>
        <Item id="LB8" caption="ReceiptCard “Subtotal” — font-bold but NOT font-mono, unlike every other eyebrow here">
          <span className="font-bold text-[11px] uppercase tracking-[0.18em] text-ink-soft">Subtotal</span>
        </Item>
        <Item id="LB9" caption="settings store-row status — text-[9px] tracking-[0.08em], the tightest/smallest of the set">
          <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-ink-soft">
            ● has deal data
          </span>
        </Item>
        <Item id="LB10" caption="list.tsx “Estimated total · mode” — text-[11px] tracking-[0.18em], same scale as LB7">
          <div className="font-mono font-bold text-[11px] uppercase tracking-[0.18em] text-ink-soft">
            Estimated total · cheapest
          </div>
        </Item>
        <Item id="LB11" caption="list.tsx swap-picks group label — text-ink (not -soft, unlike every other eyebrow), capitalize not uppercase">
          <p className="font-mono font-bold text-[11px] uppercase tracking-[0.15em] text-ink capitalize">▸ milk</p>
        </Item>
        <Item id="LB12" caption="login “or” divider — font-mono only, not font-bold like the rest">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">or</span>
        </Item>
      </GlassCard>
    </Gallery>
  ),
};

// ── Role LD — Entity name/title (the thing being labeled itself) ────
export const LD_NameTitle: Story = {
  name: "LD — Entity name/title (5 variants)",
  render: () => (
    <Gallery>
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-4 flex flex-col gap-3`}>
        <Item id="LD1" caption="settings store row — text-[13px] font-bold, not font-display, the only non-display-font name on this list">
          <span className="block text-[13px] font-bold text-ink truncate">Metro</span>
        </Item>
        <Item id="LD2" caption="DealCard deal name — font-display text-[15px]">
          <h3 className="font-display text-ink text-[15px] leading-tight">Kraft Peanut Butter 1kg</h3>
        </Item>
        <Item id="LD3" caption="ReceiptCard merchant name — font-display text-lg, no explicit weight beyond the font itself">
          <div className="font-display text-ink text-lg leading-tight">No Frills</div>
        </Item>
        <Item id="LD4" caption="CartDrawer entry label — text-sm font-medium capitalize, the only one that's neither font-display nor font-mono/bold">
          <span className="block text-sm text-ink font-medium capitalize truncate">whole milk</span>
        </Item>
        <Item id="LD5" caption="item/[id] page h1 — font-display text-2xl, the largest of the five">
          <h1 className="font-display text-ink text-2xl leading-[1.05]">Kraft Peanut Butter 1kg</h1>
        </Item>
      </GlassCard>
    </Gallery>
  ),
};

// ── Role LC — Pill / badge (colored fill, not clickable) ─────────────
export const LC_PillBadge: Story = {
  name: "LC — Pill / badge (3 variants)",
  render: () => (
    <Gallery>
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-4 flex flex-col gap-3`}>
        <Item id="LC1" caption="DealCard category pill — color keyed off CATEGORY_COLORS (4 distinct color pairs across ~19 categories)">
          <div className="flex gap-1.5">
            <span className="uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5 bg-sale/10 text-sale-dark">meat</span>
            <span className="uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5 bg-produce/10 text-produce">produce</span>
            <span className="uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5 bg-ink/5 text-ink-soft">dairy</span>
            <span className="uppercase tracking-[0.08em] text-[10px] px-1.5 py-0.5 bg-tag/30 text-ink-soft">bakery</span>
          </div>
        </Item>
        <Item id="LC2" caption="SiteHeader “example” tag — nested inside the postal-code chip, its own tiny badge">
          <span className="text-[9px] uppercase tracking-[0.08em] opacity-70 text-ink-soft">example</span>
        </Item>
        <Item id="LC3" caption="DealCard deal-o-meter score — emoji + text, no border/fill at all (a “badge” only by role, not by look)">
          <span className="text-[10px] font-mono font-bold uppercase text-ink-soft whitespace-nowrap">🟢 Great deal</span>
        </Item>
      </GlassCard>
    </Gallery>
  ),
};

// ── Role LF — Saved-plan meta text (new feature) ─────────────────────
// Added alongside saved/draft trip plans — a third category, neither
// eyebrow (not uppercase/tracked) nor pill (no fill): quiet descriptive
// text attached to a name.
export const LF_SavedPlanMeta: Story = {
  name: "LF — Saved-plan meta text (5 variants)",
  render: () => (
    <Gallery>
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-4 flex flex-col gap-3`}>
        <Item id="LF1" caption="CartDrawer PlanRow — name + date inline, date shown even though a name was given">
          <span className="block text-sm text-ink font-medium truncate">
            Weekly shop
            <span className="font-mono text-[11px] text-ink-soft font-normal ml-1.5">Aug 3</span>
          </span>
        </Item>
        <Item id="LF2" caption="/list saved-plan card — same name+date idea, date folded into the stats line below instead (LF4)">
          <div className="font-display text-ink text-base">Weekly shop</div>
        </Item>
        <Item id="LF3" caption="CartDrawer PlanRow stats — text-ink-soft/80, truncate">
          <span className="block font-mono text-[11px] text-ink-soft/80 truncate">6 items · $42.10</span>
        </Item>
        <Item id="LF4" caption="/list saved-plan card stats — no /80 opacity (unlike LF3), no truncate, same role">
          <div className="font-mono text-[11px] text-ink-soft">Aug 3 · 6 items · $42.10 · 3 stops</div>
        </Item>
        <Item id="LF5" caption="“Prices shown are as of this date…” — anon-only now (signed-in plans are priced fresh on every load), neither font-mono nor uppercase like every other label here">
          <p className="text-[11px] text-ink-soft/60">Prices shown are as of this date — click “Use this plan” for today’s.</p>
        </Item>
      </GlassCard>
    </Gallery>
  ),
};
