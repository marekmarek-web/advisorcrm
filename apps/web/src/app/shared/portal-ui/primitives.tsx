"use client";

/**
 * Portal UI — design-system primitives 2026.
 *
 * Jednotná "Revolut 2026" estetika pro mobilní i desktopový portál:
 *  - HeroCard          – tmavý gradient card nahoře obrazovky (meta + akce)
 *  - KpiCard           – KPI/metrika s progress/delta/health stavem
 *  - PortalSection     – titulek + action + body s konzistentním rytmem
 *  - SegmentPills      – period/scope pillbar (nad FilterChips, ale s větší vizuální váhou)
 *  - StepHeader        – horizontálně scrollovatelný stepper s progress linkou
 *  - SheetChrome       – title row s X pro bottom-sheety/modály (px-5 py-4, větší hit-area)
 *  - InlineAlert       – alert banner s ikonou, tónem a optional akcí
 *
 * Princip: žádné hard-coded hex barvy ve screenech. Všechno jde přes
 * CSS tokeny nebo Tailwind barvy, aby dark-mode a brand-update byly
 * řešitelné na jednom místě.
 */

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ClassName = { className?: string };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  HeroCard                                                           */
/* ------------------------------------------------------------------ */

export function HeroCard({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
  meta,
  children,
  className,
  tone = "navy",
}: {
  /** Malý uppercase popisek nad titulem ("BUSINESS PLÁN", "DOMÁCNOST"). */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Ikona v kruhu vlevo (volitelné). */
  icon?: ReactNode;
  /** Akce vpravo nahoře (1-2 ghost tlačítka). */
  actions?: ReactNode;
  /** Řádek s meta údaji pod titulem ("1 člen · 0 obchodů · 0 analýz"). */
  meta?: ReactNode;
  /** Volný slot pod hlavičkou – KPI, progress bar, atp. */
  children?: ReactNode;
  tone?: "navy" | "indigo";
} & ClassName) {
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[24px] px-5 py-5 text-white shadow-[0_18px_48px_rgba(10,15,41,0.18)]",
        tone === "navy" &&
          "bg-[linear-gradient(135deg,var(--aidv-hero-navy)_0%,var(--aidv-surface-dark-elevated)_100%)]",
        tone === "indigo" &&
          "bg-[linear-gradient(135deg,#1e1b4b_0%,#312e81_100%)]",
        className
      )}
    >
      {/* subtle radial highlight top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-white/5 blur-2xl"
      />
      <div className="relative flex items-start gap-3">
        {icon ? (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/10 text-white">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-0.5 text-lg font-black leading-tight text-white sm:text-xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-[12px] font-medium leading-snug text-white/70">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>
        ) : null}
      </div>

      {meta ? (
        <div className="relative mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-white/70">
          {meta}
        </div>
      ) : null}

      {children ? <div className="relative mt-4">{children}</div> : null}
    </section>
  );
}

/**
 * Ghost tlačítko navržené do HeroCard actions (aby se neztratilo na tmavém pozadí).
 */
export function HeroAction({
  children,
  className,
  tone = "default",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 text-[11px] font-black uppercase tracking-wide transition-colors",
        tone === "default" &&
          "border-white/15 bg-white/10 text-white hover:bg-white/15",
        tone === "danger" &&
          "border-rose-300/30 bg-rose-500/20 text-rose-50 hover:bg-rose-500/30",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Oddělovač pro HeroCard meta řádek ("a · b · c"). */
export function HeroMetaDot() {
  return <span className="text-white/30">·</span>;
}

/* ------------------------------------------------------------------ */
/*  KpiCard                                                            */
/* ------------------------------------------------------------------ */

export type KpiHealth = "ok" | "warning" | "critical" | "neutral";

const HEALTH_LABEL: Record<Exclude<KpiHealth, "neutral">, string> = {
  ok: "OK",
  warning: "Pozor",
  critical: "Kritické",
};

const HEALTH_CHIP: Record<KpiHealth, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
  warning:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  critical:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
  neutral:
    "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]",
};

const PROGRESS_BAR: Record<KpiHealth, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
  neutral: "bg-indigo-500",
};

export function KpiCard({
  label,
  value,
  target,
  unit,
  health = "neutral",
  delta,
  icon,
  variant = "compact",
  className,
  action,
}: {
  label: string;
  value: string | number;
  /** Cíl – když je uveden, ukáže se progress bar a "Cíl: X" řádek. */
  target?: number;
  unit?: string;
  health?: KpiHealth;
  /** Chip s delta proti plánu (např. "+12 %"). */
  delta?: string;
  icon?: ReactNode;
  variant?: "compact" | "large";
  action?: ReactNode;
} & ClassName) {
  const valueNumeric = typeof value === "number" ? value : Number(value);
  const pct =
    target && target > 0 && Number.isFinite(valueNumeric)
      ? Math.max(0, Math.min(100, Math.round((valueNumeric / target) * 100)))
      : null;

  const isLarge = variant === "large";

  return (
    <div
      className={cx(
        "rounded-[20px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)]",
        isLarge ? "p-4 sm:p-5" : "p-3.5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]">
              {icon}
            </div>
          ) : null}
          <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--wp-text-secondary)]">
            {label}
          </p>
        </div>
        {health !== "neutral" ? (
          <span
            className={cx(
              "inline-flex shrink-0 items-center rounded-md border px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wider",
              HEALTH_CHIP[health]
            )}
          >
            {HEALTH_LABEL[health]}
          </span>
        ) : null}
      </div>
      <p
        className={cx(
          "mt-2 font-black leading-none tracking-tight text-[color:var(--wp-text)]",
          isLarge ? "text-[26px] sm:text-[28px]" : "text-[19px]"
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-[0.55em] font-black text-[color:var(--wp-text-secondary)]">
            {unit}
          </span>
        ) : null}
      </p>
      {target != null || delta ? (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--wp-text-secondary)]">
          {target != null ? (
            <span>
              Cíl: {target.toLocaleString("cs-CZ")}
              {unit ? ` ${unit}` : ""}
            </span>
          ) : null}
          {delta ? (
            <span
              className={cx(
                "ml-auto inline-flex items-center rounded-md px-1.5 py-[1px] text-[10px] font-black",
                delta.trim().startsWith("-")
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              )}
            >
              {delta}
            </span>
          ) : null}
        </p>
      ) : null}
      {pct != null ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--wp-surface-muted)]">
          <div
            className={cx("h-full rounded-full transition-[width] duration-700", PROGRESS_BAR[health])}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PortalSection                                                      */
/* ------------------------------------------------------------------ */

export function PortalSection({
  title,
  subtitle,
  action,
  children,
  className,
  compact = false,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Zmenšit spacing (pro denzní sekvence sekcí). */
  compact?: boolean;
} & ClassName) {
  return (
    <section className={cx(compact ? "space-y-2" : "space-y-3", className)}>
      {title || action ? (
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--wp-text-secondary)]">
                {title}
              </h3>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-[11px] font-medium text-[color:var(--wp-text-tertiary)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  SegmentPills                                                       */
/* ------------------------------------------------------------------ */

export type SegmentPillOption = {
  id: string;
  label: string;
  badge?: number | string;
  disabled?: boolean;
  tone?: "neutral" | "warning" | "danger";
};

export function SegmentPills({
  value,
  options,
  onChange,
  size = "md",
  label,
  className,
}: {
  value: string;
  options: SegmentPillOption[];
  onChange: (id: string) => void;
  size?: "sm" | "md";
  /** Vizuální label nad pill rowou ("Období", "Rozsah"). */
  label?: string;
} & ClassName) {
  return (
    <div className={cx("min-w-0", className)}>
      {label ? (
        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--wp-text-tertiary)]">
          {label}
        </p>
      ) : null}
      <div
        role="group"
        aria-label={label ?? "Segment"}
        className={cx(
          "inline-flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-1 no-scrollbar",
          "shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        )}
      >
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => !opt.disabled && onChange(opt.id)}
              aria-pressed={active}
              disabled={opt.disabled}
              className={cx(
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-xl font-black uppercase tracking-wide transition-all duration-150",
                size === "sm"
                  ? "min-h-[32px] px-2.5 text-[10px]"
                  : "min-h-[36px] px-3 text-[11px]",
                active
                  ? "bg-[color:var(--aidv-hero-navy)] text-white shadow-[0_4px_12px_rgba(10,15,41,0.18)]"
                  : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]",
                opt.disabled && "cursor-not-allowed opacity-40",
                opt.tone === "warning" && !active && "text-amber-700",
                opt.tone === "danger" && !active && "text-rose-700"
              )}
            >
              {opt.label}
              {opt.badge != null ? (
                <span
                  className={cx(
                    "ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-md px-1 py-0.5 text-[9px] font-black",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                  )}
                >
                  {opt.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StepHeader                                                         */
/* ------------------------------------------------------------------ */

export function StepHeader({
  steps,
  currentIndex,
  onSelect,
  className,
}: {
  /** Pole popisků kroků v pořadí. */
  steps: Array<{ id?: string; label: string }>;
  /** 0-based index aktivního kroku. */
  currentIndex: number;
  /** Click na krok (třeba navigace zpět). */
  onSelect?: (index: number) => void;
} & ClassName) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll aktivního kroku do centra viewportu
  useEffect(() => {
    const el = activeRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } catch {
      el.scrollIntoView();
    }
  }, [currentIndex]);

  const total = Math.max(1, steps.length);
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round(((currentIndex + 0.5) / total) * 100))
  );

  return (
    <nav
      className={cx("relative w-full", className)}
      aria-label="Kroky průvodce"
    >
      {/* progress rail */}
      <div className="mx-5 mb-2 h-1 rounded-full bg-[color:var(--wp-surface-muted)]">
        <div
          className="h-full rounded-full bg-[color:var(--aidv-hero-navy)] transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <div
        ref={containerRef}
        className="flex gap-2 overflow-x-auto px-2 pb-1 pt-1 no-scrollbar snap-x snap-mandatory"
      >
        {steps.map((step, idx) => {
          const isActive = idx === currentIndex;
          const isCompleted = idx < currentIndex;
          const clickable = onSelect != null && idx <= currentIndex;
          return (
            <button
              key={step.id ?? idx}
              ref={isActive ? activeRef : null}
              type="button"
              onClick={() => clickable && onSelect?.(idx)}
              disabled={!clickable}
              aria-current={isActive ? "step" : undefined}
              className={cx(
                "flex shrink-0 snap-center items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors",
                isActive &&
                  "border-[color:var(--aidv-hero-navy)] bg-[color:var(--aidv-hero-navy)] text-white shadow-[0_6px_18px_rgba(10,15,41,0.22)]",
                !isActive &&
                  isCompleted &&
                  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
                !isActive &&
                  !isCompleted &&
                  "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)]",
                !clickable && "cursor-default"
              )}
            >
              <span
                className={cx(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black",
                  isActive && "bg-white/15 text-white",
                  !isActive && isCompleted && "bg-emerald-500 text-white",
                  !isActive && !isCompleted && "bg-[color:var(--wp-surface-muted)]"
                )}
              >
                {isCompleted ? <CheckCircle2 size={14} /> : idx + 1}
              </span>
              <span className="text-[11px] font-black uppercase tracking-wide">
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  SheetChrome                                                        */
/* ------------------------------------------------------------------ */

/**
 * Hlavička (title + subtitle + close) pro fullscreen sheety a modály.
 * Používá se uvnitř `FullscreenSheet` obsahu, aby measure & hit-area
 * close tlačítka byla konzistentní napříč celou appkou.
 *
 * Ve výchozím mobile-ui/FullscreenSheet je jeho vlastní header, tato
 * komponenta je pro modály, které staví layout ručně nebo chtějí
 * subtitle / ikonu.
 */
export function SheetChrome({
  title,
  subtitle,
  onClose,
  leading,
  trailing,
  sticky = true,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Ikona/tlačítko vlevo od titulu (např. back šipka). */
  leading?: ReactNode;
  /** Další akce vedle X (sdílet, ...). */
  trailing?: ReactNode;
  sticky?: boolean;
} & ClassName) {
  return (
    <div
      className={cx(
        "z-10 flex shrink-0 items-center gap-3 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-5 py-4",
        sticky && "sticky top-0",
        className
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-black leading-tight text-[color:var(--wp-text)]">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[12px] font-medium text-[color:var(--wp-text-secondary)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailing}
      <button
        type="button"
        onClick={onClose}
        aria-label="Zavřít"
        className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl border border-transparent text-[color:var(--wp-text-secondary)] transition-colors hover:border-[color:var(--wp-surface-card-border)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
      >
        <X size={18} strokeWidth={2.25} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  InlineAlert                                                        */
/* ------------------------------------------------------------------ */

export type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_CONFIG: Record<
  AlertTone,
  { wrapper: string; icon: ReactNode }
> = {
  info: {
    wrapper:
      "border-indigo-200 bg-indigo-50/80 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100",
    icon: <Info size={16} className="text-indigo-600 dark:text-indigo-300" />,
  },
  success: {
    wrapper:
      "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
    icon: (
      <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-300" />
    ),
  },
  warning: {
    wrapper:
      "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    icon: (
      <AlertTriangle size={16} className="text-amber-600 dark:text-amber-300" />
    ),
  },
  danger: {
    wrapper:
      "border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100",
    icon: <AlertCircle size={16} className="text-rose-600 dark:text-rose-300" />,
  },
};

export function InlineAlert({
  tone = "info",
  title,
  description,
  action,
  className,
}: {
  tone?: AlertTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
} & ClassName) {
  const cfg = ALERT_CONFIG[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-[12px]",
        cfg.wrapper,
        className
      )}
    >
      <div className="mt-0.5 shrink-0">{cfg.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-black">{title}</p>
        {description ? (
          <p className="mt-0.5 text-[11px] font-medium leading-snug opacity-90">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MetricGrid                                                         */
/* ------------------------------------------------------------------ */

/**
 * Jednoduchý responzivní grid pro KpiCard layouty.
 * Mobile: 2 cols, sm+: 3 cols, lg+: 4 cols (záleží na `cols`).
 */
export function MetricGrid({
  cols = "auto",
  children,
  className,
}: {
  cols?: "auto" | 2 | 3 | 4;
  children: ReactNode;
} & ClassName) {
  const gridCls =
    cols === 2
      ? "grid-cols-2"
      : cols === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : cols === 4
          ? "grid-cols-2 sm:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
  return <div className={cx("grid gap-2.5", gridCls, className)}>{children}</div>;
}
