import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import type { DealStatus, Merchant, PriceUnit, SortDir, SortMode } from "@/lib/api";
import DealsSidebar from "./DealsSidebar";

const MERCHANTS: Merchant[] = [
  { id: 1, name: "Farm Boy" },
  { id: 2, name: "Food Basics" },
  { id: 3, name: "Loblaws" },
  { id: 4, name: "Walmart" },
];

const MERCHANT_COUNTS = new Map([[1, 83], [2, 252], [3, 226], [4, 794]]);

const CATEGORIES = ["produce", "dairy eggs", "beverages", "bakery", "household"];
const CATEGORY_COUNTS = new Map([
  ["produce", 198],
  ["dairy eggs", 153],
  ["beverages", 205],
  ["bakery", 100],
  ["household", 282],
]);

/**
 * Real `useState` for every piece of filter state, exactly like page.tsx
 * — checkboxes, sort toggles, and the price-range inputs are actually
 * interactive in the Storybook canvas, not static args. This is the
 * most useful way to verify the multi-select behavior (several stores
 * AND several categories checked at once) without spinning up the whole
 * deals page.
 */
function InteractiveSidebar({
  signedIn = false,
}: {
  signedIn?: boolean;
}) {
  const [selectedMerchantIds, setSelectedMerchantIds] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [priceUnits, setPriceUnits] = useState<PriceUnit[]>([]);
  const [status, setStatus] = useState<DealStatus>("all");
  const [expDays, setExpDays] = useState<number | null>(null);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");

  const advancedCount =
    (status !== "all" ? 1 : 0) +
    (expDays !== null ? 1 : 0) +
    (priceMin !== "" ? 1 : 0) +
    (priceMax !== "" ? 1 : 0) +
    (priceUnits.length > 0 ? 1 : 0);

  return (
    /* 280px — the same fixed rail width the deals page gives it. */
    <div className="w-[280px]">
      <DealsSidebar
        user={
          signedIn
            ? { id: 1, name: "Alex", email: null, postal_code: "K2J4G8", merchants: MERCHANTS }
            : null
        }
        pillMerchants={MERCHANTS}
        selectedMerchantIds={selectedMerchantIds}
        setSelectedMerchantIds={setSelectedMerchantIds}
        merchantCounts={MERCHANT_COUNTS}
        categories={CATEGORIES}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        categoryCounts={CATEGORY_COUNTS}
        sort={sort}
        setSort={setSort}
        sortDir={sortDir}
        setSortDir={setSortDir}
        priceUnits={priceUnits}
        setPriceUnits={setPriceUnits}
        status={status}
        setStatus={setStatus}
        expDays={expDays}
        setExpDays={setExpDays}
        priceMin={priceMin}
        setPriceMin={setPriceMin}
        priceMax={priceMax}
        setPriceMax={setPriceMax}
        advancedCount={advancedCount}
        onClearAdvanced={() => {
          setStatus("all");
          setExpDays(null);
          setPriceUnits([]);
          setPriceMin("");
          setPriceMax("");
        }}
      />
    </div>
  );
}

const meta = {
  title: "Components/DealsSidebar",
  component: InteractiveSidebar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof InteractiveSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Anonymous visitor — generic "Stores" heading, no "edit stores" link. */
export const Anonymous: Story = {
  args: {},
};

/** Signed in — heading becomes "Alex's stores", edit-stores link appears. */
export const SignedIn: Story = {
  args: { signedIn: true },
};
