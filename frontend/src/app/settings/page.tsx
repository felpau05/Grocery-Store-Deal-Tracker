"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAvailableMerchants, type AvailableMerchant } from "@/lib/api";
import { useAccount } from "@/lib/account";
import { useToast } from "@/lib/toast";
import { toggleChip } from "@/lib/toggleChip";
import { BTN_NUDGE_CTA, BTN_PRIMARY_CTA, BTN_SECONDARY } from "@/lib/button";
import BackLink from "@/components/BackLink";
import GlassCard, { GLASS_SURFACE_DENSE, NUDGE_BANNER_SURFACE } from "@/components/GlassCard";
import { Segmented } from "@/components/DealsSidebar";

const POSTAL_RE = /^[A-Za-z]\d[A-Za-z]\s?-?\d[A-Za-z]\d$/;

/** A clean white field: hairline at rest, accent border on focus (the
 *  global :focus-visible outline supplies the ring). No width or text
 *  size here — call sites differ on both, and a `w-full` baked in here
 *  would fight the `w-44` the postal box wants. */
const FIELD =
  "rounded-control bg-surface border border-line px-3.5 py-2.5 text-ink " +
  "placeholder:text-ink-muted focus:border-accent transition-colors";

/** The accent tick inside a selected store row. */
function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3"
      aria-hidden
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, scrapeStatus, signOut, updatePrefs } = useAccount();
  const { toast } = useToast();

  const [postal, setPostal] = useState("");
  const [stores, setStores] = useState<AvailableMerchant[] | null>(null);
  // The postal code `stores` was actually fetched for — NOT the input's
  // current value, which the user is free to keep typing in after a
  // lookup. Everything that names the code the list belongs to (the
  // no-coverage warning below) has to quote this one or it will
  // eventually name a code nobody searched.
  const [storesPostal, setStoresPostal] = useState("");
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [groceryOnly, setGroceryOnly] = useState(true);
  const [storeFilter, setStoreFilter] = useState("");
  // id -> name of chosen stores (name kept because some aren't in our DB yet)
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  // Set by a successful save, cleared the moment the selection stops
  // matching what was saved — so the "you're done, go and look" panel
  // never tells someone their unsaved edits are live. null = nothing
  // saved in this visit yet.
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [savedScraping, setSavedScraping] = useState(false);

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
      setStoresPostal(code.trim());
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

  // When the background scrape finishes, re-fetch the store list so
  // newly-tracked stores sort to the top and the count above updates.
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
      // Drives the success panel below — the forward path. The toast
      // says the same thing but is gone in 4.5 seconds, which is how
      // someone ends up parked on this page with the only route onward
      // being small grey text beside a button they already pressed.
      setSavedCount(updated.merchants.length);
      setSavedScraping(updated.scrape_started);
      if (updated.scrape_started) {
        toast("Saved — gathering deals for your area now, new stores fill in over the next few minutes");
      } else {
        toast(
          `Saved — tracking ${updated.merchants.length} ${updated.merchants.length === 1 ? "store" : "stores"}`,
          { action: { label: "View deals", onClick: () => router.push("/deals") } },
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  // How many of this postal code's stores we actually hold deals for.
  // Zero means every row in the picker below is a "new" store and the
  // account would be saved into a guaranteed-empty deals page — worth
  // saying out loud BEFORE they start ticking boxes.
  const trackedCount = useMemo(
    () => (stores ? stores.filter((s) => s.tracked).length : 0),
    [stores],
  );

  const visibleStores = useMemo(() => {
    if (!stores) return [];
    const f = storeFilter.trim().toLowerCase();
    return (
      stores
        .filter((s) => !groceryOnly || s.is_grocery || selected.has(s.id))
        .filter((s) => !f || s.name.toLowerCase().includes(f))
        // Stores we already have deals for first — the list runs to ~50
        // rows inside a scroll box, and a tracked store buried at row 40
        // is, for onboarding purposes, a store that isn't there. Ties
        // keep Flipp's own order (sort is stable), so this only ever
        // lifts the rows that pay off immediately rather than
        // re-shuffling the list into some order of our own.
        .sort((a, b) => Number(b.tracked) - Number(a.tracked))
    );
  }, [stores, groceryOnly, storeFilter, selected]);

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-14">
        {/* No card here — raw page gradient, so --color-ink, not
            --color-ink-soft. */}
        <p className="text-sm text-ink animate-pulse">Checking your session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="max-w-md mx-auto px-6 py-14">
        <GlassCard surfaceClassName={`${GLASS_SURFACE_DENSE} p-8 text-center`}>
          <h1 className="font-display text-2xl text-ink">Settings are private</h1>
          <p className="text-[14px] text-ink-soft mt-2.5 leading-relaxed">
            Sign in to set your postal code and pick the stores you shop at — then your deals page
            is only those stores.
          </p>
          <GlassCard
            as={Link}
            href="/login"
            wrapperClassName="mt-6"
            surfaceClassName={`${BTN_PRIMARY_CTA} block text-center`}
          >
            Sign in or create an account
          </GlassCard>
        </GlassCard>
      </main>
    );
  }

  return (
    // At `wide:` one fixed screen under the header, like /deals and the
    // trip pages: the store list is the only thing that scrolls, so the
    // save bar under it is always on screen. It used to sit below a
    // 70vh scroll box plus everything above it — past the fold, reachable
    // only by scrolling the page rather than the list.
    <main className="max-w-[1400px] mx-auto px-6 py-10 wide:py-6 wide:h-[calc(100svh-var(--header-h))] wide:flex wide:flex-col wide:overflow-hidden">
      <h1 className="font-display text-3xl text-ink mb-6 wide:mb-5 shrink-0">Account</h1>

      {/* Who you are and where you are on the left — two short cards you
          set once — and the store picker on the right, which is a list
          of a few hundred and the only thing here that wants room. It
          was stacked under them in a 768px column, so the two settings
          you change least pushed the one you actually came for below
          the fold. */}
      <div className="grid grid-cols-1 wide:grid-cols-[minmax(0,400px)_1fr] wide:grid-rows-[minmax(0,1fr)] gap-8 items-start wide:flex-1 wide:min-h-0">
      <div className="wide:min-h-0 wide:max-h-full wide:overflow-y-auto">
      {/* ── Who you are ──────────────────────────────────────────── */}
      <GlassCard
        wrapperClassName="mb-5"
        surfaceClassName={`${GLASS_SURFACE_DENSE} p-5 flex items-center justify-between gap-4 flex-wrap`}
      >
        <div className="min-w-0">
          <p className="font-display text-ink text-[15px]">{user.name}</p>
          <p className="text-[13px] text-ink-soft mt-0.5 truncate">
            {user.email} ·{" "}
            {user.postal_code ? (
              <span className="font-mono">{user.postal_code}</span>
            ) : (
              "no postal code yet"
            )}
          </p>
        </div>
        <button
          onClick={() => {
            signOut();
            toast("Signed out");
            router.push("/");
          }}
          className={BTN_SECONDARY}
        >
          Sign out
        </button>
      </GlassCard>

      {/* ── Your area ────────────────────────────────────────────── */}
      <GlassCard wrapperClassName="mb-5 wide:mb-0" surfaceClassName={`${GLASS_SURFACE_DENSE} p-5`}>
        <h2 className="font-display text-ink text-lg">Your area</h2>
        <p className="text-[13px] text-ink-soft mt-1 mb-4">
          Enter your postal code to see deals near you.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            findStores(postal);
          }}
        >
          <label htmlFor="postal" className="label-soft block text-[13px] text-ink mb-1.5">
            Postal code
          </label>
          <div className="flex gap-2 flex-wrap">
            <input
              id="postal"
              value={postal}
              onChange={(e) => {
                // Same as the store rows: a changed postal code means the
                // "Saved" panel no longer describes the form.
                setSavedCount(null);
                setPostal(e.target.value.toUpperCase());
              }}
              placeholder="K2J 4G8"
              maxLength={7}
              className={`${FIELD} w-44 font-mono text-sm`}
            />
            <button type="submit" disabled={storesLoading} className={BTN_SECONDARY}>
              {storesLoading ? "Searching…" : "Find stores"}
            </button>
          </div>
        </form>

        {storesError && (
          <p
            role="alert"
            className="mt-3 rounded-control border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger"
          >
            {storesError}
          </p>
        )}

        {storesLoading && (
          <p className="text-[13px] text-ink-soft animate-pulse mt-3">
            Asking Flipp what&apos;s on near {postal || "you"}…
          </p>
        )}

        {/* The scrape trigger's status. Saving IS the trigger (the API
            starts a scrape for a new area), so this lives with the area
            rather than with the picker. */}
        {scrapeStatus?.running && (
          <div className={`mt-4 ${NUDGE_BANNER_SURFACE}`}>
            <p className="text-[13px] text-ink-soft min-w-0">
              <span className="animate-pulse mr-1.5" aria-hidden>
                ⟳
              </span>
              <span className="font-semibold text-ink">Gathering flyers</span> for{" "}
              <span className="font-mono text-ink">{scrapeStatus.postal_code}</span> — your new
              stores&apos; deals appear as this finishes.
            </p>
          </div>
        )}
      </GlassCard>

      </div>

      {/* ── Store picker ─────────────────────────────────────────── */}
      <div className="min-w-0 wide:h-full wide:min-h-0">
      <GlassCard wrapperClassName="wide:h-full" surfaceClassName={`${GLASS_SURFACE_DENSE} p-5 flex flex-col wide:h-full`}>
        <div className="shrink-0 flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-display text-ink text-lg">Your stores</h2>
          {/* Plainly how many rows you're looking at out of how many there
              are. This used to append "· N with deal data", which named
              what the rows are sorted by — that rationale now lives only
              in the sort's own comment, so if the ordering ever looks
              arbitrary, this line is why it used to be spelled out. */}
          {stores && !storesLoading && (
            <span className="text-[13px] text-ink-muted">
              Showing <span className="font-mono">{visibleStores.length}</span> of{" "}
              <span className="font-mono">{stores.length}</span> stores
            </span>
          )}
        </div>
        <p className="shrink-0 text-[13px] text-ink-soft mt-1">
          Select the stores you want to see deals for.
        </p>

        {/* The worst onboarding moment this app has: a postal code we
            hold nothing for still returns a full ~50-store picker, every
            row tagged "new", and nothing tells you until after you've
            chosen, saved, and landed on an empty deals page. Say it here
            — before any of that effort — and say what saving will
            actually do, since saving IS the right next step (it's what
            starts the first scrape). Deliberately not a toast: this has
            to still be on screen while they work through the list. */}
        {stores && !storesLoading && trackedCount === 0 && (
          <div
            className={`shrink-0 mt-4 rounded-card border px-4 py-3 ${
              stores.length === 0 ? "border-danger/25 bg-danger-soft" : "border-line bg-accent-soft"
            }`}
          >
            <p
              className={`label-soft text-[13px] ${
                stores.length === 0 ? "text-danger" : "text-accent-dark"
              }`}
            >
              {stores.length === 0 ? "No stores found" : "No deals here yet"}
            </p>
            {stores.length === 0 ? (
              <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
                Flipp doesn&apos;t list any stores for{" "}
                <span className="font-mono text-ink">{storesPostal}</span>. Double-check the code —
                if it&apos;s right, this area isn&apos;t covered and there&apos;s nothing to track
                yet.
              </p>
            ) : (
              <p className="text-[13px] text-ink-soft mt-1 leading-relaxed">
                We don&apos;t have deal data for{" "}
                <span className="font-mono text-ink">{storesPostal}</span> yet — all{" "}
                {stores.length} stores below are new to us, so your deals page will be empty at
                first. Pick the ones you shop at and save anyway: saving starts the first scrape
                for this area, and deals fill in over the next few minutes.
              </p>
            )}
          </div>
        )}

        {!stores && !storesLoading && (
          <p className="shrink-0 mt-4 rounded-control border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-soft">
            Enter your postal code above and hit &quot;Find stores&quot; to see what&apos;s near
            you.
          </p>
        )}

        {stores && !storesLoading && (
          <div className="mt-4 wide:flex-1 wide:min-h-0 wide:flex wide:flex-col">
            <div className="shrink-0 flex items-center justify-between gap-3 flex-wrap mb-3">
              {/* Either/or, so it reads as one control with two states
                  rather than a lone button whose off-state you have to
                  infer. `groceryOnly` stays the underlying boolean — the
                  filter below is unchanged — this is only how the choice
                  is presented. */}
              <Segmented
                className="shrink-0"
                label="Which stores to show"
                value={groceryOnly ? "grocery" : "all"}
                options={[
                  { id: "all", label: "All stores" },
                  { id: "grocery", label: "Grocery stores" },
                ]}
                onSelect={(id) => setGroceryOnly(id === "grocery")}
              />
              <input
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                placeholder="Filter stores…"
                aria-label="Filter stores by name"
                className={`${FIELD} w-44 text-[13px] py-1.5`}
              />
            </div>

            <ul className="grid sm:grid-cols-2 wide:grid-cols-3 content-start gap-2 max-h-96 wide:max-h-none wide:flex-1 wide:min-h-0 overflow-y-auto pr-1">
              {visibleStores.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => {
                        // Editing the selection makes the "Saved"
                        // panel a lie — retire it until the next save.
                        setSavedCount(null);
                        setSelected((prev) => {
                          const next = new Map(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.set(s.id, s.name);
                          return next;
                        });
                      }}
                      aria-pressed={checked}
                      // `rounded-control!` beats toggleChip()'s own
                      // rounded-pill, which is right for a chip and wrong
                      // for a full-width two-line row. The important
                      // modifier is the only thing that wins here — both
                      // are plain utilities, and .rounded-pill is emitted
                      // later in the sheet.
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-control! ${toggleChip(
                        checked,
                        "bg-accent-soft border-accent/40",
                        "bg-surface border-line hover:bg-surface-2 hover:border-line-strong",
                      )}`}
                    >
                      <span
                        className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 ${
                          checked
                            ? "bg-accent border-accent text-white"
                            : "bg-surface border-line-strong"
                        }`}
                        aria-hidden
                      >
                        {checked && <CheckGlyph />}
                      </span>
                      {s.logo && (
                        <img src={s.logo} alt="" className="w-7 h-7 object-contain shrink-0" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-ink truncate">
                          {s.name}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {/* Only when something was filtered OUT — with an empty
                store list to begin with there is no filter to clear, and
                the no-coverage panel above has already explained why. */}
            {visibleStores.length === 0 && stores.length > 0 && (
              <p className="text-[13px] text-ink-soft py-4 text-center">
                No stores match — clear the filter or turn off &quot;Groceries only&quot;.
              </p>
            )}
          </div>
        )}

        {/* The forward path, after the only action on this page has been
            taken. Saving used to leave the visitor here with nothing
            obviously next: the real next step ("View my deals →") was
            small grey text sitting to the LEFT of a large green button
            they had just pressed, which reads as a caption on it rather
            than as the way out. This panel puts the onward move where
            the eye already is — under the thing that just happened —
            and at the size of a decision. The footer link below stays
            as the always-available shortcut for people who didn't
            change anything. */}
        {savedCount !== null && (
          <div className={`animate-in shrink-0 mt-5 ${NUDGE_BANNER_SURFACE}`}>
            <div className="min-w-0">
              <p className="label-soft text-[13px] text-accent-dark">Saved</p>
              <p className="text-[13px] text-ink-soft mt-0.5">
                {savedScraping ? (
                  <>
                    Gathering flyers for{" "}
                    <span className="font-mono text-ink">{postal.trim()}</span> now — your new
                    stores&apos; deals fill in over the next few minutes.
                  </>
                ) : (
                  <>
                    Tracking{" "}
                    <span className="font-semibold text-ink">
                      {savedCount} {savedCount === 1 ? "store" : "stores"}
                    </span>
                    . That&apos;s everything this page needs.
                  </>
                )}
              </p>
            </div>
            {/* Back, not "View my deals". Saving stores is something you
                do on the way to somewhere — often from the deals page
                itself — so the onward move is the way you came, not a
                fixed destination that might be where you already were.
                Styled as the panel's CTA (BackLink's own quiet text
                treatment is deliberately too light for this slot) but
                with BackLink's behaviour: history back, /deals only as
                the fallback for a direct visit. */}
            <button
              onClick={() =>
                window.history.length > 1 ? router.back() : router.push("/deals")
              }
              className={BTN_NUDGE_CTA}
            >
              ← Back
            </button>
          </div>
        )}

        {/* mt-auto pins the save bar to the card's bottom at `wide:` even
            when there's no list above to fill the height. */}
        <div className="shrink-0 mt-auto pt-5">
        <div className="flex items-center justify-between gap-3 flex-wrap pt-4 border-t border-line">
          <span className="text-[13px] text-ink-soft">
            <span className="font-mono text-ink">{selected.size}</span>{" "}
            {selected.size === 1 ? "store" : "stores"} selected
          </span>
          <span className="flex items-center gap-4">
            {/* The always-available version of the same move, for
                someone who changed nothing. BackLink rather than a
                hand-rolled link: it already carries the chevron, the
                quiet treatment and the history-with-fallback logic. */}
            {user.merchants.length > 0 && <BackLink label="Back" />}
            <GlassCard
              as="button"
              onClick={onSave}
              disabled={saving}
              surfaceClassName={`${BTN_PRIMARY_CTA} px-6`}
            >
              {saving ? "Saving…" : "Save my stores"}
            </GlassCard>
          </span>
        </div>
        </div>
      </GlassCard>
      </div>
      </div>
    </main>
  );
}
