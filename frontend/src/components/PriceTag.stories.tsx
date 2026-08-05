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

export const Default: Story = {
  args: {
    price: 4.99,
    priceUnit: "g",
    perUnit: 2.5,
    perUnitLabel: "kg",
    highConfidence: true,
  },
};

export const EachUnit: Story = {
  args: {
    price: 12.0,
    priceUnit: "each",
    perUnit: null,
    perUnitLabel: null,
    highConfidence: true,
  },
};

export const LowConfidence: Story = {
  args: {
    price: 7.49,
    priceUnit: "ml",
    perUnit: 3.75,
    perUnitLabel: "L",
    highConfidence: false,
  },
};
