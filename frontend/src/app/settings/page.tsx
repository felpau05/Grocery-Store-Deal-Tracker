"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAvailableMerchants, type AvailableMerchant } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { useToast } from "@/lib/toast";
import { toggleChip } from "@/lib/toggleChip";
import GlassCard, { GLASS_SURFACE_DENSE } from "@/components/GlassCard";

const POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?-?\d[A-Za-z]\d$/;

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, scrapeStatus, signOut, updatePrefs } = useAccount();
  const { toast } = useToast();

  const [postal, setPostal] = useState("");
  const [stores, setStores] = useState<AvailableMerchant[] | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [groceryOnly, setGroceryOnly] = useState(true);
  const [storeFilter, setStoreFilter] = useState("");
  // id -> name of chosen stores (name kept because some aren't in our DB yet)
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);

  // Mirror the account's saved prefs into the form whenever it loads.
  useEffect(() => {
    setPostal(user?.postal_code ?? "");
    setSelected(new Map((user?.merchants ?? []).map((m) => [m.id, m.name])));
  }, [user]);

  async function findStores(code: string) {
    if (!POSTAL_RE.test(code.trim())) {
      setStoresError("That doesn't look like a Canadian postal code.");
      return;
    }
    setStoresLoading(true);
    setStoresError(null);
    try {
      const fetched = await fetchAvailableMerchants(code.trim());
      setStores(fetched);
      // Merchant selection is scoped to a postal code's own store list —
      // a store picked under an old postal code (or one Flipp doesn't
      // serve here) has no items for THIS region and, worse, isn't in
      // `fetched` so it can never be seen or unchecked in the picker
      // below. Prune it here, the one place every region's store list
      // actually loads, rather than let it ride invisibly into every
      // future save. (This is what silently produced "0 deals" for an
      // account whose postal code changed but whose old region's stores
      // stayed selected underneath.)
      const validIds = new Set(fetched.map((s) => s.id));
      const stale = [...selected.keys()].filter((id) => !validIds.has(id));
      if (stale.length > 0) {
        setSelected((prev) => {
          const next = new Map(prev);
          for (const id of stale) next.delete(id);
          return next;
        });
        toast(
          `Removed ${stale.length} ${stale.length === 1 ? "store" : "stores"} that don't serve ${code.trim()} — pick your stores for this area`,
        );
      }
    } catch {
      setStoresError("Couldn't reach Flipp for that postal code — try again shortly.");
      setStores(null);
    } finally {
      setStoresLoading(false);
    }
  }

  // A saved postal code means the store list can load itself — don't
  // make returning users re-click "Find stores" every visit.
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current || !user?.postal_code || stores !== null || storesLoading) return;
    autoLoaded.current = true;
    findStores(user.postal_code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, stores, storesLoading]);

  // When the background scrape finishes, re-fetch the store list so the
  // "○ new — data after next scrape" badges flip to "● has deal data".
  const prevScraping = useRef(false);
  useEffect(() => {
    const running = scrapeStatus?.running ?? false;
    if (prevScraping.current && !running && POSTAL_RE.test(postal.trim())) {
      findStores(postal);
    }
    prevScraping.current = running;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrapeStatus?.running]);

  async function onSave() {
    // Never silently drop a bad postal code — either it saves or the
    // user hears exactly why nothing was saved.
    const trimmed = postal.trim();
    if (trimmed && !POSTAL_RE.test(trimmed)) {
      setStoresError("Nothing saved — that postal code doesn't look valid. Fix it and save again.");
      return;
    }
    setStoresError(null);
    setSaving(true);
    try {
      const updated = await updatePrefs({
        postal_code: trimmed || undefined,
        merchants: [...selected.entries()].map(([id, name]) => ({ id, name })),
      });
      if (updated.scrape_started) {
        toast("Saved — gathering deals for your area now, new stores fill in over the next few minutes");
      } else {
        toast(
          `Saved — tracking ${updated.merchants.length} ${updated.merchants.length === 1 ? "store" : "stores"}`,
          { action: { label: "View deals", onClick: () => router.push("/") } },
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  const visibleStores = useMemo(() => {
    if (!stores) return [];
    const f = storeFilter.trim().toLowerCase();
    return stores
      .filter((s) => !groceryOnly || s.is_grocery || selected.has(s.id))
      .filter((s) => !f || s.name.toLowerCase().includes(f));
  }, [stores, groceryOnly, storeFilter, selected]);

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-14">
        {/* No card here — raw gradient background, so --color-ink, not
            --color-ink-soft. */}
        <p className="font-mono text-sm text-ink animate-pulse">checking your session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="max-w-md mx-auto px-6 py-14 text-center">
        <span className="stamp text-sale text-sm">Members only</span>
        <h1 className="font-display text-3xl text-ink mt-5">Settings are private</h1>
        <p className="text-ink mt-3">
          Sign in to set your postal code and pick the stores you shop at.
        </p>
        <GlassCard
          as={Link}
          href="/login"
          wrapperClassName="inline-block mt-6"
          surfaceClassName="glow-btn px-6 py-3 bg-sale text-paper font-display"
        >
          Sign in / create account →
        </GlassCard>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-4xl sm:text-5xl text-ink leading-[0.95] mt-3">
          Account
        </h1>
      </header>

      {/* ── Account ──────────────────────────────────────────── */}
      <GlassCard
        wrapperClassName="mb-8"
        surfaceClassName={`${GLASS_SURFACE_DENSE} p-5 flex items-center justify-between gap-4 flex-wrap`}
      >
        <div>
          <p className="font-display text-ink">{user.name}</p>
          <p className="font-mono text-[12px] text-ink-soft mt-0.5">
            {user.email} · {user.postal_code ?? "no postal code yet"}
          </p>
        </div>
        <button
          onClick={() => {
            signOut();
            toast("Signed out");
            router.push("/");
          }}
          className="btn-brut-ink px-4 py-2 bg-card text-ink font-mono font-bold text-[12px] uppercase"
        >
          Sign out
        </button>
      </GlassCard>

      {/* ── Location + stores ────────────────────────────────── */}
      <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-5`}>
        <h2 className="font-display text-ink text-lg mb-1">Your stores</h2>
        <p className="text-[13px] text-ink-soft mb-4">
          Enter your postal code to see every store with active deals near you, then pick the ones you want to shop at.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            findStores(postal);
          }}
          className="flex gap-2 mb-1"
        >
          <input
            value={postal}
            onChange={(e) => setPostal(e.target.value.toUpperCase())}
            placeholder="POSTAL CODE"
            maxLength={7}
            className="w-56 bg-paper border-2 border-ink px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-soft/60 focus:bg-tag/20 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={storesLoading}
            className="btn-brut-ink px-4 py-2 bg-produce text-paper text-sm font-mono font-bold disabled:opacity-40"
          >
            {storesLoading ? "Searching…" : "Find stores"}
          </button>
        </form>
        {storesError && (
          <p className="font-mono text-[12px] text-sale-dark mt-2">{storesError}</p>
        )}

        {storesLoading && (
          <p className="font-mono text-sm text-ink-soft animate-pulse mt-4">
            asking Flipp what&apos;s flying near {postal || "you"}…
          </p>
        )}

        {stores && !storesLoading && (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setGroceryOnly((v) => !v)}
                  className={`text-[11px] font-mono font-bold px-2.5 py-1 ${toggleChip(
                    groceryOnly,
                    "bg-produce text-paper border-ink shadow-[2px_2px_0_var(--color-shadow)]",
                    "border-ink/25 text-ink-soft hover:border-ink",
                  )}`}
                >
                  🥬 Groceries only
                </button>
                <span className="font-mono text-[11px] text-ink-soft">
                  {visibleStores.length} of {stores.length} stores
                </span>
              </div>
              <input
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                placeholder="filter…"
                className="w-36 bg-paper border-2 border-ink/40 px-2.5 py-1 font-mono text-[12px] text-ink placeholder:text-ink-soft/60 focus:border-ink outline-none transition-colors"
              />
            </div>

            <ul className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
              {visibleStores.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Map(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.set(s.id, s.name);
                          return next;
                        })
                      }
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${toggleChip(
                        checked,
                        "bg-tag/40 border-ink shadow-[2px_2px_0_var(--color-shadow)]",
                        "bg-card border-ink/20 hover:border-ink",
                      )}`}
                    >
                      <span
                        className={`w-4 h-4 border-2 border-ink flex items-center justify-center font-mono font-bold text-[10px] shrink-0 ${
                          checked ? "bg-sale text-paper" : "bg-paper"
                        }`}
                        aria-hidden
                      >
                        {checked ? "✓" : ""}
                      </span>
                      {s.logo && (
                        <img src={s.logo} alt="" className="w-7 h-7 object-contain shrink-0" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-bold text-ink truncate">{s.name}</span>
                        <span className="block font-mono text-[9px] uppercase tracking-[0.08em] text-ink-soft">
                          {s.tracked ? "● has deal data" : "○ new — data after next scrape"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {visibleStores.length === 0 && (
              <p className="text-sm text-ink-soft py-4 text-center">
                No stores match — clear the filter or turn off &quot;groceries only&quot;.
              </p>
            )}
          </div>
        )}

        {scrapeStatus?.running && (
          <div className="mt-5 border-2 border-ink bg-tag/30 px-4 py-3 flex items-center gap-3">
            <span className="font-mono font-bold text-sm animate-pulse" aria-hidden>⟳</span>
            <p className="text-[13px] text-ink">
              <span className="font-mono font-bold uppercase tracking-[0.1em] mr-2">Scraping</span>
              gathering flyers for <span className="font-mono font-bold">{scrapeStatus.postal_code}</span> — your
              new stores&apos; deals appear as this finishes.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t-2 border-ink/15">
          <span className="font-mono text-[12px] text-ink-soft">
            {selected.size} {selected.size === 1 ? "store" : "stores"} selected
          </span>
          <span className="flex items-center gap-3">
            {user.merchants.length > 0 && (
              <Link
                href="/"
                className="font-mono font-bold text-[12px] uppercase text-ink-soft hover:text-sale transition-colors"
              >
                View my deals →
              </Link>
            )}
            <GlassCard
              as="button"
              onClick={onSave}
              disabled={saving}
              surfaceClassName="glow-btn px-5 py-2.5 bg-sale text-paper font-display text-sm"
            >
              {saving ? "Saving…" : "Save my stores"}
            </GlassCard>
          </span>
        </div>
      </GlassCard>
    </main>
  );
}
