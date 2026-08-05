"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount } from "./account";
import { fetchCart, syncCart, type CartApiItem } from "./api";
import { useToast } from "./toast";

const BASE_KEY = "flippwatch-cart-v2";
const LEGACY_KEY = "flippwatch-cart"; // v1: plain string[], pre-dates both v2 and per-identity scoping

export type CartSource = {
  itemId: number;
  merchantId: number;
  merchantName: string;
  price: number; // price at the moment the item was added
  image: string | null;
};

export type CartEntry = {
  id: string;
  query: string; // normalized; drives the optimizer and dedupe
  label: string; // what the user sees
  source?: CartSource; // present when added from a specific deal
  addedAt: number;
};

type State = { entries: CartEntry[] };

type Action =
  | { type: "HYDRATE"; entries: CartEntry[] }
  | { type: "ADD"; entry: CartEntry }
  | { type: "REMOVE"; query: string }
  | { type: "RESTORE"; entries: CartEntry[] }
  | { type: "CLEAR" };

const normalize = (name: string) => name.trim().toLowerCase();

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE":
      return { entries: action.entries };
    case "ADD":
      if (state.entries.some((e) => e.query === action.entry.query)) return state;
      return { entries: [...state.entries, action.entry] };
    case "REMOVE":
      return { entries: state.entries.filter((e) => e.query !== action.query) };
    case "RESTORE": {
      const existing = new Set(state.entries.map((e) => e.query));
      const restored = action.entries.filter((e) => !existing.has(e.query));
      if (restored.length === 0) return state;
      // Keep original ordering: restored entries sort back in by addedAt.
      return {
        entries: [...state.entries, ...restored].sort((a, b) => a.addedAt - b.addedAt),
      };
    }
    case "CLEAR":
      return { entries: [] };
  }
}

function isValidEntry(x: unknown): x is CartEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.query === "string" &&
    typeof e.label === "string" &&
    typeof e.addedAt === "number"
  );
}

function keyFor(identity: string): string {
  return `${BASE_KEY}:${identity}`;
}

/**
 * Load one identity's LOCAL cart ("anon", or a signed-in identity's own
 * pre-server-sync bucket — see the one-time upgrade in CartProvider). On
 * that identity's very first load (no scoped key yet), migrates
 * whatever's sitting in the pre-scoping unscoped v2 key, or the legacy
 * v1 key — attributed to whoever's active the first time this runs,
 * then removed so it's never migrated a second time into a different
 * identity later.
 */
function load(identity: string): CartEntry[] {
  const scopedKey = keyFor(identity);
  try {
    const rawScoped = window.localStorage.getItem(scopedKey);
    if (rawScoped) {
      const parsed = JSON.parse(rawScoped);
      return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
    }

    const rawUnscoped = window.localStorage.getItem(BASE_KEY);
    if (rawUnscoped) {
      const parsed = JSON.parse(rawUnscoped);
      const migrated = Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
      window.localStorage.removeItem(BASE_KEY);
      if (migrated.length > 0) window.localStorage.setItem(scopedKey, JSON.stringify(migrated));
      return migrated;
    }

    const rawV1 = window.localStorage.getItem(LEGACY_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      const now = Date.now();
      const migrated: CartEntry[] = Array.isArray(parsed)
        ? parsed
            .filter((x): x is string => typeof x === "string")
            .map((name, i) => ({
              id: newId(),
              query: normalize(name),
              label: normalize(name),
              addedAt: now + i, // preserve original order
            }))
        : [];
      window.localStorage.removeItem(LEGACY_KEY);
      if (migrated.length > 0) window.localStorage.setItem(scopedKey, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // fall through to empty
  }
  return [];
}

function toApiItem(entry: CartEntry): CartApiItem {
  return {
    query: entry.query,
    label: entry.label,
    item_id: entry.source?.itemId ?? null,
    merchant_id: entry.source?.merchantId ?? null,
    merchant_name: entry.source?.merchantName ?? null,
    price: entry.source?.price ?? null,
    image: entry.source?.image ?? null,
    added_at: entry.addedAt,
  };
}

/** No client id comes back from the server (dedupe is by query, not id —
 *  see the reducer above), so `query` itself is used as a stable key. */
function fromApiItem(item: CartApiItem): CartEntry {
  const hasSource =
    item.item_id != null && item.merchant_id != null && item.merchant_name != null && item.price != null;
  return {
    id: item.query,
    query: item.query,
    label: item.label,
    source: hasSource
      ? {
          itemId: item.item_id as number,
          merchantId: item.merchant_id as number,
          merchantName: item.merchant_name as string,
          price: item.price as number,
          image: item.image,
        }
      : undefined,
    addedAt: item.added_at,
  };
}

type CartContextValue = {
  entries: CartEntry[];
  count: number;
  has: (name: string) => boolean;
  /** Add by display name; `source` records which deal it came from. */
  add: (name: string, source?: CartSource) => CartEntry | null;
  /** Remove by name/query; returns the removed entry so callers can offer undo. */
  remove: (name: string) => CartEntry | null;
  /** Put previously removed entries back (undo). */
  restore: (entries: CartEntry | CartEntry[]) => void;
  /** Empty the list; returns what was removed so callers can offer undo. */
  clear: () => CartEntry[];
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/**
 * The grocery list. Structured entries (not bare strings) so the cart
 * remembers which deal an item came from and at what price.
 *
 * Anonymous ("anon" identity): unchanged localStorage, one bucket for
 * signed-out browsing, synced across tabs via the `storage` event.
 *
 * Signed in (`u<id>` identity): a real account-level cart — GET/PUT
 * `/cart` (see lib/api.ts, backend/routes/cart.py) instead of
 * localStorage, so it survives across devices/browsers, not just this
 * one. The FIRST time a signed-in identity's server cart comes back
 * empty, this checks for that identity's own pre-existing local bucket
 * (from before server-backed carts shipped) and uploads it once, so
 * nobody's current cart silently vanished the day this landed.
 *
 * Either way: no merge on sign-in — a signed-out visitor's local cart is
 * simply left behind when they sign in, per product decision. Sync
 * failures toast an error and leave local state as-is; no rollback UI.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: accountLoading } = useAccount();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(reducer, { entries: [] });
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  // Set right before a HYDRATE-triggered entries change, so the persist
  // effect below can tell "this change is the load itself" apart from
  // "the user actually did something" — without it, the persist effect
  // (which also depends on `identity`) can fire on the same render as a
  // fresh hydrate, before the dispatched HYDRATE has actually applied,
  // and write/sync the OUTGOING identity's stale entries under the
  // INCOMING identity.
  const suppressPersist = useRef(false);

  const identity = accountLoading ? null : user ? `u${user.id}` : "anon";

  useEffect(() => {
    if (identity === null) return;
    suppressPersist.current = true;

    if (identity === "anon") {
      dispatch({ type: "HYDRATE", entries: load(identity) });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        let serverItems = await fetchCart();
        if (serverItems.length === 0) {
          const localEntries = load(identity);
          if (localEntries.length > 0) {
            serverItems = await syncCart(localEntries.map(toApiItem));
            try {
              window.localStorage.removeItem(keyFor(identity));
            } catch {
              // not critical — worst case this migration is retried next load
            }
          }
        }
        if (!cancelled) dispatch({ type: "HYDRATE", entries: serverItems.map(fromApiItem) });
      } catch {
        if (!cancelled) {
          toast("Couldn't load your cart — try again");
          dispatch({ type: "HYDRATE", entries: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  useEffect(() => {
    if (identity === null) return;
    if (suppressPersist.current) {
      suppressPersist.current = false;
      return;
    }
    if (identity === "anon") {
      try {
        window.localStorage.setItem(keyFor(identity), JSON.stringify(state.entries));
      } catch {
        // storage unavailable — cart still works in-memory for the session
      }
      return;
    }
    syncCart(state.entries.map(toApiItem)).catch(() => {
      toast("Couldn't save your cart — try again");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.entries, identity]);

  // Cross-tab sync only applies to the anon/local path — a signed-in
  // cart's "another tab changed it" equivalent is just the next PUT
  // winning (last write wins, by design, per the whole-list replace).
  useEffect(() => {
    if (identity !== "anon") return;
    const key = keyFor(identity);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      suppressPersist.current = true;
      dispatch({ type: "HYDRATE", entries: load(identity) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [identity]);

  const has = useCallback(
    (name: string) => state.entries.some((e) => e.query === normalize(name)),
    [state.entries],
  );

  const add = useCallback(
    (name: string, source?: CartSource): CartEntry | null => {
      const query = normalize(name);
      if (!query) return null;
      const entry: CartEntry = {
        id: newId(),
        query,
        label: name.trim(),
        source,
        addedAt: Date.now(),
      };
      dispatch({ type: "ADD", entry });
      return entry;
    },
    [],
  );

  const remove = useCallback(
    (name: string): CartEntry | null => {
      const query = normalize(name);
      const entry = state.entries.find((e) => e.query === query) ?? null;
      if (entry) dispatch({ type: "REMOVE", query });
      return entry;
    },
    [state.entries],
  );

  const restore = useCallback((entries: CartEntry | CartEntry[]) => {
    dispatch({ type: "RESTORE", entries: Array.isArray(entries) ? entries : [entries] });
  }, []);

  const clear = useCallback((): CartEntry[] => {
    const removed = state.entries;
    dispatch({ type: "CLEAR" });
    return removed;
  }, [state.entries]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <CartContext.Provider
      value={{
        entries: state.entries,
        count: state.entries.length,
        has,
        add,
        remove,
        restore,
        clear,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
