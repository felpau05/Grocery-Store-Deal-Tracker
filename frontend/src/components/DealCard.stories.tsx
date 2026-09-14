import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ComponentType } from "react";
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
  product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Bananas",
  high_confidence: true,
  valid_from: "2026-07-28",
  valid_to: "2026-08-03",
  merchant_id: 1,
  merchant_name: "Farmers Market",
};

/**
 * A pale-green ground at roughly one real grid column (320px ≈ a third
 * of the deals page's content area at 1440px), so the image well and the
 * two-line name clamp behave here the way they do in the app.
 *
 * This used to be a hot coral radial gradient, which was the right call
 * when the card was translucent glass over a coral page and Storybook's
 * white canvas hid the frosting. The card is opaque white on a pale page
 * now, so the honest backdrop is a quiet one — and the entire point of
 * the redesign is how the card reads when nothing is fighting it.
 *
 * It's per-story rather than on `meta` so `Grid` below can opt out and
 * be wider than a single column.
 */
const column = (Story: ComponentType) => (
  <div className="w-[320px] bg-surface-3 p-8">
    <Story />
  </div>
);

const meta = {
  title: "Components/DealCard",
  component: DealCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof DealCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { deal: baseDeal },
  decorators: [column],
};

/** The card's premise: a per-unit price you can compare across stores.
 *  Everything else the card used to print about this item — 2 L, the
 *  brand, the category, the expiry date — is one click away now. */
export const WithPerUnitPrice: Story = {
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
      product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Milk",
    },
  },
  decorators: [column],
};

/** Parser wasn't sure of the price: a muted `~` and a softer ink for the
 *  whole figure. No badge, no second thing to read. */
export const LowConfidencePrice: Story = {
  args: { deal: { ...baseDeal, high_confidence: false } },
  decorators: [column],
};

/** The one fact that survived the expiry cull, because it's the one that
 *  changes whether you act today. Anything further out than tomorrow
 *  renders nothing at all — see `Default`. */
export const EndsToday: Story = {
  args: { deal: { ...baseDeal, valid_to: new Date().toISOString().slice(0, 10) } },
  decorators: [column],
};

/** `product_image` is nullable and flyer image URLs do 404. The well
 *  keeps its height and shows a neutral placeholder rather than
 *  collapsing, so a grid row stays a grid row. */
export const NoImage: Story = {
  args: { deal: { ...baseDeal, name: "Store Brand Sandwich Bread", product_image: null } },
  decorators: [column],
};

/** Real flyer names run to 97 characters. The name clamps at two lines
 *  and the price row below it stays put. */
export const LongName: Story = {
  args: {
    deal: {
      ...baseDeal,
      name: "Maple Leaf Natural Selections Shaved Deli Roast Beef or Smoked Turkey Breast, Assorted",
      price: 6.99,
      price_unit: "g",
      price_per_unit: 38.83,
      price_per_unit_label: "kg",
      product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Deli",
    },
  },
  decorators: [column],
};

/** The actual test of this component: nine at once, which is how anyone
 *  ever sees it. A card that's too loud only shows up here, never in
 *  isolation — the old one looked defensible one at a time. */
export const Grid: Story = {
  args: { deal: baseDeal },
  parameters: { layout: "fullscreen" },
  render: () => {
    const deals: Deal[] = [
      baseDeal,
      { ...baseDeal, item_id: 2, name: "2% Milk", price: 4.99, price_per_unit: 2.5, price_per_unit_label: "L", merchant_name: "Food Basics", product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Milk" },
      { ...baseDeal, item_id: 3, name: "Green Cabbage", price: 0.78, price_per_unit: 1.72, price_per_unit_label: "kg", merchant_name: "Walmart", product_image: null },
      { ...baseDeal, item_id: 4, name: "Maple Leaf Natural Selections Shaved Deli Roast Beef or Smoked Turkey Breast", price: 6.99, price_per_unit: 38.83, price_per_unit_label: "kg", merchant_name: "Metro", product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Deli" },
      { ...baseDeal, item_id: 5, name: "Special Kitty Pâté Wet Cat Food Singles", price: 0.8, high_confidence: false, merchant_name: "Walmart", product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Cat+Food" },
      { ...baseDeal, item_id: 6, name: "Dinnerware", price: 0.75, merchant_name: "Walmart", valid_to: new Date().toISOString().slice(0, 10), product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Plates" },
      { ...baseDeal, item_id: 7, name: "Red Seedless Grapes", price: 3.49, price_per_unit: 7.69, price_per_unit_label: "kg", merchant_name: "Farm Boy", product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Grapes" },
      { ...baseDeal, item_id: 8, name: "Pen+Gear Report Cover", price: 0.22, merchant_name: "Walmart", product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Folder" },
      { ...baseDeal, item_id: 9, name: "Aish Tamid Memorial Candle", price: 0.33, high_confidence: false, merchant_name: "Metro", product_image: "https://placehold.co/400x300/f7faf6/17211a?text=Candle" },
    ];
    return (
      <div className="bg-surface-3 p-8">
        <div className="grid grid-cols-3 gap-5">
          {deals.map((deal) => (
            <DealCard key={deal.item_id} deal={deal} />
          ))}
        </div>
      </div>
    );
  },
};
