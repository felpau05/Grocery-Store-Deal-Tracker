"use client";

import { useRef, useState, type RefObject } from "react";
import { BTN_CART_ADD } from "@/lib/button";
import { CHIP_QUIET_LIGHT, CHIP_SOFT } from "@/lib/chip";
import { useDialogFocus } from "@/lib/hooks";
import { tripName, useTrips } from "@/lib/trips";

/**
 * "Which trip?" — asked the first time something is added from a deal
 * while trips exist but none has been chosen, and again whenever a
 * toast's "Change" is pressed (then it moves the item instead). The
 * choice becomes the active trip, so after this every add goes straight
 * there without asking.
 *
 * Rendered once in the layout; open/closed lives in TripsProvider.
 */
export default function TripPicker() {
  const { picker, closePicker } = useTrips();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(panelRef, picker !== null, closePicker);

  if (!picker) return null;
  // Keyed on the request, so the "new trip" field starts closed and
  // empty every time the picker opens for a different item.
  return <PickerDialog key={`${picker.mode}:${picker.name}`} panelRef={panelRef} />;
}

function PickerDialog({ panelRef }: { panelRef: RefObject<HTMLDivElement | null> }) {
  const { picker, trips, closePicker, choosePickerTrip } = useTrips();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  if (!picker) return null;
  const verb = picker.mode === "add" ? "Add" : "Move";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="animate-overlay absolute inset-0 bg-ink/30" onClick={closePicker} aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-picker-title"
        tabIndex={-1}
        className="animate-in relative w-full max-w-sm rounded-card bg-surface border border-line shadow-soft-lg outline-none overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <h2 id="trip-picker-title" className="font-display text-[17px] text-ink leading-snug">
            {verb} <span className="capitalize">&ldquo;{picker.name}&rdquo;</span> to…
          </h2>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto border-t border-line divide-y divide-line">
          {trips.map((trip) => {
            const isCurrent = picker.mode === "move" && trip.id === picker.fromTripId;
            return (
              <li key={trip.id}>
                <button
                  onClick={() => choosePickerTrip(trip.id)}
                  disabled={isCurrent}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink truncate">{tripName(trip)}</span>
                    <span className="block text-[12px] text-ink-muted">
                      <span className="font-mono tabular-nums">{trip.items.length}</span>{" "}
                      {trip.items.length === 1 ? "item" : "items"}
                      {isCurrent && " · it's here now"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-line px-5 py-3 bg-surface-2">
          {naming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                choosePickerTrip(null, name);
              }}
              className="flex gap-2"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name it (optional)"
                aria-label="New shopping trip name"
                autoFocus
                className="flex-1 min-w-0 rounded-control bg-surface border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none transition-colors"
              />
              <button type="submit" className={BTN_CART_ADD}>
                Create
              </button>
            </form>
          ) : (
            /* The same chip the cart drawer's footer wears — this is
               the same choice in a different frame, and it used to be
               bare green text in one and a button in the other. */
            <button
              onClick={() => setNaming(true)}
              className={`${CHIP_SOFT} w-full ${CHIP_QUIET_LIGHT}`}
            >
              <span aria-hidden>+</span> New shopping trip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
