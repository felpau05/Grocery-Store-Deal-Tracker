import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import PriceTag from "./PriceTag";

const meta = {
  title: "Components/PriceTag",
  component: PriceTag,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof PriceTag>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Price in `ink`, per-unit line small and `ink-muted` under it. No
 *  sticker, no rotation, no punch-hole — the whole thing is two lines of
 *  type now, and it still says everything it used to say. */
export const Default: Story = {
  args: {
    price: 4.99,
    priceUnit: "g",
    perUnit: 2.5,
    perUnitLabel: "kg",
    highConfidence: true,
  },
};

/** No per-unit figure to show, because there's no size to divide by — the
 *  top label covers both jobs ("Price / Unit Price") and there's no
 *  second line. */
export const EachUnit: Story = {
  args: {
    price: 12.0,
    priceUnit: "each",
    perUnit: null,
    perUnitLabel: null,
    highConfidence: true,
  },
};

/** `high_confidence: false` — the flyer parser wasn't sure. A muted `~`
 *  plus a softer ink across the whole figure, rather than a badge
 *  announcing the uncertainty louder than the price itself. */
export const LowConfidence: Story = {
  args: {
    price: 7.49,
    priceUnit: "ml",
    perUnit: 3.75,
    perUnitLabel: "L",
    highConfidence: false,
  },
};

/** Tabular figures, checked the only way that matters: stacked. Decimal
 *  points line up down a column of cards regardless of digit count. */
export const Column: Story = {
  args: { price: 4.99, priceUnit: "g", perUnit: 2.5, perUnitLabel: "kg" },
  render: () => (
    <div className="flex flex-col gap-5 bg-surface p-6">
      <PriceTag price={0.78} priceUnit="g" perUnit={1.72} perUnitLabel="kg" />
      <PriceTag price={12.99} priceUnit="g" perUnit={38.83} perUnitLabel="kg" />
      <PriceTag price={4.5} priceUnit="each" perUnit={null} perUnitLabel={null} />
      <PriceTag price={109.0} priceUnit="each" perUnit={null} perUnitLabel={null} highConfidence={false} />
    </div>
  ),
};
