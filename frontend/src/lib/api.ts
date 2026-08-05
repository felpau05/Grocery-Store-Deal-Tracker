const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Every request gets a hard timeout. Without one, a backend that's slow
// to answer (or a dropped socket) leaves the fetch promise pending
// forever — the UI hangs on "Connecting…" with no way to recover, and
// any retry logic above it never gets a rejection to act on. 15s is far
// longer than any healthy read/auth call yet short enough to fail fast.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
    price_unit: "g" | "ml" | "each";
    price_per_unit: number | null;
    price_per_unit_label: "kg" | "L" | null;
    size: number | null;
    size_unit: "g" | "ml" | null;
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

export type OptimizeOption = {
  item_id: number;
  name: string;
  merchant_id: number;
  merchant_name: string;
  price: number;
  size: number | null;
  size_unit: string | null;
  product_image: string | null;
};

export type OptimizeResult = {
  mode: OptimizeMode;
  total_cost: number;
  stops: number;
  unmatched: string[];
  store_plans: StorePlan[];
  /** query -> a few cheapest matching deals, for the swap/pick UI */
  options: Record<string, OptimizeOption[]>;
};

// Grocery data is live: it changes on every scrape and prune, so it must
// never be cached. Without `no-store`, a fetch from a Server Component
// goes through Next's Data Cache — which once cached the item pages'
// 404s during a DB re-scrape and kept serving them (a real "This deal is
// gone" bug on deals that exist). `no-store` makes every call hit the API.
async function getJson<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) throw new Error("not_found");
    throw new Error(`Request to ${path} failed (${res.status})`);
  }
  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`);
  return res.json();
}

export type Merchant = {
  id: number;
  name: string;
};

// ── Auth + private account ──────────────────────────────────────────
// Session is a Bearer JWT; the token lives in localStorage and every
// account request carries it. There is no way to read other accounts.

const TOKEN_KEY = "flippwatch-token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage unavailable — session lasts until reload
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type AccountMerchant = { id: number; name: string };

export type Account = {
  id: number;
  name: string;
  email: string | null;
  postal_code: string | null;
  merchants: AccountMerchant[];
};

/** A merchant with an active flyer at a postal code, live from Flipp. */
export type AvailableMerchant = {
  id: number;
  name: string;
  logo: string | null;
  is_grocery: boolean;
  tracked: boolean;
};

export type Meta = {
  default_postal_code: string | null;
  google_auth_enabled: boolean;
};

export function fetchMeta(): Promise<Meta> {
  return getJson<Meta>("/meta");
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(`${API_URL}${path}`, init);
  if (!res.ok) {
    let detail = `Request to ${path} failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {}
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export function signup(
  name: string,
  email: string,
  password: string,
): Promise<{ token: string; user: Account }> {
  return authRequest("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
}

export function login(
  email: string,
  password: string,
): Promise<{ token: string; user: Account }> {
  return authRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe(): Promise<Account> {
  return authRequest("/me", { headers: authHeaders() });
}

export function updateMyPreferences(prefs: {
  postal_code?: string;
  merchants?: AccountMerchant[];
}): Promise<Account & { scrape_started: boolean }> {
  return authRequest("/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(prefs),
  });
}

export type ScrapeStatus = {
  running: boolean;
  postal_code: string | null;
  merchant_count: number | null;
  started_at: string | null;
  finished_at: string | null;
  ok: boolean | null;
  error: string | null;
  items_scraped: number | null;
};

export function fetchScrapeStatus(): Promise<ScrapeStatus> {
  return authRequest("/scrape/status", { headers: authHeaders() });
}

export const googleLoginUrl = `${API_URL}/auth/google/login`;

export function fetchAvailableMerchants(postalCode: string): Promise<AvailableMerchant[]> {
  return getJson<AvailableMerchant[]>(
    `/merchants/available?postal_code=${encodeURIComponent(postalCode)}`,
  );
}

export type SortMode = "price" | "price_per_unit";
export type SortDir = "asc" | "desc";
export type PriceUnit = "g" | "ml" | "each";
export type DealStatus = "active" | "upcoming" | "all";

type DealFilterParams = {
  q?: string;
  /** Multi-select — any deal matching one or more of these categories. */
  categories?: string[];
  merchantId?: number;
  /** Restrict to the account's chosen stores */
  merchantIds?: number[];
  /** Region scope — the account's postal code, or omit for the example area */
  postalCode?: string;
  status?: DealStatus;
  priceUnits?: PriceUnit[];
  /** Only deals ending within N days (0 = ends today) */
  expiresWithinDays?: number;
  priceMin?: number;
  priceMax?: number;
};

function dealFilterParams(params: DealFilterParams): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  (params.categories ?? []).forEach((c) => search.append("categories", c));
  if (params.merchantId) search.set("merchant_id", String(params.merchantId));
  (params.merchantIds ?? []).forEach((m) => search.append("merchant_ids", String(m)));
  if (params.postalCode) search.set("postal_code", params.postalCode);
  search.set("status", params.status ?? "active");
  (params.priceUnits ?? []).forEach((u) => search.append("price_units", u));
  if (params.expiresWithinDays !== undefined) {
    search.set("expires_within_days", String(params.expiresWithinDays));
  }
  if (params.priceMin !== undefined) search.set("price_min", String(params.priceMin));
  if (params.priceMax !== undefined) search.set("price_max", String(params.priceMax));
  return search;
}

export function fetchDeals(
  params: DealFilterParams & {
    sort?: SortMode;
    sortDir?: SortDir;
    limit?: number;
    offset?: number;
  },
): Promise<Deal[]> {
  const search = dealFilterParams(params);
  search.set("sort", params.sort ?? "price");
  search.set("sort_dir", params.sortDir ?? "asc");
  search.set("limit", String(params.limit ?? 24));
  search.set("offset", String(params.offset ?? 0));
  return getJson<Deal[]>(`/deals?${search.toString()}`);
}

export type DealFacets = {
  total: number;
  categories: { name: string; count: number }[];
  merchants: { id: number; count: number }[];
};

/** Item counts for the category/store pills, plus the exact total
 * matching the current filters — powers real (not guessed) pagination. */
export function fetchDealFacets(params: DealFilterParams): Promise<DealFacets> {
  const search = dealFilterParams(params);
  return getJson<DealFacets>(`/deals/facets?${search.toString()}`);
}

type ScopeParams = { merchantId?: number; merchantIds?: number[]; postalCode?: string };

function scopeParams(scope?: ScopeParams): string {
  const search = new URLSearchParams();
  if (scope?.merchantId) search.set("merchant_id", String(scope.merchantId));
  (scope?.merchantIds ?? []).forEach((m) => search.append("merchant_ids", String(m)));
  if (scope?.postalCode) search.set("postal_code", scope.postalCode);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Categories present in the given region + store scope — omit all to
 * get the example-data default (never the whole database; see backend). */
export function fetchCategories(scope?: ScopeParams): Promise<string[]> {
  return getJson<string[]>(`/categories${scopeParams(scope)}`);
}

/** Merchants with active items in the given region + store scope —
 * same default-data rule as fetchCategories. */
export function fetchMerchants(scope?: ScopeParams): Promise<Merchant[]> {
  return getJson<Merchant[]>(`/merchants${scopeParams(scope)}`);
}

export function fetchDealHistory(itemId: number): Promise<DealHistory> {
  return getJson<DealHistory>(`/deals/${itemId}/history`);
}

export function optimizeTrip(
  groceryList: string[],
  mode: OptimizeMode,
  merchantIds?: number[],
  postalCode?: string,
): Promise<OptimizeResult> {
  return postJson<OptimizeResult>("/optimize", {
    grocery_list: groceryList,
    mode,
    merchant_ids: merchantIds ?? null,
    postal_code: postalCode ?? null,
  });
}

// ── Signed-in cart + saved trip plans ────────────────────────────────
// Anonymous visitors never call these — lib/cart.tsx and lib/plans.tsx
// keep a local-only cart/plans for them instead. Wire shape is snake_case
// straight off the backend (see backend/routes/cart.py), same convention
// as every other type in this file — conversion to the app's camelCase
// CartEntry/SavedPlan runtime shapes happens in cart.tsx/plans.tsx, not here.

export type CartApiItem = {
  query: string;
  label: string;
  item_id: number | null;
  merchant_id: number | null;
  merchant_name: string | null;
  price: number | null;
  image: string | null;
  added_at: number; // ms epoch
};

export function fetchCart(): Promise<CartApiItem[]> {
  return authRequest("/cart", { headers: authHeaders() });
}

export function syncCart(items: CartApiItem[]): Promise<CartApiItem[]> {
  return authRequest("/cart", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(items),
  });
}

export type SavedPlanApi = {
  id: number;
  name: string | null;
  updated_at: number; // ms epoch
  mode: OptimizeMode;
  queries: string[];
  picks: Record<string, number>;
  total_cost: number;
  stops: number;
  item_count: number;
  plans: StorePlan[];
};

export function fetchSavedPlans(): Promise<SavedPlanApi[]> {
  return authRequest("/trip-plans", { headers: authHeaders() });
}

export function createSavedPlan(input: {
  name: string | null;
  mode: OptimizeMode;
  items: { query: string; item_id: number }[];
}): Promise<SavedPlanApi> {
  return authRequest("/trip-plans", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
}

export function deleteSavedPlan(id: number): Promise<{ ok: boolean }> {
  return authRequest(`/trip-plans/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}
