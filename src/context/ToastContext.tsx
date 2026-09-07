"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

interface Toast {
  id: number;
  message: string;
  /** Progress toasts (showProgressToast) don't auto-dismiss and show a
   * spinner instead of the checkmark — the caller owns their lifecycle via
   * updateProgressToast/dismissToast. */
  persistent: boolean;
}

interface ToastContextValue {
  showToast: (message: string) => void;
  /** For a multi-step operation (e.g. upload progress) that wants one toast
   * updated in place rather than a new transient toast per step. Returns an
   * id for updateProgressToast/dismissToast — the caller must dismiss it
   * itself once the operation ends, since it never auto-dismisses. */
  showProgressToast: (message: string) => number;
  updateProgressToast: (id: number, message: string) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string) => {
      toastId += 1;
      const id = toastId;
      setToasts((prev) => [...prev, { id, message, persistent: false }]);
      setTimeout(() => dismissToast(id), 3200);
    },
    [dismissToast]
  );

  const showProgressToast = useCallback((message: string) => {
    toastId += 1;
    const id = toastId;
    setToasts((prev) => [...prev, { id, message, persistent: true }]);
    return id;
  }, []);

  const updateProgressToast = useCallback((id: number, message: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, message } : t)));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showProgressToast, updateProgressToast, dismissToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-in pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 py-3 pl-4 pr-2 text-sm font-medium text-white shadow-lg shadow-black/20"
          >
            {t.persistent ? (
              <Spinner className="h-4 w-4 flex-shrink-0 text-blue-400" />
            ) : (
              <svg
                className="h-4 w-4 flex-shrink-0 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="flex-shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
