import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CartGlyph from "./CartGlyph";

const meta = {
  title: "Components/CartGlyph",
  component: CartGlyph,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof CartGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Large: Story = {
  args: { className: "w-12 h-12" },
};
