const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Deal = {
  item_id: number;
  name: string;
  brands: string[];
  category: string | null;
  subcategory: string | null;
  price: number;
  price_unit: "g" | "ml" | "each";
  price_per_unit: number | null;
  price_per_unit_label: "kg" | "L" | null;
  size: number | null;
  size_unit: "g" | "ml" | null;
  product_image: string | null;
  high_confidence: boolean;
  valid_from: string;
  valid_to: string;
  merchant_id: number;
  merchant_name: string;
};

export type HistoryPoint = {
  price: number;
  scraped_at: string;
};

export type DealHistory = {
  item: {
    id: number;
    name: string;
    brands: string[];
    category: string | null;
    merchant_id: number;
    merchant_name: string;
    price: number;
    price_unit: string;
    price_per_unit: number | null;
    price_per_unit_label: "kg" | "L" | null;
    size: number | null;
    size_unit: string | null;
    product_image: string | null;
    cutout_image: string | null;
    valid_from: string;
    valid_to: string;
    high_confidence: boolean;
    original_name: string | null;
    original_description: string | null;
  };
  history: HistoryPoint[];
};

export type OptimizeMode = "cheapest" | "fewest";

export type PlanItem = {
  query: string;
  item_id: number;
  name: string;
  price: number;
};

export type StorePlan = {
  merchant_id: number;
  merchant_name: string;
  subtotal: number;
  items: PlanItem[];
};

export type OptimizeResult = {
  mode: OptimizeMode;
  total_cost: number;
  stops: number;
  unmatched: string[];
  store_plans: StorePlan[];
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("not_found");
    throw new Error(`Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`);
  return res.json();
}

export type Merchant = {
  id: number;
  name: string;
};

export type SortMode = "price" | "price_per_unit";
export type SortDir = "asc" | "desc";
export type PriceUnit = "g" | "ml" | "each";

export function fetchDeals(params: {
  q?: string;
  category?: string;
  merchantId?: number;
  status?: "active" | "upcoming" | "all";
  sort?: SortMode;
  sortDir?: SortDir;
  priceUnits?: PriceUnit[];
  limit?: number;
  offset?: number;
}): Promise<Deal[]> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.merchantId) search.set("merchant_id", String(params.merchantId));
  search.set("status", params.status ?? "active");
  search.set("sort", params.sort ?? "price");
  search.set("sort_dir", params.sortDir ?? "asc");
  (params.priceUnits ?? []).forEach((u) => search.append("price_units", u));
  search.set("limit", String(params.limit ?? 24));
  search.set("offset", String(params.offset ?? 0));
  return getJson<Deal[]>(`/deals?${search.toString()}`);
}

export function fetchCategories(): Promise<string[]> {
  return getJson<string[]>("/categories");
}

export function fetchMerchants(): Promise<Merchant[]> {
  return getJson<Merchant[]>("/merchants");
}

export function fetchDealHistory(itemId: number): Promise<DealHistory> {
  return getJson<DealHistory>(`/deals/${itemId}/history`);
}

export function optimizeTrip(
  groceryList: string[],
  mode: OptimizeMode,
): Promise<OptimizeResult> {
  return postJson<OptimizeResult>("/optimize", { grocery_list: groceryList, mode });
}
