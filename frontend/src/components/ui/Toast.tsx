import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: ToastAction;
}

type PushToast = (message: string, tone?: Toast["tone"], action?: ToastAction) => void;

const ToastContext = createContext<PushToast>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);

  const push = useCallback<PushToast>(
    (message, tone = "info", action) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, message, tone, action }]);
      // Give people a bit longer when there's something to click (e.g. Undo).
      setTimeout(() => dismiss(id), action ? 8000 : 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-4 rounded-md px-4 py-3 text-sm text-white shadow-lg ${
              t.tone === "error" ? "bg-red-600" : "bg-slate-800"
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded px-2 py-1 font-semibold text-indigo-200 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
