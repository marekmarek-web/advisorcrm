"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { TypingDots } from "./TypingDots";

export type ToastVariant = "success" | "error" | "info" | "loading";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;
function nextId() {
  return String(++toastId);
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx)
    return {
      showToast: () => {},
      toasts: [],
      dismissToast: () => {},
    };
  return ctx;
}

const AUTO_DISMISS_MS = 4000;
const LOADING_DISMISS_MS = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: string) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success", duration?: number) => {
      const id = nextId();
      const d = duration ?? (variant === "loading" ? LOADING_DISMISS_MS : AUTO_DISMISS_MS);
      const item: ToastItem = { id, message, variant, duration: d };
      setToasts((prev) => [...prev.slice(-4), item]);

      if (d > 0) {
        timersRef.current[id] = setTimeout(() => {
          delete timersRef.current[id];
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, d);
      }
    },
    [],
  );

  useEffect(() => () => Object.values(timersRef.current).forEach(clearTimeout), []);

  return (
    <ToastContext.Provider value={{ showToast, toasts, dismissToast }}>
      {children}
      <Suspense fallback={null}>
        <ToastFromUrl showToast={showToast} />
      </Suspense>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const style =
    item.variant === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : item.variant === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : item.variant === "info"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-slate-200 bg-slate-50 text-slate-800";

  return (
    <div
      role={item.variant === "loading" ? "status" : "alert"}
      className={`rounded-lg border px-4 py-3 shadow-lg ${style}`}
    >
      <div className="flex items-center gap-2">
        {item.variant === "loading" && <TypingDots className="shrink-0" />}
        <span className="flex-1">{item.message}</span>
      </div>
    </div>
  );
}

type ToastType = "success" | "error";

function ToastFromUrl({
  showToast,
}: {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const seen = useRef<string | null>(null);

  useEffect(() => {
    const msg = searchParams.get("toast");
    const type = (searchParams.get("toastType") === "error" ? "error" : "success") as ToastType;
    if (!msg) return;
    const key = `${pathname}?${searchParams.toString()}`;
    if (seen.current === key) return;
    seen.current = key;
    showToast(decodeURIComponent(msg), type);
    const next = new URLSearchParams(searchParams);
    next.delete("toast");
    next.delete("toastType");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, searchParams, router, showToast]);

  return null;
}
