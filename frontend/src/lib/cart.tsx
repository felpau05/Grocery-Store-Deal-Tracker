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

const STORAGE_KEY = "flippwatch-cart-v2";
const LEGACY_KEY = "flippwatch-cart"; // v1: plain string[]

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

/** Load v2 entries; if only the legacy v1 string[] exists, migrate it. */
function load(): CartEntry[] {
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
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
      return migrated;
    }
  } catch {
    // fall through to empty
  }
  return [];
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
 * remembers which deal an item came from and at what price. Persisted
 * to localStorage (v2 key, migrating v1), synced across tabs via the
 * `storage` event. Server renders an empty cart; hydration happens
 * after mount so SSR markup always matches the first client render.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { entries: [] });
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    dispatch({ type: "HYDRATE", entries: load() });
    hydrated.current = true;
  }, []);

  // Persist on every change (post-hydration only).
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    } catch {
      // storage unavailable — cart still works in-memory for the session
    }
  }, [state.entries]);

  // Another tab changed the list — reconcile.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      dispatch({ type: "HYDRATE", entries: load() });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
