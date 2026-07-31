import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Deal } from "@/lib/api";
import DealCard from "./DealCard";

const baseDeal: Deal = {
  item_id: 1,
  name: "Organic Bananas",
  brands: ["Chiquita"],
  category: "produce",
  subcategory: null,
  price: 2.49,
  price_unit: "each",
  price_per_unit: null,
  price_per_unit_label: null,
  size: null,
  size_unit: null,
  product_image: null,
  high_confidence: true,
  valid_from: "2026-07-28",
  valid_to: "2026-08-03",
  merchant_id: 1,
  merchant_name: "Farmers Market",
};

const meta = {
  title: "Components/DealCard",
  component: DealCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DealCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { deal: baseDeal },
};

export const WithImageAndSize: Story = {
  args: {
    deal: {
      ...baseDeal,
      name: "2% Milk",
      brands: ["Beatrice"],
      category: "dairy",
      price: 4.99,
      price_unit: "ml",
      price_per_unit: 2.5,
      price_per_unit_label: "L",
      size: 2000,
      size_unit: "ml",
      product_image: "https://placehold.co/128x128/f7faf0/14210f?text=Milk",
    },
  },
};

export const LowConfidencePrice: Story = {
  args: {
    deal: { ...baseDeal, high_confidence: false },
  },
};

export const ExpiringToday: Story = {
  args: {
    deal: { ...baseDeal, valid_to: new Date().toISOString().slice(0, 10) },
  },
};

export const GreatDeal: Story = {
  args: {
    deal: { ...baseDeal, price: 1.5, price_unit: "each", price_per_unit: 1.5, price_per_unit_label: "kg" },
    categoryAvgPerUnit: 3.0,
  },
};

export const PriceyDeal: Story = {
  args: {
    deal: { ...baseDeal, price: 5.5, price_unit: "each", price_per_unit: 5.5, price_per_unit_label: "kg" },
    categoryAvgPerUnit: 3.0,
  },
};
