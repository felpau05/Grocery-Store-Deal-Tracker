import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Link from "next/link";
import GlassCard, { GLASS_SURFACE } from "./GlassCard";

/* GlassCard's props are a discriminated union (`as?: "div"` vs
 * `as: typeof Link`, each pulling in that element's own real prop
 * type) — necessary for real callers (DealCard passes `as={Link}
 * href="…"` and gets that checked; see DealCard.tsx, already verified
 * working). Storybook's `Meta<typeof GlassCard>`/`StoryObj<>` don't
 * distribute over that union the way plain JSX usage does — even the
 * `Default` story below, which touches none of the `as`-specific
 * fields, fails to typecheck against the derived `Partial<...>` shape.
 * That's Storybook's generic prop-extraction machinery choking on the
 * union, not a bug in GlassCard itself or in these stories' args.
 *
 * `Meta`/`Story` are typed loosely here rather than fought into
 * shape — the same escape hatch GlassCard.tsx's own `Surface = (as ??
 * "div") as any` already takes for this identical root cause. Low risk
 * for a stories file specifically: human-reviewed, not shipped in the
 * app bundle, and every REAL call site (DealCard, DealsSidebar,
 * page.tsx) still gets full type-checking through GlassCardProps. */
const meta: Meta<typeof GlassCard> = {
  title: "Components/GlassCard",
  component: GlassCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    // Same reasoning as DealCard.stories.tsx's own decorator: the glass
    // effect (bg-card/90 + backdrop-blur) reads as a flat, barely
    // translucent card on Storybook's plain white canvas, so this stands
    // in for the colorful backgrounds it actually sits on in the app.
    (Story) => (
      <div className="w-80 p-8 bg-[radial-gradient(circle,#ff9494,#ff7575,#ff3434)]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<any>;

/** The default surface — GLASS_SURFACE, a plain div, no hover-lift.
 *  What DealsSidebar's cards and the account-nudge banners use. */
export const Default: Story = {
  args: {
    children: (
      <p className="text-ink text-sm">
        Sort by, Stores, Categories, and the account-nudge banners all use
        this exact surface.
      </p>
    ),
  },
};

/** The DealCard case: a Link, with the wrapper's own hover-lift on top
 *  of the ring's already-unconditional hover-grow. */
export const InteractiveLink: Story = {
  args: {
    as: Link,
    href: "#",
    interactive: true,
    surfaceClassName: `group block ${GLASS_SURFACE}`,
    children: <p className="text-ink text-sm font-bold">Hover to see the lift + glow ring grow.</p>,
  },
};

/** The search bar's case: a full custom surfaceClassName override, not
 *  an addition to GLASS_SURFACE — a stronger border, no white/40 glass
 *  border, asymmetric padding. */
export const CustomSurface: Story = {
  args: {
    surfaceClassName: "relative overflow-hidden bg-card/90 backdrop-blur-md border-2 border-ink px-4 py-3",
    children: <p className="text-ink text-sm">A fully custom surface, not merged with GLASS_SURFACE.</p>,
  },
};

/** A standalone primary-CTA button — Save my stores, Build my trip, Try
 *  again — wraps in `as="button"` with a `.glow-btn` surface instead of
 *  the old flat `.btn-brut` offset shadow. The ring behind it is the
 *  same `<LiquidGlow />` every deal card wears, not a shadow the button
 *  paints itself. */
export const StandaloneButton: Story = {
  args: {
    as: "button",
    surfaceClassName: "glow-btn px-5 py-2.5 bg-sale text-paper font-display text-sm",
    children: "Save my stores",
  },
};
