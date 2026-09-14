"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastAction = { label: string; onClick: () => void };

/** What the left indicator bar says. `info` (the default) is the
 *  accent green — "done, here's an undo"; `error` is `danger` — "this
 *  didn't work". Optional and defaulted so every existing `toast(msg)`
 *  call site keeps working untouched; the failure paths in trips.tsx /
 *  account.tsx / settings can opt in by passing
 *  `{ kind: "error" }` without any change here. */
export type ToastKind = "info" | "error";

/** `action` for the common single button; `actions` when a toast needs
 *  two ("Change" + "View list" after an add). Both may be given — the
 *  single one is rendered first. More than two is capped. */
type ToastOptions = { action?: ToastAction; actions?: ToastAction[]; duration?: number; kind?: ToastKind };

type ToastItem = {
  id: number;
  message: string;
  actions: ToastAction[];
  kind: ToastKind;
};

type ToastContextValue = {
  toast: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4500;

/**
 * Lightweight toast stack, bottom-center. Each toast auto-dismisses;
 * an optional action ("Undo", "View list") dismisses on click. Capped
 * at 3 visible so rapid adds don't wall the screen.
 *
 * Visually it's a small white card — hairline, `rounded-control`, a
 * diffuse shadow — with one coloured rule down the leading edge, not
 * the solid ink slab it used to be. A toast interrupts by appearing at
 * all; it doesn't also need to be the darkest thing on screen.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, opts?: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [
        ...prev.slice(-(MAX_VISIBLE - 1)),
        {
          id,
          message,
          actions: [...(opts?.action ? [opts.action] : []), ...(opts?.actions ?? [])].slice(0, 2),
          kind: opts?.kind ?? "info",
        },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), opts?.duration ?? DEFAULT_DURATION),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-toast pointer-events-auto flex items-stretch overflow-hidden rounded-control border border-line bg-surface shadow-soft-lg max-w-[92vw]"
          >
            {/* The kind indicator: a rule down the leading edge rather
                than a tinted fill, so the card stays white and the text
                keeps full contrast either way. */}
            <span
              aria-hidden
              className={`w-[3px] shrink-0 ${t.kind === "error" ? "bg-danger" : "bg-accent"}`}
            />
            <div className="flex items-center gap-3 pl-3.5 pr-2 py-2 min-w-0">
              <span className="text-sm text-ink truncate">{t.message}</span>
              {t.actions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    action.onClick();
                    dismiss(t.id);
                  }}
                  className="text-[13px] font-semibold text-accent hover:text-accent-dark px-2 py-1 rounded-control transition-colors shrink-0"
                >
                  {action.label}
                </button>
              ))}
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-ink-muted hover:text-ink text-base leading-none px-1.5 py-1 rounded-control transition-colors shrink-0"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
