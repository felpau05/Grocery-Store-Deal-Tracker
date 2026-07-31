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

export const FullSize: Story = {};

export const Compact: Story = {
  args: { compact: true },
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
