import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AddToListButton from "./AddToListButton";

const meta = {
  title: "Components/AddToListButton",
  component: AddToListButton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    name: "Organic Bananas",
  },
} satisfies Meta<typeof AddToListButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The item page's version: a labelled button. Accent fill to add,
 *  accent-soft tint with a tick once it's on the list. */
export const FullSize: Story = {};

/** The DealCard version: icon only, and recessed at rest — 75% opacity
 *  and a hairline outline, no label. On a 24-card grid a visible "+ Add"
 *  pill on every card is 24 things asking to be pressed. */
export const Compact: Story = {
  args: { compact: true },
};

/** The affordance only works in context, so: hover the card. The button
 *  comes to full opacity when the parent `.group` is hovered, and fills
 *  accent on its own hover or keyboard focus — the two variants touch
 *  different CSS properties on purpose (`group-hover` owns opacity,
 *  `hover`/`focus-visible` own colour) so they can't fight over which
 *  one wins. Tab to it to see the focus state. */
export const CompactInACard: Story = {
  args: { compact: true },
  render: (args) => (
    <div className="bg-surface-3 p-8">
      <div className="group w-[280px] rounded-card border border-line bg-surface p-4">
        <div className="mb-3 aspect-[4/3] rounded-control bg-surface-2" />
        <h3 className="font-display text-[15px] leading-snug text-ink">Organic Bananas</h3>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[20px] font-bold leading-none tracking-tight text-ink">$2.49</div>
            <p className="mt-2 text-[12px] text-ink-soft">Farmers Market</p>
          </div>
          <AddToListButton {...args} />
        </div>
      </div>
    </div>
  ),
  parameters: { layout: "fullscreen" },
};

export const CompactWithSource: Story = {
  args: {
    compact: true,
    source: {
      itemId: 1,
      merchantId: 1,
      merchantName: "Farmers Market",
      price: 2.49,
      image: null,
    },
  },
};
