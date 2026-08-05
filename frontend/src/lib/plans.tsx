"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useAccount } from "./account";
import {
  createSavedPlan,
  deleteSavedPlan,
  fetchSavedPlans,
  type OptimizeMode,
  type SavedPlanApi,
  type StorePlan,
} from "./api";
import { useToast } from "./toast";

const BASE_KEY = "flippwatch-plans-v1";
// Past this many, the oldest (by updatedAt) get dropped on save — a
// defensive cap, not a real limit anyone's expected to hit. Only applies
// to the anon/local path — a signed-in account's plans live server-side
// with no such cap.
const MAX_SAVED = 30;

export type SavedPlan = {
  id: string;
  /** User-given, optional — falls back to a date label wherever it's shown. */
  name: string | null;
  /** When this plan was saved, or last re-saved — "last updated," not
   *  "created": there's no separate edit path yet, but the field is
   *  modeled this way so one wouldn't need to be added later. */
  updatedAt: number;
  mode: OptimizeMode;
  /** The grocery-list queries this was built from — re-submitted to the
   *  live optimizer when the plan is reopened, so it always reflects
   *  today's actual deals rather than trusting a stale snapshot. */
  queries: string[];
  /** query -> item_id, the picks in place when saved. Reapplied on top
   *  of a fresh optimize call wherever still available. */
  picks: Record<string, number>;
  // For a signed-in account these are computed fresh from current
  // prices on every load (see backend/db/cart.py's _assemble_plan) —
  // there's no "as of this date" staleness to caveat. For the anon/local
  // path they're still a frozen preview captured at save time.
  totalCost: number;
  stops: number;
  itemCount: number;
  plans: StorePlan[];
};

type SavePlanInput = Omit<SavedPlan, "id" | "updatedAt">;

type State = { plans: SavedPlan[] };

type Action =
  | { type: "HYDRATE"; plans: SavedPlan[] }
  | { type: "SAVE"; plan: SavedPlan }
  | { type: "REMOVE"; id: string };

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
      return { plans: action.plans };
    case "SAVE": {
      const next = [action.plan, ...state.plans.filter((p) => p.id !== action.plan.id)];
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      return { plans: next.slice(0, MAX_SAVED) };
    }
    case "REMOVE":
      return { plans: state.plans.filter((p) => p.id !== action.id) };
  }
}

function isValidPlan(x: unknown): x is SavedPlan {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.updatedAt === "number" &&
    typeof p.mode === "string" &&
    Array.isArray(p.queries) &&
    typeof p.picks === "object" &&
    p.picks !== null &&
    typeof p.totalCost === "number" &&
    typeof p.stops === "number" &&
    typeof p.itemCount === "number" &&
    Array.isArray(p.plans)
  );
}

function keyFor(identity: string): string {
  return `${BASE_KEY}:${identity}`;
}

/**
 * Load one identity's LOCAL saved plans ("anon", or a signed-in
 * identity's own pre-server-sync bucket — see the one-time upgrade in
 * PlansProvider). On that identity's very first load (no scoped key
 * yet), migrates whatever's sitting in the pre-scoping unscoped key —
 * attributed to whoever's active the first time this runs, then removed
 * so it's never migrated a second time into a different identity later.
 */
function load(identity: string): SavedPlan[] {
  const scopedKey = keyFor(identity);
  try {
    const rawScoped = window.localStorage.getItem(scopedKey);
    if (rawScoped) {
      const parsed = JSON.parse(rawScoped);
      return Array.isArray(parsed) ? parsed.filter(isValidPlan) : [];
    }

    const rawUnscoped = window.localStorage.getItem(BASE_KEY);
    if (rawUnscoped) {
      const parsed = JSON.parse(rawUnscoped);
      const migrated = Array.isArray(parsed) ? parsed.filter(isValidPlan) : [];
      window.localStorage.removeItem(BASE_KEY);
      if (migrated.length > 0) window.localStorage.setItem(scopedKey, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // fall through to empty
  }
  return [];
}

function fromApiPlan(p: SavedPlanApi): SavedPlan {
  return {
    id: String(p.id),
    name: p.name,
    updatedAt: p.updated_at,
    mode: p.mode,
    queries: p.queries,
    picks: p.picks,
    totalCost: p.total_cost,
    stops: p.stops,
    itemCount: p.item_count,
    plans: p.plans,
  };
}

function toCreateRequest(input: SavePlanInput) {
  return {
    name: input.name,
    mode: input.mode,
    items: input.queries
      .filter((q) => input.picks[q] !== undefined)
      .map((q) => ({ query: q, item_id: input.picks[q] })),
  };
}

type PlansContextValue = {
  plans: SavedPlan[];
  savePlan: (input: SavePlanInput) => void;
  /** Removes by id; returns the removed plan so callers can offer undo. */
  removePlan: (id: string) => SavedPlan | null;
  restorePlan: (plan: SavedPlan) => void;
};

const PlansContext = createContext<PlansContextValue | null>(null);

/**
 * Saved trip plans.
 *
 * Anonymous ("anon" identity): unchanged localStorage.
 *
 * Signed in (`u<id>` identity): a real account-level record — GET/POST/
 * DELETE `/trip-plans` (see lib/api.ts, backend/routes/cart.py) instead
 * of localStorage. Mutations are optimistic (dispatch locally right
 * away so the UI feels the same as the anon path) with the actual
 * network call fired in the background; a failure toasts an error but
 * doesn't roll anything back — any drift self-heals on the next full
 * hydrate (reload / remount), same as the cart's sync-on-change does.
 * The FIRST time a signed-in identity's server plans come back empty,
 * this checks for that identity's own pre-existing local bucket (from
 * before server-backed plans shipped) and uploads each one once.
 */
export function PlansProvider({ children }: { children: ReactNode }) {
  const { user, loading: accountLoading } = useAccount();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(reducer, { plans: [] });
  const suppressPersist = useRef(false);

  const identity = accountLoading ? null : user ? `u${user.id}` : "anon";
  const signedIn = identity !== null && identity !== "anon";

  useEffect(() => {
    if (identity === null) return;
    suppressPersist.current = true;

    if (identity === "anon") {
      dispatch({ type: "HYDRATE", plans: load(identity) });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        let serverPlans = await fetchSavedPlans();
        if (serverPlans.length === 0) {
          const localPlans = load(identity);
          if (localPlans.length > 0) {
            const uploaded: SavedPlanApi[] = [];
            for (const p of localPlans) {
              uploaded.push(await createSavedPlan(toCreateRequest(p)));
            }
            serverPlans = uploaded;
            try {
              window.localStorage.removeItem(keyFor(identity));
            } catch {
              // not critical — worst case this migration is retried next load
            }
          }
        }
        if (!cancelled) dispatch({ type: "HYDRATE", plans: serverPlans.map(fromApiPlan) });
      } catch {
        if (!cancelled) {
          toast("Couldn't load your saved plans — try again");
          dispatch({ type: "HYDRATE", plans: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  // Anon-only persistence — signed-in mutations sync themselves directly
  // (see savePlan/removePlan/restorePlan below), since the API is
  // one-row-at-a-time, not a whole-list replace like the cart's.
  useEffect(() => {
    if (identity !== "anon") return;
    if (suppressPersist.current) {
      suppressPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(keyFor(identity), JSON.stringify(state.plans));
    } catch {
      // storage unavailable — saved plans still work in-memory for the session
    }
  }, [state.plans, identity]);

  const savePlan = useCallback(
    (input: SavePlanInput): void => {
      if (!signedIn) {
        const plan: SavedPlan = { ...input, id: newId(), updatedAt: Date.now() };
        dispatch({ type: "SAVE", plan });
        return;
      }
      createSavedPlan(toCreateRequest(input))
        .then((created) => dispatch({ type: "SAVE", plan: fromApiPlan(created) }))
        .catch(() => toast("Couldn't save your plan — try again"));
    },
    [signedIn, toast],
  );

  const removePlan = useCallback(
    (id: string): SavedPlan | null => {
      const plan = state.plans.find((p) => p.id === id) ?? null;
      if (!plan) return null;
      dispatch({ type: "REMOVE", id });
      if (signedIn) {
        deleteSavedPlan(Number(id)).catch(() => {
          toast("Couldn't remove your plan — try again");
        });
      }
      return plan;
    },
    [state.plans, signedIn, toast],
  );

  const restorePlan = useCallback(
    (plan: SavedPlan) => {
      dispatch({ type: "SAVE", plan });
      if (signedIn) {
        createSavedPlan(toCreateRequest(plan))
          .then((created) => dispatch({ type: "SAVE", plan: fromApiPlan(created) }))
          .catch(() => toast("Couldn't restore your plan — try again"));
      }
    },
    [signedIn, toast],
  );

  return (
    <PlansContext.Provider value={{ plans: state.plans, savePlan, removePlan, restorePlan }}>
      {children}
    </PlansContext.Provider>
  );
}

export function usePlans(): PlansContextValue {
  const ctx = useContext(PlansContext);
  if (!ctx) throw new Error("usePlans must be used inside <PlansProvider>");
  return ctx;
}

/** Shared so the drawer's compact rows and /list's full cards agree on
 *  one date format — a saved plan's date is metadata attached to it for
 *  tracking, shown alongside its name even when one was given, never in
 *  place of it. */
export function formatSavedDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
