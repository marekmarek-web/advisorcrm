"use client";

import type { ReactNode } from "react";

export function PremiumPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: string;
}) {
  const tones: Record<string, string> = {
    default: "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text-secondary)]",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    dark: "border-white/10 bg-white/10 text-white",
  };

  return (
    <span
      className={`inline-flex items-center rounded-[12px] border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] ${tones[tone] || tones.default}`}
    >
      {children}
    </span>
  );
}

export function PremiumSectionTitle({
  symbol,
  title,
  subtitle,
  action,
}: {
  symbol: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[14px] bg-[color:var(--wp-surface-muted)] text-sm text-[color:var(--wp-text)] shadow-sm ring-1 ring-slate-200/70">
          {symbol}
        </div>
        <div>
          <h3 className="text-[1.05rem] font-black tracking-tight text-[color:var(--wp-text)]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs leading-5 text-[color:var(--wp-text-secondary)]">{subtitle}</p> : null}
        </div>
      </div>
      {action ?? null}
    </div>
  );
}

export function PremiumMetricCard({
  label,
  value,
  change,
  tone = "default",
  symbol = "•",
}: {
  label: string;
  value: string;
  change?: string;
  tone?: string;
  symbol?: string;
}) {
  const toneClass: Record<string, string> = {
    default: "border-[color:var(--wp-surface-card-border)]/80 bg-white",
    info: "border-sky-200/80 bg-sky-50/65",
    success: "border-emerald-200/80 bg-emerald-50/65",
    warn: "border-amber-200/80 bg-amber-50/65",
    danger: "border-rose-200/80 bg-rose-50/65",
    violet: "border-violet-200/80 bg-violet-50/65",
  };

  return (
    <div className={`rounded-[var(--wp-radius-card)] border ${toneClass[tone] || toneClass.default} p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--wp-text-secondary)]">{label}</p>
          <p className="mt-3 text-[2rem] font-black leading-none tracking-tight text-[color:var(--wp-text)]">{value}</p>
          {change ? <p className="mt-2 text-[11px] font-semibold text-[color:var(--wp-text-secondary)]">{change}</p> : null}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-white/90 text-sm text-[color:var(--wp-text)] shadow-sm ring-1 ring-black/5">
          {symbol}
        </div>
      </div>
    </div>
  );
}

export function PremiumProgressBar({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "amber" | "sky" | "violet";
}) {
  const toneClass: Record<string, string> = {
    slate: "bg-slate-900",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    violet: "bg-violet-500",
  };

  const width = `${Math.max(0, Math.min(100, value))}%`;

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--wp-text-secondary)]">{label}</span>
        <span className="text-sm font-black tabular-nums text-[color:var(--wp-text)]">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[color:var(--wp-surface-muted)]/80">
        <div className={`h-2 rounded-full transition-all duration-300 ${toneClass[tone]}`} style={{ width }} />
      </div>
    </div>
  );
}

export function PremiumToggleGroup({
  items,
  active,
  onChange,
}: {
  items: string[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-stretch gap-1 rounded-[22px] border border-[color:var(--wp-surface-card-border)]/90 bg-white p-1 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`inline-flex h-10 min-w-[3.25rem] items-center justify-center rounded-[18px] px-4 text-[11px] font-extrabold uppercase leading-none tracking-[0.16em] transition-colors duration-200 ${
            active === item
              ? "bg-[#16192b] text-white shadow-sm shadow-[#16192b]/20"
              : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-main-scroll-bg)] hover:text-[color:var(--wp-text)]"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
