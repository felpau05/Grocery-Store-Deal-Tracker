import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import GlassCard from "@/components/GlassCard";
import { BTN_CART_ADD, BTN_FOLLOWUP_CTA, BTN_NUDGE_CTA, BTN_PRIMARY_CTA } from "./button";

/**
 * Not a component — these are plain class-string constants (same idea
 * as lib/chip.ts), so there's nothing to mount and no props to vary.
 * This is a visual reference sheet: every shared .btn-brut-ink/.glow-btn combination
 * side by side, so a new call site can eyeball whether one of these
 * already matches before writing a new inline combination.
 */
function ButtonSheet() {
  return (
    <div className="flex flex-col gap-4 p-8 bg-[radial-gradient(circle,#ff9494,#ff7575,#ff3434)]">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 mb-1">BTN_CART_ADD</p>
        <button className={BTN_CART_ADD}>Add</button>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 mb-1">BTN_FOLLOWUP_CTA</p>
        <button className={BTN_FOLLOWUP_CTA}>Retry</button>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 mb-1">BTN_NUDGE_CTA</p>
        <button className={BTN_NUDGE_CTA}>Sign up →</button>
      </div>
      <div className="w-64">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 mb-1">BTN_PRIMARY_CTA</p>
        {/* Unlike the other three, this one is always wrapped in
            <GlassCard as="button">, not used as a bare button className —
            .glow-btn paints no shadow of its own, the wrapper's
            LiquidGlow ring is the shadow. */}
        <GlassCard as="button" surfaceClassName={BTN_PRIMARY_CTA}>Sign in</GlassCard>
      </div>
    </div>
  );
}

const meta = {
  title: "Foundations/Button variants",
  component: ButtonSheet,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ButtonSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {};
