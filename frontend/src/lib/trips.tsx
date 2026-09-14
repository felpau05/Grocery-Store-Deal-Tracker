"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount } from "./account";
import {
  createSavedPlan,
  deleteSavedPlan,
  fetchSavedPlans,
  replaceSavedPlanItems,
  updateSavedPlan,
  type OptimizeMode,
  type SavedPlanApi,
  type StorePlan,
  type TripItemApi,
} from "./api";
import { useToast } from "./toast";

// ── Types ─────────────────────────────────────────────────────────────

export type CartSource = {
  itemId: number;
  merchantId: number;
  merchantName: string;
  price: number; // price at the moment the item was added
  image: string | null;
};

export type TripItem = {
  id: string;
  query: string; // normalized; drives the optimizer and dedupe
  label: string; // what the user sees
  source?: CartSource; // present when added from a specific deal
  addedAt: number;
  /** The item_id this line is priced against, once the trip has been
   *  built (or a pick swapped). Reapplied on top of a fresh optimize
   *  call wherever still available. */
  pick?: number;
};

/** Every list row was written against CartEntry — same thing. */
export type CartEntry = TripItem;

/**
 * A trip is a named grocery list. Items can be added to any trip; one
 * trip is "active", and that's where the add buttons on deals put
 * things. The priced summary (totalCost/stops/plans) is whatever the
 * trip was last built against — for a signed-in account it's
 * re-assembled from current prices on every load (backend/db/cart.py's
 * _assemble_plan); for the anon/local path it's a snapshot.
 */
export type Trip = {
  id: string;
  name: string | null;
  mode: OptimizeMode;
  updatedAt: number;
  items: TripItem[];
  totalCost: number;
  stops: number;
  plans: StorePlan[];
};

export type TripSummary = Pick<Trip, "totalCost" | "stops" | "plans">;

// ── Storage keys ──────────────────────────────────────────────────────

const TRIPS_KEY = "flippwatch-trips-v1";
const ACTIVE_KEY = "flippwatch-active-trip";
// Pre-trips storage, read once and migrated (see takeLegacy).
const LEGACY_CART_KEY = "flippwatch-cart-v2";
const LEGACY_CART_V1_KEY = "flippwatch-cart"; // plain string[]
const LEGACY_PLANS_KEY = "flippwatch-plans-v1";

// Past this many, the oldest get dropped — a defensive cap on the local
// path only, not a real limit anyone's expected to hit.
const MAX_LOCAL_TRIPS = 30;

const normalize = (name: string) => name.trim().toLowerCase();

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

const TMP_PREFIX = "tmp-";
const isTmp = (id: string) => id.startsWith(TMP_PREFIX);

/** Shared so every trip row agrees on one date format. */
export function formatSavedDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function tripName(trip: Pick<Trip, "name">): string {
  return trip.name ?? "Untitled shopping trip";
}

/** "Plan 1", "Plan 2", … — the default name for a trip nobody named.
 *  `count` is however many trips already exist, so the new one lands
 *  one past them; a deleted "Plan 1" can be handed out again to
 *  whatever's created next; that's fine, nothing keys off the number. */
function defaultTripName(count: number): string {
  return `Plan ${count + 1}`;
}

function emptyTrip(id: string, name: string | null): Trip {
  return { id, name, mode: "cheapest", updatedAt: Date.now(), items: [], totalCost: 0, stops: 0, plans: [] };
}

// ── Reducer ───────────────────────────────────────────────────────────

type State = { trips: Trip[] };

type Action =
  | { type: "HYDRATE"; trips: Trip[] }
  | { type: "UPSERT"; trip: Trip }
  | { type: "PATCH"; id: string; patch: Partial<Pick<Trip, "name" | "mode">> }
  | { type: "ADD_ITEM"; id: string; item: TripItem }
  | { type: "REMOVE_ITEM"; id: string; query: string }
  | { type: "RESTORE_ITEMS"; id: string; items: TripItem[] }
  | { type: "CLEAR_ITEMS"; id: string }
  | { type: "SET_PICKS"; id: string; picks: Record<string, number>; summary: TripSummary }
  | { type: "SET_SUMMARY"; id: string; summary: TripSummary }
  | { type: "REMOVE_TRIP"; id: string }
  | { type: "REPLACE_ID"; from: string; to: string };

const byRecent = (a: Trip, b: Trip) => b.updatedAt - a.updatedAt;

function touch(state: State, id: string, change: (trip: Trip) => Trip | null): State {
  let changed = false;
  const trips = state.trips.map((t) => {
    if (t.id !== id) return t;
    const next = change(t);
    if (!next || next === t) return t;
    changed = true;
    return { ...next, updatedAt: Date.now() };
  });
  return changed ? { trips: trips.sort(byRecent) } : state;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE":
      return { trips: [...action.trips].sort(byRecent) };
    case "UPSERT":
      return { trips: [action.trip, ...state.trips.filter((t) => t.id !== action.trip.id)].sort(byRecent) };
    case "PATCH":
      return touch(state, action.id, (t) => ({ ...t, ...action.patch }));
    case "ADD_ITEM":
      return touch(state, action.id, (t) =>
        t.items.some((i) => i.query === action.item.query) ? null : { ...t, items: [...t.items, action.item] },
      );
    case "REMOVE_ITEM":
      return touch(state, action.id, (t) =>
        t.items.some((i) => i.query === action.query)
          ? { ...t, items: t.items.filter((i) => i.query !== action.query) }
          : null,
      );
    case "RESTORE_ITEMS":
      return touch(state, action.id, (t) => {
        const existing = new Set(t.items.map((i) => i.query));
        const restored = action.items.filter((i) => !existing.has(i.query));
        if (restored.length === 0) return null;
        // Keep original ordering: restored items sort back in by addedAt.
        return { ...t, items: [...t.items, ...restored].sort((a, b) => a.addedAt - b.addedAt) };
      });
    case "CLEAR_ITEMS":
      return touch(state, action.id, (t) => (t.items.length === 0 ? null : { ...t, items: [] }));
    case "SET_PICKS": {
      const trip = state.trips.find((t) => t.id === action.id);
      if (!trip) return state;
      const unchanged =
        trip.items.every((i) => i.pick === action.picks[i.query]) &&
        trip.totalCost === action.summary.totalCost &&
        trip.stops === action.summary.stops;
      if (unchanged) return state;
      // Not `touch`: re-pricing isn't an edit, so it doesn't reorder the
      // trips list under someone's cursor.
      return {
        trips: state.trips.map((t) =>
          t.id === action.id
            ? { ...t, ...action.summary, items: t.items.map((i) => ({ ...i, pick: action.picks[i.query] })) }
            : t,
        ),
      };
    }
    case "SET_SUMMARY":
      return {
        trips: state.trips.map((t) => (t.id === action.id ? { ...t, ...action.summary } : t)),
      };
    case "REMOVE_TRIP":
      return { trips: state.trips.filter((t) => t.id !== action.id) };
    case "REPLACE_ID":
      return { trips: state.trips.map((t) => (t.id === action.from ? { ...t, id: action.to } : t)) };
  }
}

// ── Local storage + legacy migration ─────────────────────────────────

function isValidItem(x: unknown): x is TripItem {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.query === "string" && typeof e.label === "string" && typeof e.addedAt === "number";
}

function isValidTrip(x: unknown): x is Trip {
  if (typeof x !== "object" || x === null) return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.updatedAt === "number" &&
    typeof t.mode === "string" &&
    Array.isArray(t.items) &&
    t.items.every(isValidItem) &&
    typeof t.totalCost === "number" &&
    typeof t.stops === "number" &&
    Array.isArray(t.plans)
  );
}

function readJson(key: string): unknown {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

/** The pre-trips cart for this identity: its own scoped v2 bucket, else
 *  the unscoped v2 key, else the plain string[] v1 key — whichever is
 *  found first is attributed to this identity and removed, so it's never
 *  migrated a second time into a different identity later. */
function takeLegacyCart(identity: string): TripItem[] {
  const scopedKey = `${LEGACY_CART_KEY}:${identity}`;
  for (const key of [scopedKey, LEGACY_CART_KEY]) {
    const parsed = readJson(key);
    if (parsed === null) continue;
    window.localStorage.removeItem(key);
    return Array.isArray(parsed) ? parsed.filter(isValidItem) : [];
  }
  const v1 = readJson(LEGACY_CART_V1_KEY);
  if (v1 === null) return [];
  window.localStorage.removeItem(LEGACY_CART_V1_KEY);
  const now = Date.now();
  return Array.isArray(v1)
    ? v1
        .filter((x): x is string => typeof x === "string")
        .map((name, i) => ({ id: newId(), query: normalize(name), label: normalize(name), addedAt: now + i }))
    : [];
}

/** The pre-trips saved plans for this identity — same scoped-then-
 *  unscoped attribution as the cart. Each becomes a trip whose items are
 *  its queries, with its saved picks carried over. */
function takeLegacyPlans(identity: string): Trip[] {
  const scopedKey = `${LEGACY_PLANS_KEY}:${identity}`;
  for (const key of [scopedKey, LEGACY_PLANS_KEY]) {
    const parsed = readJson(key);
    if (parsed === null) continue;
    window.localStorage.removeItem(key);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((p): Trip[] => {
      if (typeof p !== "object" || p === null || !Array.isArray(p.queries)) return [];
      const picks: Record<string, number> = p.picks ?? {};
      const updatedAt = typeof p.updatedAt === "number" ? p.updatedAt : Date.now();
      return [
        {
          id: newId(),
          name: typeof p.name === "string" ? p.name : null,
          mode: p.mode === "fewest" ? "fewest" : "cheapest",
          updatedAt,
          items: p.queries
            .filter((q: unknown): q is string => typeof q === "string")
            .map((q: string, i: number) => ({ id: newId(), query: q, label: q, addedAt: updatedAt + i, pick: picks[q] })),
          totalCost: typeof p.totalCost === "number" ? p.totalCost : 0,
          stops: typeof p.stops === "number" ? p.stops : 0,
          plans: Array.isArray(p.plans) ? p.plans : [],
        },
      ];
    });
  }
  return [];
}

/** Legacy cart + plans as trips. The old cart was, by definition, the
 *  list being worked on — so it comes back as the active trip. */
function takeLegacy(identity: string): { trips: Trip[]; activeId: string | null } {
  try {
    const cartItems = takeLegacyCart(identity);
    const trips = takeLegacyPlans(identity);
    if (cartItems.length === 0) return { trips, activeId: null };
    const myList = { ...emptyTrip(newId(), "My list"), items: cartItems };
    return { trips: [myList, ...trips], activeId: myList.id };
  } catch {
    return { trips: [], activeId: null };
  }
}

function loadLocalTrips(identity: string): Trip[] | null {
  try {
    const parsed = readJson(`${TRIPS_KEY}:${identity}`);
    if (parsed === null) return null;
    return Array.isArray(parsed) ? parsed.filter(isValidTrip) : [];
  } catch {
    return [];
  }
}

function readActive(identity: string): string | null {
  try {
    return window.localStorage.getItem(`${ACTIVE_KEY}:${identity}`);
  } catch {
    return null;
  }
}

function writeActive(identity: string, id: string | null) {
  try {
    if (id) window.localStorage.setItem(`${ACTIVE_KEY}:${identity}`, id);
    else window.localStorage.removeItem(`${ACTIVE_KEY}:${identity}`);
  } catch {
    // storage unavailable — the choice just lasts for this session
  }
}

// ── Wire conversion ───────────────────────────────────────────────────

function toApiItem(item: TripItem): TripItemApi {
  return {
    query: item.query,
    label: item.label,
    item_id: item.pick ?? null,
    source_item_id: item.source?.itemId ?? null,
    merchant_id: item.source?.merchantId ?? null,
    merchant_name: item.source?.merchantName ?? null,
    price: item.source?.price ?? null,
    image: item.source?.image ?? null,
    added_at: item.addedAt,
  };
}

/** No client id comes back from the server (dedupe is by query, not id),
 *  so `query` itself is used as a stable key. */
function fromApiItem(item: TripItemApi): TripItem {
  const hasSource =
    item.source_item_id != null && item.merchant_id != null && item.merchant_name != null && item.price != null;
  return {
    id: item.query,
    query: item.query,
    label: item.label,
    source: hasSource
      ? {
          itemId: item.source_item_id as number,
          merchantId: item.merchant_id as number,
          merchantName: item.merchant_name as string,
          price: item.price as number,
          image: item.image,
        }
      : undefined,
    addedAt: item.added_at,
    pick: item.item_id ?? undefined,
  };
}

function summaryOf(p: SavedPlanApi): TripSummary {
  return { totalCost: p.total_cost, stops: p.stops, plans: p.plans };
}

function fromApiTrip(p: SavedPlanApi): Trip {
  return {
    id: String(p.id),
    name: p.name,
    mode: p.mode,
    updatedAt: p.updated_at,
    items: p.items.map(fromApiItem),
    ...summaryOf(p),
  };
}

// ── Context ───────────────────────────────────────────────────────────

type PickerState = {
  mode: "add" | "move";
  name: string;
  source?: CartSource;
  /** For "move": the trip the item is currently in. */
  fromTripId?: string;
};

type TripsContextValue = {
  trips: Trip[];
  /** False until this identity's trips have loaded — a trip id that isn't
   *  found before then isn't "gone", it just hasn't arrived yet. */
  hydrated: boolean;
  /** The trip adds go to. Falls back to the most recently updated trip
   *  when nothing has been chosen (or the chosen one was deleted). */
  activeTrip: Trip | null;
  /** Whether `activeTrip` was actually chosen (vs. the fallback). When
   *  false, the next deal add asks which trip. */
  hasChosenTrip: boolean;
  setActiveTrip: (id: string) => void;
  /** Looks a trip up by id, following a temporary id to the real one the
   *  server handed back — so a URL written mid-create still resolves. */
  getTrip: (id: string) => Trip | null;
  /** The FIRST id a trip was known by, before any tmp→real swap — for
   *  React keys that must not change (and remount) when the server's id
   *  arrives mid-edit. */
  stableKey: (id: string) => string;
  createTrip: (name?: string | null) => Trip;
  renameTrip: (id: string, name: string | null) => void;
  setTripMode: (id: string, mode: OptimizeMode) => void;
  setTripPicks: (id: string, picks: Record<string, number>, summary: TripSummary) => void;
  /** Removes by id; returns the removed trip so callers can offer undo. */
  removeTrip: (id: string) => Trip | null;
  restoreTrip: (trip: Trip) => void;
  addToTrip: (id: string, name: string, source?: CartSource) => TripItem | null;
  removeFromTrip: (id: string, name: string) => TripItem | null;
  restoreToTrip: (id: string, items: TripItem | TripItem[]) => void;
  clearTrip: (id: string) => TripItem[];
  /** THE add used by deal buttons: straight into the active trip when
   *  one has been chosen, the trip picker when there are trips but no
   *  choice yet, or a quietly created "Plan 1" when there are none.
   *  Toasts the outcome with Change + View list. */
  requestAdd: (name: string, source?: CartSource) => void;
  picker: PickerState | null;
  closePicker: () => void;
  /** Resolve the open picker into a trip — an existing id, or null to
   *  create a new trip with `newName`. */
  choosePickerTrip: (id: string | null, newName?: string) => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const TripsContext = createContext<TripsContextValue | null>(null);

/**
 * Trips — the grocery lists.
 *
 * Anonymous ("anon" identity): localStorage, one bucket, synced across
 * tabs via the `storage` event. The first load migrates the pre-trips
 * cart (→ an active "My list") and saved plans (→ one trip each).
 *
 * Signed in (`u<id>` identity): a real account-level record — the
 * `/trip-plans` endpoints (see lib/api.ts, backend/routes/cart.py).
 * Mutations are optimistic: the reducer updates right away, and a
 * debounced effect diffs each trip against what the server last
 * received, PATCHing name/mode and PUTting the item list. A new trip
 * lives under a `tmp-` id until its POST returns; anything done to it in
 * the meantime is simply picked up by the next diff. Failures toast but
 * don't roll back — drift self-heals on the next hydrate.
 *
 * The active trip id is per-device (localStorage) for both.
 */
export function TripsProvider({ children }: { children: ReactNode }) {
  const { user, loading: accountLoading } = useAccount();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(reducer, { trips: [] });
  const [hydrated, setHydrated] = useState(false);
  const [storedActiveId, setStoredActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  // Set right before a HYDRATE, so the anon persist effect can tell "this
  // change is the load itself" apart from "the user actually did
  // something" — without it the OUTGOING identity's trips could be
  // written under the INCOMING identity on the same render.
  const suppressPersist = useRef(false);
  // Signed-in: what the server last received, per trip id.
  const synced = useRef(new Map<string, { items: TripItem[]; name: string | null; mode: OptimizeMode }>());
  // tmp id (or a deleted-then-restored trip's old id) -> its replacement.
  const aliases = useRef(new Map<string, string>());
  const legacyUploaded = useRef(new Set<string>());

  const identity = accountLoading ? null : user ? `u${user.id}` : "anon";
  const signedIn = identity !== null && identity !== "anon";

  const setActive = useCallback(
    (id: string | null) => {
      setStoredActiveId(id);
      if (identity) writeActive(identity, id);
    },
    [identity],
  );

  // ── Hydrate ──
  useEffect(() => {
    if (identity === null) return;
    setHydrated(false);
    synced.current.clear();
    setStoredActiveId(readActive(identity));

    if (identity === "anon") {
      suppressPersist.current = true;
      let trips = loadLocalTrips(identity);
      if (trips === null) {
        const legacy = takeLegacy(identity);
        trips = legacy.trips;
        try {
          window.localStorage.setItem(`${TRIPS_KEY}:${identity}`, JSON.stringify(trips));
        } catch {
          // storage unavailable — trips still work in-memory for the session
        }
        if (legacy.activeId) {
          setStoredActiveId(legacy.activeId);
          writeActive(identity, legacy.activeId);
        }
      }
      dispatch({ type: "HYDRATE", trips });
      setHydrated(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        let serverTrips = await fetchSavedPlans();
        // A signed-in identity's own pre-server local buckets, uploaded
        // once. The ref guards the dev double-invoke; the keys are
        // removed by takeLegacy either way.
        if (!legacyUploaded.current.has(identity)) {
          legacyUploaded.current.add(identity);
          const legacy = takeLegacy(identity);
          if (legacy.trips.length > 0) {
            const uploaded = [];
            for (const t of legacy.trips) {
              uploaded.push(
                await createSavedPlan({ name: t.name, mode: t.mode, items: t.items.map(toApiItem) }),
              );
            }
            serverTrips = [...uploaded, ...serverTrips];
          }
        }
        if (cancelled) return;
        const trips = serverTrips.map(fromApiTrip);
        for (const t of trips) synced.current.set(t.id, { items: t.items, name: t.name, mode: t.mode });
        dispatch({ type: "HYDRATE", trips });
      } catch {
        if (!cancelled) {
          toast("Couldn't load your shopping trips — try again", { kind: "error" });
          dispatch({ type: "HYDRATE", trips: [] });
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  // ── Anon persistence ──
  useEffect(() => {
    if (identity !== "anon" || !hydrated) return;
    if (suppressPersist.current) {
      suppressPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(`${TRIPS_KEY}:${identity}`, JSON.stringify(state.trips.slice(0, MAX_LOCAL_TRIPS)));
    } catch {
      // storage unavailable — trips still work in-memory for the session
    }
  }, [state.trips, identity, hydrated]);

  // Cross-tab sync, anon only — a signed-in account's equivalent is just
  // the next write winning.
  useEffect(() => {
    if (identity !== "anon") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === `${TRIPS_KEY}:${identity}`) {
        suppressPersist.current = true;
        dispatch({ type: "HYDRATE", trips: loadLocalTrips(identity) ?? [] });
      } else if (e.key === `${ACTIVE_KEY}:${identity}`) {
        setStoredActiveId(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [identity]);

  // ── Signed-in sync: diff each trip against what the server last got ──
  useEffect(() => {
    if (!signedIn || !hydrated) return;
    const timer = setTimeout(() => {
      for (const trip of stateRef.current.trips) {
        if (isTmp(trip.id)) continue;
        const prev = synced.current.get(trip.id);
        if (!prev) continue;
        const id = Number(trip.id);
        if (prev.name !== trip.name || prev.mode !== trip.mode) {
          synced.current.set(trip.id, { ...prev, name: trip.name, mode: trip.mode });
          updateSavedPlan(id, { name: trip.name, mode: trip.mode }).catch(() =>
            toast("Couldn't save your shopping trip — try again", { kind: "error" }),
          );
        }
        if (prev.items !== trip.items) {
          synced.current.set(trip.id, { ...synced.current.get(trip.id)!, items: trip.items });
          replaceSavedPlanItems(id, trip.items.map(toApiItem))
            .then((saved) => dispatch({ type: "SET_SUMMARY", id: trip.id, summary: summaryOf(saved) }))
            .catch(() => toast("Couldn't save your shopping trip — try again", { kind: "error" }));
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [state.trips, signedIn, hydrated, toast]);

  /** POST a trip that exists locally under a tmp id, then swap the real
   *  id in. Whatever happened to it meanwhile is picked up by the diff
   *  effect, because `synced` records exactly what this POST sent. */
  const pushNewTrip = useCallback(
    (trip: Trip) => {
      const sent = { items: trip.items, name: trip.name, mode: trip.mode };
      createSavedPlan({ name: sent.name, mode: sent.mode, items: sent.items.map(toApiItem) })
        .then((created) => {
          const realId = String(created.id);
          if (!stateRef.current.trips.some((t) => t.id === trip.id)) {
            // Deleted before the server even had it.
            deleteSavedPlan(created.id).catch(() => {});
            return;
          }
          synced.current.set(realId, sent);
          aliases.current.set(trip.id, realId);
          dispatch({ type: "REPLACE_ID", from: trip.id, to: realId });
          setStoredActiveId((cur) => {
            if (cur !== trip.id) return cur;
            if (identity) writeActive(identity, realId);
            return realId;
          });
          dispatch({ type: "SET_SUMMARY", id: realId, summary: summaryOf(created) });
        })
        .catch(() => toast("Couldn't save your shopping trip — try again", { kind: "error" }));
    },
    [identity, toast],
  );

  const resolveId = useCallback((id: string) => {
    let cur = id;
    for (let i = 0; i < 5 && aliases.current.has(cur); i++) cur = aliases.current.get(cur)!;
    return cur;
  }, []);

  const stableKey = useCallback((id: string) => {
    let cur = id;
    for (let i = 0; i < 5; i++) {
      const prev = [...aliases.current.entries()].find(([, to]) => to === cur)?.[0];
      if (!prev) break;
      cur = prev;
    }
    return cur;
  }, []);

  const getTrip = useCallback(
    (id: string) => {
      const real = resolveId(id);
      return state.trips.find((t) => t.id === real) ?? null;
    },
    [state.trips, resolveId],
  );

  const createTrip = useCallback(
    (name?: string | null): Trip => {
      const clean = name?.trim() || defaultTripName(stateRef.current.trips.length);
      const trip = emptyTrip(signedIn ? `${TMP_PREFIX}${newId()}` : newId(), clean);
      dispatch({ type: "UPSERT", trip });
      if (signedIn) pushNewTrip(trip);
      return trip;
    },
    [signedIn, pushNewTrip],
  );

  const renameTrip = useCallback((id: string, name: string | null) => {
    dispatch({ type: "PATCH", id: resolveId(id), patch: { name: name?.trim() || null } });
  }, [resolveId]);

  const setTripMode = useCallback((id: string, mode: OptimizeMode) => {
    dispatch({ type: "PATCH", id: resolveId(id), patch: { mode } });
  }, [resolveId]);

  const setTripPicks = useCallback((id: string, picks: Record<string, number>, summary: TripSummary) => {
    dispatch({ type: "SET_PICKS", id: resolveId(id), picks, summary });
  }, [resolveId]);

  const removeTrip = useCallback(
    (id: string): Trip | null => {
      const trip = state.trips.find((t) => t.id === resolveId(id)) ?? null;
      if (!trip) return null;
      dispatch({ type: "REMOVE_TRIP", id: trip.id });
      synced.current.delete(trip.id);
      if (signedIn && !isTmp(trip.id)) {
        deleteSavedPlan(Number(trip.id)).catch(() =>
          toast("Couldn't remove your shopping trip — try again", { kind: "error" }),
        );
      }
      return trip;
    },
    [state.trips, signedIn, resolveId, toast],
  );

  const restoreTrip = useCallback(
    (trip: Trip) => {
      if (!signedIn) {
        dispatch({ type: "UPSERT", trip });
        return;
      }
      // A restore is a fresh create, not an un-delete: a new id, with the
      // old one aliased to it so anything still holding it (the URL, the
      // stored active id) follows along.
      const restored = { ...trip, id: `${TMP_PREFIX}${newId()}` };
      aliases.current.set(trip.id, restored.id);
      dispatch({ type: "UPSERT", trip: restored });
      setStoredActiveId((cur) => (cur === trip.id ? restored.id : cur));
      pushNewTrip(restored);
    },
    [signedIn, pushNewTrip],
  );

  const addToTrip = useCallback(
    (id: string, name: string, source?: CartSource): TripItem | null => {
      const query = normalize(name);
      if (!query) return null;
      const item: TripItem = { id: newId(), query, label: name.trim(), source, addedAt: Date.now() };
      dispatch({ type: "ADD_ITEM", id: resolveId(id), item });
      return item;
    },
    [resolveId],
  );

  const removeFromTrip = useCallback(
    (id: string, name: string): TripItem | null => {
      const real = resolveId(id);
      const query = normalize(name);
      const item = state.trips.find((t) => t.id === real)?.items.find((i) => i.query === query) ?? null;
      if (item) dispatch({ type: "REMOVE_ITEM", id: real, query });
      return item;
    },
    [state.trips, resolveId],
  );

  const restoreToTrip = useCallback(
    (id: string, items: TripItem | TripItem[]) => {
      dispatch({ type: "RESTORE_ITEMS", id: resolveId(id), items: Array.isArray(items) ? items : [items] });
    },
    [resolveId],
  );

  const clearTrip = useCallback(
    (id: string): TripItem[] => {
      const real = resolveId(id);
      const removed = state.trips.find((t) => t.id === real)?.items ?? [];
      dispatch({ type: "CLEAR_ITEMS", id: real });
      return removed;
    },
    [state.trips, resolveId],
  );

  // ── Active trip ──
  const chosenTrip = storedActiveId ? state.trips.find((t) => t.id === resolveId(storedActiveId)) ?? null : null;
  const activeTrip = chosenTrip ?? state.trips[0] ?? null;

  const setActiveTrip = useCallback((id: string) => setActive(resolveId(id)), [setActive, resolveId]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closePicker = useCallback(() => setPicker(null), []);

  const toastAdded = useCallback(
    (item: TripItem, trip: Trip, verb: "Added" | "Moved") => {
      toast(`${verb} "${item.label}" to ${tripName(trip)}`, {
        actions: [
          {
            label: "Change",
            onClick: () => setPicker({ mode: "move", name: item.label, fromTripId: trip.id }),
          },
          { label: "View list", onClick: openDrawer },
        ],
        duration: 4000,
      });
    },
    [toast, openDrawer],
  );

  const requestAdd = useCallback(
    (name: string, source?: CartSource) => {
      if (!normalize(name)) return;
      if (state.trips.length === 0) {
        const trip = createTrip();
        setActive(trip.id);
        const item = addToTrip(trip.id, name, source);
        if (item) toastAdded(item, trip, "Added");
        return;
      }
      if (!chosenTrip) {
        setPicker({ mode: "add", name, source });
        return;
      }
      const item = addToTrip(chosenTrip.id, name, source);
      if (item) toastAdded(item, chosenTrip, "Added");
    },
    [state.trips.length, chosenTrip, createTrip, setActive, addToTrip, toastAdded],
  );

  const choosePickerTrip = useCallback(
    (id: string | null, newName?: string) => {
      if (!picker) return;
      const target = id ? getTrip(id) : createTrip(newName);
      if (!target) return;
      setActive(target.id);
      setPicker(null);

      if (picker.mode === "add") {
        const item = addToTrip(target.id, picker.name, picker.source);
        if (item) toastAdded(item, target, "Added");
        return;
      }
      // Move: carry the original row (its source and added time) across.
      const fromId = picker.fromTripId ?? "";
      if (resolveId(fromId) === target.id) return;
      const moved = removeFromTrip(fromId, picker.name);
      if (!moved) return;
      restoreToTrip(target.id, { ...moved, pick: undefined });
      toastAdded(moved, target, "Moved");
    },
    [picker, getTrip, createTrip, setActive, addToTrip, removeFromTrip, restoreToTrip, resolveId, toastAdded],
  );

  const value = useMemo<TripsContextValue>(
    () => ({
      trips: state.trips,
      hydrated,
      activeTrip,
      hasChosenTrip: chosenTrip !== null,
      setActiveTrip,
      getTrip,
      stableKey,
      createTrip,
      renameTrip,
      setTripMode,
      setTripPicks,
      removeTrip,
      restoreTrip,
      addToTrip,
      removeFromTrip,
      restoreToTrip,
      clearTrip,
      requestAdd,
      picker,
      closePicker,
      choosePickerTrip,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
    }),
    [
      state.trips, hydrated, activeTrip, chosenTrip, setActiveTrip, getTrip, stableKey, createTrip, renameTrip, setTripMode,
      setTripPicks, removeTrip, restoreTrip, addToTrip, removeFromTrip, restoreToTrip, clearTrip,
      requestAdd, picker, closePicker, choosePickerTrip, isDrawerOpen, openDrawer, closeDrawer,
    ],
  );

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips(): TripsContextValue {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used inside <TripsProvider>");
  return ctx;
}

/**
 * The grocery list as most of the app sees it: the ACTIVE trip, with the
 * same shape the single cart used to have. `add` here goes straight into
 * the active trip (creating "Plan 1" if there are no trips) — it's for
 * places already showing that trip, like the drawer. Deal buttons use
 * `useTrips().requestAdd`, which can ask which trip.
 */
export function useCart() {
  const t = useTrips();
  const { activeTrip, createTrip, setActiveTrip, addToTrip, removeFromTrip, restoreToTrip, clearTrip } = t;
  const entries = useMemo(() => activeTrip?.items ?? [], [activeTrip]);

  const has = useCallback((name: string) => entries.some((e) => e.query === normalize(name)), [entries]);

  const add = useCallback(
    (name: string, source?: CartSource) => {
      let id = activeTrip?.id;
      if (!id) {
        id = createTrip().id;
        setActiveTrip(id);
      }
      return addToTrip(id, name, source);
    },
    [activeTrip, createTrip, setActiveTrip, addToTrip],
  );

  const remove = useCallback(
    (name: string) => (activeTrip ? removeFromTrip(activeTrip.id, name) : null),
    [activeTrip, removeFromTrip],
  );

  const restore = useCallback(
    (items: TripItem | TripItem[]) => {
      if (activeTrip) restoreToTrip(activeTrip.id, items);
    },
    [activeTrip, restoreToTrip],
  );

  const clear = useCallback(() => (activeTrip ? clearTrip(activeTrip.id) : []), [activeTrip, clearTrip]);

  return {
    entries,
    count: entries.length,
    has,
    add,
    remove,
    restore,
    clear,
    isDrawerOpen: t.isDrawerOpen,
    openDrawer: t.openDrawer,
    closeDrawer: t.closeDrawer,
  };
}
