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

type ToastItem = {
  id: number;
  message: string;
  action?: ToastAction;
};

type ToastContextValue = {
  toast: (message: string, opts?: { action?: ToastAction; duration?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4500;

/**
 * Lightweight toast stack, bottom-center. Each toast auto-dismisses;
 * an optional action ("Undo", "View list") dismisses on click. Capped
 * at 3 visible so rapid adds don't wall the screen.
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
    (message: string, opts?: { action?: ToastAction; duration?: number }) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { id, message, action: opts?.action }]);
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
            className="animate-toast pointer-events-auto flex items-center gap-4 bg-ink text-paper border-2 border-ink pl-4 pr-2 py-2 shadow-[4px_4px_0_var(--color-tag)] max-w-[92vw]"
          >
            <span className="text-sm truncate">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-tag hover:text-paper px-2 py-1 rounded-sm transition-colors shrink-0"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-paper/50 hover:text-paper text-base leading-none px-1.5 py-1 transition-colors shrink-0"
            >
              ×
            </button>
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
