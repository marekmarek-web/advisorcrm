"use client";

import { type ButtonHTMLAttributes, type ReactNode, createElement, useEffect, useState } from "react";
import { X, Plus, AlertCircle, Wifi, WifiOff, PackageOpen, RefreshCw } from "lucide-react";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

type ClassName = { className?: string };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function MobileAppShell({
  children,
  className,
  deviceClass = "phone",
}: {
  children: ReactNode;
  deviceClass?: DeviceClass;
} & ClassName) {
  return (
    <div
      className={cx(
        "flex min-h-screen flex-col bg-[color:var(--wp-bg)] text-[color:var(--wp-text)]",
        deviceClass === "phone" && "pb-[calc(96px+var(--safe-area-bottom))]",
        deviceClass === "tablet" && "pb-[calc(72px+var(--safe-area-bottom))]",
        deviceClass === "desktop" && "pb-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MobileHeader({
  title,
  subtitle,
  left,
  right,
  className,
  deviceClass = "phone",
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  deviceClass?: DeviceClass;
} & ClassName) {
  return (
    <header
      className={cx(
        "sticky top-0 z-40 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/90 backdrop-blur",
        "pt-[calc(var(--safe-area-top)+0.5rem)] pb-3",
        deviceClass === "phone" && "px-4",
        deviceClass === "tablet" && "px-6",
        className
      )}
    >
      <div className={cx("min-h-[44px] flex items-center justify-between gap-3", deviceClass === "tablet" && "max-w-3xl mx-auto")}>
        <div className="min-w-0 flex items-center gap-2">{left}</div>
        <div className="min-w-0 flex-1">
          <h1
            className={cx(
              "truncate text-center font-black text-[color:var(--wp-text)]",
              deviceClass === "tablet" ? "text-lg" : "text-base"
            )}
          >
            {title}
          </h1>
          <p className="truncate text-center text-[11px] text-[color:var(--wp-text-secondary)]">{subtitle || "\u00A0"}</p>
        </div>
        <div className="min-w-0 flex items-center justify-end gap-2">{right}</div>
      </div>
    </header>
  );
}

function NavTabButton({
  item,
  active,
  deviceClass,
  onSelect,
}: {
  item: { id: string; label: string; icon: React.ComponentType<{ size?: number }>; badge?: number };
  active: boolean;
  deviceClass: DeviceClass;
  onSelect: (id: string) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "min-h-[44px] rounded-xl transition-colors duration-150",
        deviceClass === "tablet"
          ? "flex items-center gap-2 px-4 py-1.5 text-sm font-bold"
          : "flex flex-col items-center justify-center gap-1 text-[10px] font-bold",
        active
          ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
          : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
      )}
    >
      <div className="relative flex-shrink-0">
        {createElement(Icon, { size: deviceClass === "tablet" ? 18 : 20 })}
        {item.badge && item.badge > 0 ? (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 text-center">
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        ) : null}
      </div>
      <span className={deviceClass === "tablet" ? "" : "truncate max-w-[56px]"}>{item.label}</span>
    </button>
  );
}

export function MobileBottomNav({
  items,
  activeId,
  onSelect,
  deviceClass = "phone",
  centerFab,
}: {
  items: Array<{ id: string; label: string; icon: React.ComponentType<{ size?: number }>; badge?: number }>;
  /** When null, no tab is shown as active (e.g. deep-linked tool routes). */
  activeId: string | null;
  onSelect: (id: string) => void;
  deviceClass?: DeviceClass;
  /** Center “+” — same quick-new affordance as desktop header (4 surrounding tabs). */
  centerFab?: { onClick: () => void; ariaLabel?: string };
}) {
  const useFab = Boolean(centerFab) && items.length === 4;
  const left = useFab ? items.slice(0, 2) : items;
  const right = useFab ? items.slice(2, 4) : [];

  const fabButton = centerFab ? (
    <button
      type="button"
      onClick={centerFab.onClick}
      aria-label={centerFab.ariaLabel ?? "Nový – rychlé akce"}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full border-4 border-[color:var(--wp-surface-card)] bg-aidv-create text-white shadow-lg shadow-indigo-950/20 transition-transform active:scale-95",
        deviceClass === "tablet" ? "w-12 h-12 -translate-y-1" : "w-14 h-14 -translate-y-2"
      )}
    >
      <Plus size={deviceClass === "tablet" ? 22 : 26} strokeWidth={2.5} className="shrink-0" />
    </button>
  ) : null;

  return (
    <nav
      className={cx(
        "fixed inset-x-0 bottom-0 z-50 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 backdrop-blur",
        "pb-[max(0.5rem,var(--safe-area-bottom))]",
        "pl-[max(0.25rem,env(safe-area-inset-left,0px))] pr-[max(0.25rem,env(safe-area-inset-right,0px))]"
      )}
    >
      {useFab && deviceClass === "phone" ? (
        <div className="grid grid-cols-5 gap-0.5 px-1 pt-1 pb-2 items-end max-w-lg mx-auto">
          {left.map((item) => (
            <NavTabButton
              key={item.id}
              item={item}
              active={activeId != null && item.id === activeId}
              deviceClass={deviceClass}
              onSelect={onSelect}
            />
          ))}
          <div className="flex justify-center pb-0.5">{fabButton}</div>
          {right.map((item) => (
            <NavTabButton
              key={item.id}
              item={item}
              active={activeId != null && item.id === activeId}
              deviceClass={deviceClass}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : useFab && (deviceClass === "tablet" || deviceClass === "desktop") ? (
        <div className="flex items-end justify-between gap-2 px-4 pt-1 pb-2 max-w-3xl mx-auto">
          {left.map((item) => (
            <NavTabButton
              key={item.id}
              item={item}
              active={activeId != null && item.id === activeId}
              deviceClass={deviceClass === "desktop" ? "tablet" : deviceClass}
              onSelect={onSelect}
            />
          ))}
          <div className="flex justify-center px-1 pb-0.5">{fabButton}</div>
          {right.map((item) => (
            <NavTabButton
              key={item.id}
              item={item}
              active={activeId != null && item.id === activeId}
              deviceClass={deviceClass === "desktop" ? "tablet" : deviceClass}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div
          className={cx(
            deviceClass === "tablet"
              ? "flex justify-around px-6 py-1.5 max-w-3xl mx-auto"
              : "grid grid-cols-5 gap-1 px-2 py-2"
          )}
        >
          {items.map((item) => (
            <NavTabButton
              key={item.id}
              item={item}
              active={activeId != null && item.id === activeId}
              deviceClass={deviceClass}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </nav>
  );
}

export function MobileScreen({ children, className }: { children: ReactNode } & ClassName) {
  return <main className={cx("relative min-h-[calc(100dvh-10rem)] px-4 pt-4 pb-6 space-y-4", className)}>{children}</main>;
}

export function MobileSection({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode } & ClassName) {
  return (
    <section className={cx("space-y-2", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-wider text-[color:var(--wp-text-secondary)] font-black">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MobileCard({ children, className, pressable }: { children: ReactNode; pressable?: boolean } & ClassName) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm",
        pressable && "transition-transform active:scale-[0.99] cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <MobileCard className="p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-[color:var(--wp-text-secondary)] font-black">{label}</p>
      <p
        className={cx(
          "mt-1 text-xl font-black",
          tone === "success" && "text-emerald-700",
          tone === "warning" && "text-amber-700",
          tone === "danger" && "text-rose-700",
          tone === "default" && "text-[color:var(--wp-text)]"
        )}
      >
        {value}
      </p>
    </MobileCard>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center px-2 py-0.5 rounded-lg border text-[10px] uppercase tracking-wider font-black",
        tone === "neutral" && "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]",
        tone === "success" && "bg-emerald-50 text-emerald-700 border-emerald-200",
        tone === "warning" && "bg-amber-50 text-amber-700 border-amber-200",
        tone === "danger" && "bg-rose-50 text-rose-700 border-rose-200",
        tone === "info" && "bg-indigo-50 text-indigo-700 border-indigo-200"
      )}
    >
      {children}
    </span>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Hledat…",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-h-[44px] w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 text-sm font-medium text-[color:var(--wp-text)] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-[color:var(--wp-header-input-focus-ring)]"
    />
  );
}

export function FilterChips({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; label: string; badge?: number; tone?: "neutral" | "warning" | "danger" }>;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Filter">
      {options.map((opt) => {
        const active = value === opt.id;
        const warning = opt.tone === "warning";
        const danger = opt.tone === "danger";
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={cx(
              "min-h-[36px] whitespace-nowrap rounded-lg border px-3 text-xs font-bold transition-colors duration-150 active:scale-95",
              active && "bg-indigo-50 text-indigo-700 border-indigo-200",
              !active &&
                !warning &&
                !danger &&
                "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:border-[color:var(--wp-border-strong)]",
              !active && warning && "bg-amber-50 text-amber-800 border-amber-200",
              !active && danger && "bg-rose-50 text-rose-800 border-rose-300"
            )}
          >
            {opt.label}
            {typeof opt.badge === "number" ? (
              <span className="ml-1.5 text-[color:var(--wp-text-tertiary)]">{opt.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className={cx(
        "fixed inset-x-0 bottom-[calc(72px+var(--safe-area-bottom))] z-30 px-4",
        "pointer-events-none"
      )}
    >
      <div className="pointer-events-auto rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 p-3 shadow-lg backdrop-blur">
        {children}
      </div>
    </div>
  );
}

export function FloatingActionButton({
  onClick,
  label,
  icon: Icon = Plus,
}: {
  onClick: () => void;
  label: string;
  icon?: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed z-40 flex min-h-[52px] min-w-[52px] items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform active:scale-95 bottom-[calc(90px+var(--safe-area-bottom))] right-[max(1rem,env(safe-area-inset-right,0px))]"
      aria-label={label}
      title={label}
    >
      {createElement(Icon, { size: 22 })}
    </button>
  );
}

function OverlayContainer({
  open,
  onClose,
  children,
  fullScreen,
  labelId,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  fullScreen?: boolean;
  labelId?: string;
}) {
  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Zavřít"
        className="absolute inset-0 bg-[color:var(--wp-overlay-scrim)] animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cx(
          "absolute left-0 right-0 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-2xl",
          "animate-in slide-in-from-bottom duration-300 ease-out",
          fullScreen
            ? "top-0 bottom-0 rounded-none pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)]"
            : "bottom-0 max-h-[85vh] rounded-t-3xl pb-[var(--safe-area-bottom)]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const labelId = `bs-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <OverlayContainer open={open} onClose={onClose} labelId={labelId}>
      <div className="px-4 py-3 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between gap-2">
        <h3 id={labelId} className="font-black text-sm">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít panel"
          className="min-h-[36px] min-w-[36px] rounded-lg border border-[color:var(--wp-surface-card-border)] grid place-items-center hover:bg-[color:var(--wp-surface-muted)] transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto max-h-[calc(85vh-60px)] p-4">{children}</div>
    </OverlayContainer>
  );
}

export function FullscreenSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const labelId = `fs-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <OverlayContainer open={open} onClose={onClose} fullScreen labelId={labelId}>
      <div className="px-4 py-3 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between gap-2">
        <h3 id={labelId} className="font-black text-sm">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít"
          className="min-h-[36px] min-w-[36px] rounded-lg border border-[color:var(--wp-surface-card-border)] grid place-items-center hover:bg-[color:var(--wp-surface-muted)] transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto h-[calc(100%-60px)] p-4">{children}</div>
    </OverlayContainer>
  );
}

export function StepWizard({
  step,
  total,
  children,
}: {
  step: number;
  total: number;
  children: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((step / Math.max(1, total)) * 100)));
  return (
    <div className="space-y-3">
      <div className="h-1.5 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
        <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
      </div>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = PackageOpen,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <MobileCard className="text-center py-10">
      <div className="flex justify-center mb-3">
        <div className="w-12 h-12 rounded-2xl bg-[color:var(--wp-surface-muted)] flex items-center justify-center">
          {createElement(Icon, { size: 22, className: "text-[color:var(--wp-text-tertiary)]" })}
        </div>
      </div>
      <p className="font-black text-[color:var(--wp-text)]">{title}</p>
      {description ? <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1.5 leading-relaxed">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </MobileCard>
  );
}

export function ErrorState({
  title = "Něco se nepovedlo",
  onRetry,
}: {
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <MobileCard className="border-rose-200 bg-rose-50/50 px-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertCircle size={16} className="text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-rose-800 text-sm">{title}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors"
            >
              <RefreshCw size={12} />
              Zkusit znovu
            </button>
          ) : null}
        </div>
      </div>
    </MobileCard>
  );
}

export function LoadingSkeleton({ rows = 4, variant = "card" }: { rows?: number; variant?: "card" | "row" | "list" }) {
  const heights =
    variant === "row"
      ? ["h-10", "h-10", "h-10", "h-10", "h-10"]
      : variant === "list"
        ? ["h-14", "h-14", "h-14", "h-14", "h-14"]
        : ["h-20", "h-16", "h-24", "h-16", "h-20", "h-18"];
  return (
    <div className="space-y-2 px-4 py-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className={cx("rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse", heights[idx % heights.length])}
        />
      ))}
    </div>
  );
}

export function ClientSummaryCard({
  name,
  email,
  phone,
  tags,
  actions,
}: {
  name: string;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  actions?: ReactNode;
}) {
  return (
    <MobileCard>
      <p className="text-lg font-black text-[color:var(--wp-text)]">{name}</p>
      {email ? <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1">{email}</p> : null}
      {phone ? <p className="text-sm text-[color:var(--wp-text-secondary)]">{phone}</p> : null}
      {tags?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.slice(0, 4).map((tag) => (
            <StatusBadge key={tag}>{tag}</StatusBadge>
          ))}
        </div>
      ) : null}
      {actions ? <div className="mt-3">{actions}</div> : null}
    </MobileCard>
  );
}

export function HouseholdMemberCard({
  name,
  role,
  subtitle,
  action,
}: {
  name: string;
  role?: string | null;
  subtitle?: string | null;
  action?: ReactNode;
}) {
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{name}</p>
          <p className="text-xs text-[color:var(--wp-text-secondary)]">{role || "Člen domácnosti"}</p>
          {subtitle ? <p className="text-xs text-[color:var(--wp-text-tertiary)] mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </MobileCard>
  );
}

export function DocumentUploadCard({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <MobileCard className="border-dashed">
      <p className="text-sm font-black">{title}</p>
      {description ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </MobileCard>
  );
}

export function DocumentStateCard({
  fileName,
  status,
  confidence,
  details,
  action,
}: {
  fileName: string;
  status: "uploaded" | "processing" | "extracted" | "review_required" | "failed" | "pending" | "approved" | "rejected" | "applied";
  confidence?: number | null;
  details?: string;
  action?: ReactNode;
}) {
  const tone =
    status === "failed" || status === "rejected"
      ? "danger"
      : status === "review_required"
        ? "warning"
        : status === "processing" || status === "uploaded" || status === "pending"
          ? "info"
          : "success";
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{fileName}</p>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{details ?? "Dokumentový workflow"}</p>
          {typeof confidence === "number" ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">Confidence: {confidence}%</p> : null}
        </div>
        <StatusBadge tone={tone}>{status.replace("_", " ")}</StatusBadge>
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </MobileCard>
  );
}

export function AnalysisCard({
  title,
  status,
  progress,
  subtitle,
  action,
}: {
  title: string;
  status: string;
  progress?: number;
  subtitle?: string | null;
  action?: ReactNode;
}) {
  const tone = status === "completed" || status === "exported" ? "success" : status === "review" ? "warning" : "info";
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        <StatusBadge tone={tone}>{status}</StatusBadge>
      </div>
      {subtitle ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{subtitle}</p> : null}
      {typeof progress === "number" ? (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
            <div className="h-full bg-indigo-600" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <p className="text-[11px] text-[color:var(--wp-text-secondary)] mt-1">{progress}%</p>
        </div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </MobileCard>
  );
}

export function CalculatorCard({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <MobileCard className="p-3.5">
      <p className="text-sm font-bold">{title}</p>
      {description ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </MobileCard>
  );
}

export function ResultCtaCard({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions: ReactNode;
}) {
  return (
    <MobileCard className="bg-indigo-50/50 border-indigo-200">
      <p className="text-sm font-black text-indigo-900">{title}</p>
      {description ? <p className="text-xs text-indigo-800/80 mt-1">{description}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">{actions}</div>
    </MobileCard>
  );
}

export function KPIProgressCard({
  label,
  actual,
  target,
  unit,
  tone = "info",
}: {
  label: string;
  actual: number;
  target: number;
  unit?: string;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((actual / target) * 100))) : 0;
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">{label}</p>
        <StatusBadge tone={tone}>{pct}%</StatusBadge>
      </div>
      <p className="mt-2 text-lg font-black text-[color:var(--wp-text)]">
        {actual.toLocaleString("cs-CZ")}
        {unit ? ` ${unit}` : ""}
      </p>
      <p className="text-xs text-[color:var(--wp-text-secondary)]">
        Cíl: {target.toLocaleString("cs-CZ")}
        {unit ? ` ${unit}` : ""}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
        <div className="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
      </div>
    </MobileCard>
  );
}

export function TeamMemberCard({
  name,
  role,
  subtitle,
  riskLevel,
  actions,
}: {
  name: string;
  role?: string | null;
  subtitle?: string | null;
  riskLevel?: "ok" | "warning" | "critical";
  actions?: ReactNode;
}) {
  const tone = riskLevel === "critical" ? "danger" : riskLevel === "warning" ? "warning" : "success";
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{name}</p>
          <p className="text-xs text-[color:var(--wp-text-secondary)]">{role || "Člen týmu"}</p>
          {subtitle ? <p className="text-xs text-[color:var(--wp-text-tertiary)] mt-0.5">{subtitle}</p> : null}
        </div>
        {riskLevel ? <StatusBadge tone={tone}>{riskLevel}</StatusBadge> : null}
      </div>
      {actions ? <div className="mt-3">{actions}</div> : null}
    </MobileCard>
  );
}

export function AIInsightCard({
  title = "Interní přehled (AI)",
  insight,
  action,
}: {
  title?: string;
  insight: string;
  action?: ReactNode;
}) {
  return (
    <MobileCard className="bg-violet-50/60 border-violet-200">
      <p className="text-[10px] uppercase tracking-wider text-violet-700 font-black">{title}</p>
      <p className="mt-1 text-sm font-medium text-violet-900 leading-relaxed">{insight}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </MobileCard>
  );
}

export function NotificationListItem({
  title,
  body,
  meta,
  unread,
  action,
}: {
  title: string;
  body?: string | null;
  meta?: string | null;
  unread?: boolean;
  action?: ReactNode;
}) {
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[color:var(--wp-text)] flex items-center gap-2">
            {title}
            {unread ? <span className="inline-block h-2 w-2 rounded-full bg-indigo-600" /> : null}
          </p>
          {body ? <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">{body}</p> : null}
          {meta ? <p className="mt-1 text-[11px] text-[color:var(--wp-text-tertiary)]">{meta}</p> : null}
        </div>
        {action}
      </div>
    </MobileCard>
  );
}

export function SettingsGroupCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <MobileCard>
      <p className="text-sm font-black text-[color:var(--wp-text)]">{title}</p>
      {description ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{description}</p> : null}
      <div className="mt-3 space-y-2">{children}</div>
    </MobileCard>
  );
}

export function ChatMessageBubble({
  body,
  timestamp,
  own,
}: {
  body: string;
  timestamp?: string;
  own?: boolean;
}) {
  return (
    <div className={cx("flex", own ? "justify-end" : "justify-start")}>
      <MobileCard className={cx("max-w-[85%] p-3", own && "bg-indigo-600 text-white border-indigo-700")}>
        <p className="text-sm leading-relaxed">{body}</p>
        {timestamp ? <p className={cx("mt-1 text-[11px]", own ? "text-indigo-100" : "text-[color:var(--wp-text-tertiary)]")}>{timestamp}</p> : null}
      </MobileCard>
    </div>
  );
}

export function MobileDocumentItem({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{title}</p>
          {subtitle ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </MobileCard>
  );
}

export function RequestStatusCard({
  title,
  description,
  statusLabel,
  done,
}: {
  title: string;
  description?: string | null;
  statusLabel: string;
  done?: boolean;
}) {
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[color:var(--wp-text)]">{title}</p>
          {description ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{description}</p> : null}
        </div>
        <StatusBadge tone={done ? "success" : "info"}>{statusLabel}</StatusBadge>
      </div>
    </MobileCard>
  );
}

export function ProfileFieldRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[color:var(--wp-text-secondary)] font-black">{label}</p>
      <p className="text-sm font-semibold text-[color:var(--wp-text)] mt-0.5">{value || "—"}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OfflineBanner – shows when browser has no network connection       */
/* ------------------------------------------------------------------ */

export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [justCameBack, setJustCameBack] = useState(false);

  useEffect(() => {
    function onOffline() { setOffline(true); setJustCameBack(false); }
    function onOnline() {
      setOffline(false);
      setJustCameBack(true);
      setTimeout(() => setJustCameBack(false), 3000);
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!offline && !justCameBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "fixed top-[calc(var(--safe-area-top)+4rem)] inset-x-4 z-[200] rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg",
        "animate-in slide-in-from-top duration-300",
        offline
          ? "bg-rose-600 text-white"
          : "bg-emerald-600 text-white"
      )}
    >
      <div className="flex-shrink-0">
        {offline ? <WifiOff size={16} /> : <Wifi size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black">
          {offline ? "Offline – zkontrolujte připojení" : "Připojení obnoveno"}
        </p>
        {offline ? (
          <p className="text-[10px] text-white/80 mt-0.5">Data se aktualizují po obnovení spojení.</p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PendingButton – mutation feedback                                  */
/* ------------------------------------------------------------------ */

export function PendingButton({
  children,
  isPending,
  className,
  type = "button",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { isPending?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || isPending}
      className={cx(
        "inline-flex items-center justify-center gap-2 transition-opacity active:scale-[0.97] transition-transform duration-100",
        isPending && "opacity-50 cursor-not-allowed",
        className
      )}
      {...rest}
    >
      {isPending ? <RefreshCw size={14} className="animate-spin shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast – transient feedback notification                           */
/* ------------------------------------------------------------------ */

export type ToastVariant = "success" | "error" | "info";

export function Toast({
  message,
  variant = "info",
  onDismiss,
}: {
  message: string;
  variant?: ToastVariant;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "fixed bottom-[calc(96px+var(--safe-area-bottom))] inset-x-4 z-[201] rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg",
        "animate-in slide-in-from-bottom duration-300",
        variant === "success" && "bg-emerald-600 text-white",
        variant === "error" && "bg-rose-600 text-white",
        variant === "info" && "bg-[#0a0f29] text-white"
      )}
    >
      <p className="flex-1 text-xs font-bold">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Zavřít"
        className="w-6 h-6 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);
  function showToast(message: string, variant: ToastVariant = "info") {
    setToast({ message, variant });
  }
  function dismissToast() { setToast(null); }
  return { toast, showToast, dismissToast };
}
