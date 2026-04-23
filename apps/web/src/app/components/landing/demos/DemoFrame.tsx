"use client";

import React from "react";

/**
 * Sdílený rám pro interaktivní demo moduly na homepage.
 * Dodává konzistentní „okno produktu" feeling napříč showcase sekcemi —
 * traffic-light dots, horní lišta s labelem a volitelný status badge.
 */
export function DemoFrame({
  label,
  status,
  statusTone = "emerald",
  children,
  className = "",
  contentClassName = "",
}: {
  label: string;
  status?: string;
  statusTone?: "emerald" | "indigo" | "amber" | "rose" | "slate";
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const toneMap: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    slate: "bg-white/5 text-slate-300 border-white/10",
  };

  return (
    <div
      className={`relative rounded-[28px] border border-white/10 bg-[#060918]/90 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex gap-1.5 shrink-0" aria-hidden>
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          </div>
          <span className="text-[11px] md:text-xs font-semibold text-slate-300 font-jakarta tracking-wide truncate">
            {label}
          </span>
        </div>
        {status ? (
          <span
            className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${toneMap[statusTone]}`}
          >
            {status}
          </span>
        ) : null}
      </div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

/**
 * Hook — auto-trigger demo logiky, když se komponenta dostane do viewportu.
 * Respektuje `prefers-reduced-motion` (v tom případě rovnou přeskočí na finální stav).
 */
export function useInViewTrigger<T extends HTMLElement>(options?: {
  rootMargin?: string;
  threshold?: number;
}) {
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin: options?.rootMargin ?? "0px 0px -20% 0px", threshold: options?.threshold ?? 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [options?.rootMargin, options?.threshold]);

  return { ref, inView } as const;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
