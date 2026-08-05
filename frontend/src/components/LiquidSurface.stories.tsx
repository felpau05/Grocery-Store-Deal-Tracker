import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import LiquidSurface from "./LiquidSurface";

/**
 * Smoke coverage, not a visual test: none of the four raw-WebGL liquid
 * surfaces (HeaderLiquid, PageLiquid, TripIntro, LiquidSurface) had any
 * Storybook coverage before this. This doesn't validate the rendered
 * gradient looks right — it validates that mounting, and Strict Mode's
 * mount/unmount/remount, don't hit a poisoned-context error out of
 * `lib/liquidRunner.ts`'s `createManagedCanvas`/`startCappedLoop`
 * (exactly the class of bug their own destroy()/loseContext() dance
 * exists to prevent — see the comments there).
 */
const meta = {
  title: "Components/LiquidSurface",
  component: LiquidSurface,
  parameters: { layout: "fullscreen" },
  decorators: [
    // LiquidSurface's own className prop expects a positioned ancestor
    // it can fill (its doc comment: "must be a positioned box the
    // canvas can fill") — this stands in for the real caller's own
    // `relative h-screen` section (see HeroLiquid.tsx).
    (Story) => (
      <div className="relative w-full h-64 bg-black">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiquidSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The same stops/settings HeroLiquid actually uses in the app. */
export const Default: Story = {
  args: {
    stops: {
      from: { varName: "--color-hero-from", fallback: [1.0, 0.58, 0.58] },
      via: { varName: "--color-hero-via", fallback: [1.0, 0.46, 0.46] },
      to: { varName: "--color-hero-to", fallback: [1.0, 0.2, 0.2] },
    },
    octaves: 3,
    warps: 2,
    scale: 2.6,
    speed: 0.055,
    highlight: 0.3,
    texelScale: 0.5,
    fps: 30,
    className: "absolute inset-0 w-full h-full",
  },
};
