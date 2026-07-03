"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  fetchMeta,
  fetchScrapeStatus,
  getToken,
  login as apiLogin,
  setToken,
  signup as apiSignup,
  updateMyPreferences,
  type Account,
  type AccountMerchant,
  type Meta,
  type ScrapeStatus,
} from "./api";
import { useToast } from "./toast";

const SCRAPE_POLL_MS = 5000;

type AccountContextValue = {
  /** The signed-in account, or null (anonymous → example-data view) */
  user: Account | null;
  /** True until the stored session (if any) has been checked */
  loading: boolean;
  /** Non-secret backend config: example postal code, Google availability */
  meta: Meta | null;
  /** The user's chosen store ids — null when anonymous or no selection */
  merchantIds: number[] | null;
  /** Progress of the on-demand background scrape, polled while running —
   *  so any page (not just settings) can show "we're fetching your deals". */
  scrapeStatus: ScrapeStatus | null;
  signUp: (name: string, email: string, password: string) => Promise<Account>;
  signIn: (email: string, password: string) => Promise<Account>;
  signOut: () => void;
  /** Store a token minted elsewhere (Google callback hash) and load the user */
  adoptToken: (token: string) => Promise<void>;
  updatePrefs: (prefs: {
    postal_code?: string;
    merchants?: AccountMerchant[];
  }) => Promise<Account & { scrape_started: boolean }>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

/**
 * Session state. The JWT lives in localStorage; the account itself is
 * always fetched from /me so nothing personal is cached client-side
 * beyond the token. Anonymous visitors get the example-data view —
 * deals scoped server-side to the config-default stores.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
  const { toast } = useToast();
  const wasRunning = useRef(false);

  useEffect(() => {
    fetchMeta().then(setMeta).catch(() => {});
    if (!getToken()) {
      setLoading(false);
      return;
    }

    // Resolve the session with bounded retries. A transient /me failure
    // (backend briefly busy — e.g. mid-scrape — a 5xx, or a network
    // blip) must NOT log the user out: only a real 401 (expired/invalid
    // token) clears the session and drops to the anonymous view. On
    // anything else we keep the token and retry with backoff, holding
    // `loading` true so the app shows its resolving state instead of
    // flickering to "Sign in" + example data. This was the bug where
    // refreshing during a scrape intermittently signed the user out.
    let cancelled = false;
    const MAX_ATTEMPTS = 5;

    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const me = await fetchMe();
          if (!cancelled) {
            setUser(me);
            setLoading(false);
          }
          return;
        } catch (err) {
          const status = (err as Error & { status?: number }).status;
          if (cancelled) return;
          if (status === 401) {
            setToken(null);
            setUser(null);
            setLoading(false);
            toast("Your session expired — sign in again to see your stores");
            return;
          }
          // Transient — back off (0.5s, 1s, 2s, 4s) and try again,
          // keeping the token so the session survives the hiccup.
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          }
        }
      }
      // Still unreachable after retries: keep the token (a later refresh
      // recovers) and stop the spinner, but say it's a connection
      // problem — do NOT pretend the user is signed out.
      if (!cancelled) {
        setLoading(false);
        toast("Couldn't reach the server — check your connection and refresh");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollScrapeStatus = useCallback(async () => {
    try {
      const status = await fetchScrapeStatus();
      setScrapeStatus(status);
      if (wasRunning.current && !status.running) {
        toast(
          status.ok
            ? `Deals are in — ${status.items_scraped ?? 0} items scraped for ${status.postal_code}`
            : "Scrape hit a snag — deals for new stores may be missing",
        );
      }
      wasRunning.current = status.running;
      return status;
    } catch {
      return null; // transient poll failure — caller decides whether to retry
    }
  }, [toast]);

  // Global scrape watcher: once we know who's signed in, check whether a
  // background scrape is already running for them (e.g. they started one,
  // then reloaded or navigated away) so the header pill can show it on
  // every page, not just settings. Only polls continuously while a scrape
  // is actually in flight — otherwise it's a single check.
  useEffect(() => {
    if (!user) {
      setScrapeStatus(null);
      wasRunning.current = false;
      return;
    }
    pollScrapeStatus();
  }, [user, pollScrapeStatus]);

  useEffect(() => {
    if (!scrapeStatus?.running) return;
    const timer = setInterval(pollScrapeStatus, SCRAPE_POLL_MS);
    return () => clearInterval(timer);
  }, [scrapeStatus?.running, pollScrapeStatus]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { token, user: created } = await apiSignup(name, email, password);
    setToken(token);
    setUser(created);
    return created;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user: found } = await apiLogin(email, password);
    setToken(token);
    setUser(found);
    return found;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const adoptToken = useCallback(async (token: string) => {
    setToken(token);
    setUser(await fetchMe());
  }, []);

  const updatePrefs = useCallback(
    async (prefs: { postal_code?: string; merchants?: AccountMerchant[] }) => {
      const updated = await updateMyPreferences(prefs);
      setUser(updated);
      if (updated.scrape_started) {
        wasRunning.current = true;
        setScrapeStatus({
          running: true,
          postal_code: updated.postal_code,
          merchant_count: updated.merchants.length,
          started_at: null,
          finished_at: null,
          ok: null,
          error: null,
          items_scraped: null,
        });
      }
      return updated;
    },
    [],
  );

  const merchantIds = useMemo(
    () => (user && user.merchants.length > 0 ? user.merchants.map((m) => m.id) : null),
    [user],
  );

  return (
    <AccountContext.Provider
      value={{
        user, loading, meta, merchantIds, scrapeStatus,
        signUp, signIn, signOut, adoptToken, updatePrefs,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}
