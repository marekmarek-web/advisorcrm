"use client";

import React, { type ButtonHTMLAttributes, type ReactNode, createElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  X,
  Plus,
  AlertCircle,
  Wifi,
  WifiOff,
  PackageOpen,
  RefreshCw,
  Laptop,
  AlertTriangle,
} from "lucide-react";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { registerBackHandler } from "@/app/shared/mobile-ui/native-back-stack";

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
  const isCompact = deviceClass === "phone" || deviceClass === "tablet";
  return (
    <div
      className={cx(
        "aidv-mobile-premium-shell flex flex-col text-[color:var(--wp-text)]",
        /* Phone/tablet: fill visual viewport so document/body never scrolls or rubber-bands behind the shell. */
        deviceClass === "phone" &&
          "fixed inset-0 z-[1] min-h-0 overflow-hidden",
        deviceClass === "tablet" &&
          "fixed inset-0 z-[1] min-h-0 overflow-hidden",
        deviceClass === "desktop" && "min-h-[100dvh] pb-0",
        className
      )}
    >
      {isCompact ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-[color:var(--aidv-mobile-canvas-bg)]"
            style={{ backgroundImage: "var(--aidv-mobile-canvas-bg-gradient)" }}
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
            <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full blur-3xl opacity-90 [background:radial-gradient(circle_at_center,var(--aidv-mobile-shell-blob-a)_0%,transparent_68%)]" />
            <div className="absolute -left-24 top-1/3 h-52 w-52 rounded-full blur-3xl opacity-80 [background:radial-gradient(circle_at_center,var(--aidv-mobile-shell-blob-b)_0%,transparent_68%)]" />
          </div>
          <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col bg-[color:var(--wp-bg)]">{children}</div>
      )}
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
  /** Primární taby hub: titul jen pro čtečky, viz `isPrimaryTabHubPath` + mobile chrome contract. */
  titleMode = "default",
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  deviceClass?: DeviceClass;
  titleMode?: "default" | "accessibilityOnly";
} & ClassName) {
  const chromeOnly = titleMode === "accessibilityOnly";
  return (
    <header
      className={cx(
        "sticky top-0 z-40 shrink-0 backdrop-blur-2xl backdrop-saturate-150",
        chromeOnly
          ? "bg-transparent pt-[calc(var(--safe-area-top)+0.85rem)] pb-2"
          : "border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--aidv-mobile-header-glass-bg)] supports-[backdrop-filter]:bg-white/75 shadow-[0_6px_28px_rgba(10,15,41,0.08)] pt-[calc(var(--safe-area-top)+0.35rem)] pb-3 rounded-b-[1.35rem]",
        deviceClass === "phone" && (chromeOnly ? "px-6" : "px-4"),
        deviceClass === "tablet" && "px-6",
        className
      )}
    >
      <div className={cx("min-h-[52px] flex items-center justify-between gap-3", deviceClass === "tablet" && "max-w-3xl mx-auto")}>
        <div className="min-w-0 flex items-center gap-2">{left}</div>
        <div className="min-w-0 flex-1">
          {chromeOnly ? (
            <span className="sr-only">
              {[title, subtitle].filter(Boolean).join(" — ")}
            </span>
          ) : (
            <>
              <h1
                className={cx(
                  "truncate text-center font-black text-[color:var(--wp-text)]",
                  deviceClass === "tablet" ? "text-lg" : "text-base"
                )}
              >
                {title}
              </h1>
              <p className="truncate text-center text-[11px] text-[color:var(--wp-text-secondary)]">{subtitle || "\u00A0"}</p>
            </>
          )}
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
        "min-h-[44px] transition-all duration-200",
        deviceClass === "tablet"
          ? "flex items-center gap-2 rounded-2xl px-4 py-1.5 text-sm font-bold"
          : "flex flex-col items-center justify-center gap-0.5 rounded-[2rem] px-1.5 py-1 text-[10px] font-black",
        active
          ? deviceClass === "tablet"
            ? "bg-gradient-to-b from-indigo-50 to-violet-50/90 text-[color:var(--wp-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-indigo-200/80"
            : "text-indigo-700"
          : "text-slate-600 hover:text-[color:var(--wp-text)] hover:bg-slate-50"
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
  visible = true,
}: {
  items: Array<{ id: string; label: string; icon: React.ComponentType<{ size?: number }>; badge?: number }>;
  /** When null, no tab is shown as active (e.g. deep-linked tool routes). */
  activeId: string | null;
  onSelect: (id: string) => void;
  deviceClass?: DeviceClass;
  /** Center “+” — same quick-new affordance as desktop header (4 surrounding tabs). */
  centerFab?: { onClick: () => void; ariaLabel?: string };
  /** Při `false` lišta zajede dolů (scroll dolů). */
  visible?: boolean;
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
        "flex shrink-0 items-center justify-center rounded-full border-[4px] border-white text-white shadow-[0_16px_32px_rgba(15,23,42,.42)] transition-transform active:scale-95",
        "[background-image:var(--aidv-mobile-fab-gradient)]",
        deviceClass === "tablet" ? "w-12 h-12 -translate-y-0.5" : "w-16 h-16 -translate-y-6"
      )}
    >
      <Plus size={deviceClass === "tablet" ? 22 : 28} strokeWidth={2.5} className="shrink-0 drop-shadow-sm" />
    </button>
  ) : null;

  const phoneBar = useFab && deviceClass === "phone" && (
    <div className="grid h-[68px] grid-cols-5 items-center gap-0.5">
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
  );

  return (
    <nav
      className={cx(
        "fixed inset-x-0 bottom-0 z-50 pointer-events-none pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]",
        "transition-transform duration-300 ease-out will-change-transform",
        visible ? "translate-y-0" : "translate-y-[calc(100%+12px)]",
      )}
      style={{ paddingBottom: "max(4px, calc(var(--safe-area-bottom, 0px) - 28px))" }}
    >
      {useFab && deviceClass === "phone" ? (
        <div className="pointer-events-auto mx-auto w-full max-w-[398px] px-5 pb-0">
          <div
            className={cx(
              "relative rounded-full border border-slate-200/90 bg-white shadow-[0_20px_40px_-10px_rgba(15,23,42,.28)]",
              "ring-1 ring-[color:var(--wp-surface-card-border)]/80",
              "px-2"
            )}
          >
            {phoneBar}
          </div>
        </div>
      ) : useFab && (deviceClass === "tablet" || deviceClass === "desktop") ? (
        <div className="pointer-events-auto flex items-end justify-between gap-2 border-t border-[color:var(--aidv-mobile-nav-glass-border)] bg-[color:var(--aidv-mobile-nav-glass-bg)] px-4 pt-1 pb-1 max-w-3xl mx-auto shadow-[var(--aidv-mobile-nav-shadow)] backdrop-blur-2xl backdrop-saturate-150">
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
            "pointer-events-auto border-t border-[color:var(--aidv-mobile-nav-glass-border)] bg-[color:var(--aidv-mobile-nav-glass-bg)] shadow-[var(--aidv-mobile-nav-shadow)] backdrop-blur-2xl backdrop-saturate-150",
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

export type MobilePrimaryHubTabId = "home" | "tasks" | "clients" | "pipeline";

export function MobileCurrentSectionPill({
  label,
  visible = true,
  deviceClass = "phone",
}: {
  label: string;
  visible?: boolean;
  deviceClass?: DeviceClass;
}) {
  return (
    <div
      className={cx(
        "pointer-events-none absolute inset-x-0 top-[calc(100%-0.2rem)] z-50 flex justify-center px-4",
        "transition-all duration-300 ease-out",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "-translate-y-5 scale-95 opacity-0",
      )}
      aria-hidden="true"
    >
      <span
        className={cx(
          "inline-flex h-8 items-center rounded-full border border-white/75 bg-white/75 px-5",
          "text-[13px] font-black text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_10px_26px_rgba(15,23,42,.07)]",
          "ring-1 ring-slate-200/45 backdrop-blur-xl",
          deviceClass === "tablet" && "h-9 px-6 text-sm",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Segmentové přepínání hlavních hubů (`/today`, `/tasks`, …) — řádek pod `MobileHeader`, na hub routách. */
export function MobilePrimaryHubSegmentRow({
  activeId,
  onSelect,
  visible = true,
  deviceClass = "phone",
}: {
  activeId: MobilePrimaryHubTabId;
  onSelect: (id: MobilePrimaryHubTabId) => void;
  visible?: boolean;
  deviceClass?: DeviceClass;
}) {
  const items: { id: MobilePrimaryHubTabId; label: string }[] = [
    { id: "home", label: "Nástěnka" },
    { id: "tasks", label: "Úkoly" },
    { id: "clients", label: "Klienti" },
    { id: "pipeline", label: "Obchody" },
  ];
  return (
    <div
      className={cx(
        "overflow-hidden border-b border-[color:var(--wp-surface-card-border)]/55 bg-[color:var(--aidv-mobile-header-glass-bg)] px-4 transition-[max-height,opacity,padding] duration-200 ease-out sm:px-6",
        visible ? "max-h-[88px] opacity-100 py-2" : "pointer-events-none max-h-0 opacity-0 py-0",
      )}
      aria-hidden={!visible}
    >
      <div className={cx("mx-auto flex w-full gap-1 rounded-[999px] bg-slate-100/92 p-1 ring-1 ring-[color:var(--wp-surface-card-border)]/45 shadow-[0_10px_28px_-18px_rgba(15,23,42,.12)] sm:max-w-3xl")}>
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cx(
                "min-h-[42px] flex-1 rounded-[999px] px-1 text-center text-[11px] font-black leading-tight transition-colors sm:text-[12px]",
                deviceClass === "tablet" ? "px-2" : "",
                active
                  ? "bg-white text-[color:var(--wp-text)] shadow-[0_4px_14px_-6px_rgba(15,23,42,.25)]"
                  : "text-[color:var(--wp-text-secondary)] active:bg-white/40",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MobileScreen({
  children,
  className,
  ariaLabel,
  ariaLabelledBy,
  onScroll,
}: {
  children: ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  onScroll?: React.UIEventHandler<HTMLElement>;
} & ClassName) {
  return (
    <main
      role="main"
      aria-label={ariaLabelledBy ? undefined : ariaLabel ?? "Hlavní obsah"}
      aria-labelledby={ariaLabelledBy}
      onScroll={onScroll}
      className={cx(
        "relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overscroll-y-none",
        "bg-[color:var(--aidv-mobile-canvas-bg)] px-5 pt-3 space-y-4 sm:px-6",
        "pb-[var(--aidv-mobile-screen-pad-bottom)]",
        className
      )}
    >
      {children}
    </main>
  );
}

export function MobileSection({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode } & ClassName) {
  return (
    <section className={cx("space-y-2", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-black uppercase tracking-[0.08em] text-[color:var(--wp-text-secondary)]">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Premium section title row — optional subtitle + trailing action (filters, odkaz „všechny“). */
export function MobileSectionHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
} & ClassName) {
  return (
    <div className={cx("mb-1 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-black tracking-tight text-[#0a0f29]">{title}</h2>
        {subtitle ? (
          <div className="mt-0.5 text-[11px] font-medium leading-snug text-[color:var(--wp-text-secondary)]">{subtitle}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </div>
  );
}

/** List řádek jako karta — použití místo tabulek na mobilu. `compact` hustší řádek, `roomy` čitelnější. */
export function MobileListItem({
  leading,
  title,
  description,
  meta,
  trailing,
  onClick,
  variant = "roomy",
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  variant?: "compact" | "roomy";
} & ClassName) {
  const pad = variant === "compact" ? "py-2.5" : "py-3.5";
  const body = (
    <div className={cx("flex min-h-[44px] items-center gap-3", pad)}>
      {leading ? <div className="flex shrink-0 items-center justify-center">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div
          className={cx(
            "font-bold text-[color:var(--wp-text)]",
            variant === "compact" ? "text-sm leading-tight" : "text-[15px] leading-snug"
          )}
        >
          {title}
        </div>
        {description ? (
          <div className={cx("text-[color:var(--wp-text-secondary)]", variant === "compact" ? "mt-0.5 text-xs" : "mt-1 text-sm")}>
            {description}
          </div>
        ) : null}
        {meta ? <div className="mt-1.5">{meta}</div> : null}
      </div>
      {trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
    </div>
  );

  if (onClick) {
    return (
      <MobileCard pressable className={cx("p-0 overflow-hidden", className)}>
        <button type="button" className="block w-full px-4 text-left" onClick={onClick}>
          {body}
        </button>
      </MobileCard>
    );
  }
  return (
    <MobileCard className={cx("overflow-hidden px-4 py-0", className)}>
      {body}
    </MobileCard>
  );
}

export function MobileCard({ children, className, pressable }: { children: ReactNode; pressable?: boolean } & ClassName) {
  return (
    <div
      className={cx(
        "border bg-[color:var(--wp-surface-card)] p-4",
        pressable && "transition-transform active:scale-[0.99] cursor-pointer",
        className
      )}
      style={{
        borderColor: "var(--aidv-mobile-card-border)",
        borderRadius: "var(--aidv-mobile-card-radius-lg, var(--aidv-card-radius, 1.25rem))",
        boxShadow: "var(--aidv-mobile-shadow-card-premium, var(--aidv-shadow-card-sm))",
      }}
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
        "fixed inset-x-0 bottom-[calc(var(--aidv-mobile-tabbar-inner-h-phone)+max(0.5rem,var(--safe-area-bottom)))] z-30 px-4",
        "pointer-events-none"
      )}
    >
      <div className="pointer-events-auto rounded-[var(--aidv-mobile-card-radius-lg)] border border-slate-200/80 bg-white/90 p-3 shadow-[var(--aidv-mobile-shadow-card-premium,var(--aidv-shadow-card-md))] backdrop-blur-xl">
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
      className={cx(
        "fixed z-40 flex min-h-[52px] min-w-[52px] items-center justify-center rounded-full border border-white/20 text-white shadow-xl shadow-indigo-950/35 transition-transform active:scale-95",
        "[background-image:var(--aidv-mobile-fab-gradient)]",
        "bottom-[calc(var(--aidv-mobile-tabbar-inner-h-phone)+var(--aidv-mobile-fab-above-tabbar)+var(--safe-area-bottom,0px))]",
        "right-[max(1rem,env(safe-area-inset-right,0px))]"
      )}
      aria-label={label}
      title={label}
    >
      {createElement(Icon, { size: 22, className: "drop-shadow-sm" })}
    </button>
  );
}

/** Matches elements that can receive programmatic focus for trap/restore. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function OverlayContainer({
  open,
  onClose,
  children,
  fullScreen,
  labelId,
  compact,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  fullScreen?: boolean;
  labelId?: string;
  /** Bottom sheet height: content-hugging with max 60dvh instead of the default 85dvh. */
  compact?: boolean;
}) {
  // Stabilní reference na onClose — volající (např. `onClose={() => setX(false)}`)
  // obvykle předávají novou arrow funkci při každém renderu. Kdybychom tuto
  // referenci měli v deps efektů (back-stack, Escape, focus trap), teardown
  // by běžel při každém renderu rodiče a overlay by se nekontrolovaně zavíral.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const panelRef = useRef<HTMLDivElement | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Register a back-stack handler instead of manipulating `window.history`.
  // This is the Track 1 fix for "tapping inside sheet sends me back where I
  // came from": no dummy history entries to leak.
  useEffect(() => {
    if (!open) return;
    return registerBackHandler(() => {
      onCloseRef.current();
    });
  }, [open]);

  // Focus management — trap focus inside the overlay while open and restore
  // the previously focused element on close. Standard dialog a11y pattern.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    const moveInitialFocus = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (target) target.focus({ preventScroll: true });
      else panel.focus({ preventScroll: true });
    };
    const rafId = requestAnimationFrame(moveInitialFocus);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("data-focus-trap-skip"));
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try {
          previouslyFocused.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    };
  }, [open]);

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (!open || !portalTarget) return null;
  return createPortal(
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
        data-focus-trap-skip
        className="absolute inset-0 bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(
          "absolute left-0 right-0 flex flex-col overflow-hidden border-t border-white/70 bg-[color:var(--wp-surface-card)] outline-none shadow-[var(--aidv-mobile-shadow-card-premium,0_12px_40px_rgba(10,15,41,0.14))]",
          "animate-in slide-in-from-bottom duration-300 ease-out",
          fullScreen
            ? "top-0 bottom-0 max-h-[100dvh] min-h-0 rounded-none pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)]"
            : compact
              ? "bottom-0 max-h-[min(60dvh,60vh)] rounded-t-[1.625rem] pb-0"
              : "bottom-0 max-h-[min(85dvh,85vh)] rounded-t-[1.75rem] pb-0"
        )}
      >
        {children}
      </div>
    </div>,
    portalTarget
  );
}

/**
 * Větší tap-target (h-6) s vizuálním "grabberem" uvnitř.
 * Pointer-down → sledujeme Y; pokud táhnutí překročí 64 px směrem dolů, zavřít.
 * Klepnutí bez tahu (< 6 px posun, < 300 ms) taky zavírá — stejné UX jako Wise/Revolut.
 */
function SheetDragHandle({ onClose }: { onClose: () => void }) {
  const startRef = React.useRef<{ y: number; t: number } | null>(null);
  const draggingRef = React.useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = { y: e.clientY, t: Date.now() };
    draggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !startRef.current) return;
    const dy = e.clientY - startRef.current.y;
    // Swipe-to-close threshold ~64px
    if (dy > 64) {
      draggingRef.current = false;
      startRef.current = null;
      onClose();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) {
      draggingRef.current = false;
      return;
    }
    const dy = e.clientY - startRef.current.y;
    const dt = Date.now() - startRef.current.t;
    startRef.current = null;
    draggingRef.current = false;
    // Treat near-stationary release as a tap and close.
    if (Math.abs(dy) < 6 && dt < 300) {
      onClose();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Zavřít panel"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClose();
        }
      }}
      className="flex h-6 w-full shrink-0 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
    >
      <span className="pointer-events-none h-1.5 w-10 rounded-full bg-slate-300/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" />
    </div>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  /** Sticky primary/secondary actions — tap-safe min 44px inside footer. */
  footer,
  /** Spodní navigace portálu (~104px) + FAB — aby šly odkliknout poslední akce v listu. */
  reserveMobileBottomNav = false,
  /** Hug the content (max 60dvh) instead of the default 85dvh tall sheet. */
  compact = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  reserveMobileBottomNav?: boolean;
  compact?: boolean;
}) {
  const labelId = `bs-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const scrollPad = footer
    ? "pb-3"
    : reserveMobileBottomNav
      ? "pb-[max(1.25rem,calc(var(--aidv-mobile-tabbar-inner-h-phone)+max(0.5rem,var(--safe-area-bottom))+1.25rem))]"
      : "pb-[max(1rem,calc(var(--safe-area-bottom)+0.5rem))]";
  return (
    <OverlayContainer open={open} onClose={onClose} labelId={labelId} compact={compact}>
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetDragHandle onClose={onClose} />
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-4 py-3">
          <h3 id={labelId} className="min-w-0 flex-1 text-[15px] font-black tracking-tight text-[#0a0f29]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít panel"
            className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full bg-slate-100 text-[color:var(--wp-text)] transition-colors hover:bg-slate-200/90"
          >
            <X size={18} />
          </button>
        </div>
        <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain p-4", scrollPad)}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(10,15,41,0.05)]">
            <div className="pb-[max(0.25rem,var(--safe-area-bottom))]">{footer}</div>
          </div>
        ) : null}
      </div>
    </OverlayContainer>
  );
}

export function FullscreenSheet({
  open,
  onClose,
  title,
  children,
  /** Rezerva nad fixní spodní navigací portálu (~104px + safe area). */
  reserveMobileBottomNav = false,
  /** Skip default horizontal/vertical padding of the content area — caller controls inner padding. */
  noPadding = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  reserveMobileBottomNav?: boolean;
  noPadding?: boolean;
}) {
  const labelId = `fs-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const scrollPad = reserveMobileBottomNav
    ? "pb-[max(1.25rem,calc(var(--aidv-mobile-tabbar-inner-h-phone)+max(0.5rem,var(--safe-area-bottom))+1.25rem))]"
    : "pb-[max(1rem,calc(var(--safe-area-bottom)+0.75rem))]";
  return (
    <OverlayContainer open={open} onClose={onClose} fullScreen labelId={labelId}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-5 py-3">
          <h3
            id={labelId}
            className="min-w-0 flex-1 truncate text-[15px] font-black leading-tight text-[color:var(--wp-text)]"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] transition-colors hover:bg-[color:var(--wp-surface-card-border)]"
          >
            <X size={18} strokeWidth={2.25} />
          </button>
        </div>
        <div
          className={cx(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            noPadding ? "" : "p-4",
            scrollPad
          )}
        >
          {children}
        </div>
      </div>
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
    <MobileCard className="overflow-hidden py-10 text-center [box-shadow:var(--aidv-mobile-shadow-card-premium,var(--aidv-shadow-card-sm))]">
      <div className="flex justify-center mb-3">
        <div className="grid h-[3.25rem] w-[3.25rem] place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 ring-1 ring-indigo-100/90 shadow-inner">
          {createElement(Icon, { size: 22, className: "text-indigo-600" })}
        </div>
      </div>
      <p className="font-black tracking-tight text-[#0a0f29]">{title}</p>
      {description ? <p className="mt-2 text-sm leading-relaxed text-[color:var(--wp-text-secondary)]">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </MobileCard>
  );
}

export function ErrorState({
  title = "Něco se nepovedlo",
  description,
  onRetry,
  homeHref = "/portal/today",
  homeLabel = "Přehled portálu",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  /** Fallback navigation when the screen cannot recover. Set `false` to hide (e.g. client zone). */
  homeHref?: string | false;
  homeLabel?: string;
}) {
  return (
    <MobileCard className="border-rose-200/90 bg-gradient-to-b from-rose-50/90 to-white px-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertCircle size={16} className="text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-rose-800 text-sm">{title}</p>
          {description ? (
            <p className="mt-1.5 text-xs text-rose-700/90 leading-relaxed">{description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors"
              >
                <RefreshCw size={12} />
                Zkusit znovu
              </button>
            ) : null}
            {homeHref !== false ? (
              <a
                href={homeHref}
                className="inline-flex items-center justify-center min-h-[36px] px-3 rounded-lg border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors"
              >
                {homeLabel}
              </a>
            ) : null}
          </div>
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
    <div className="space-y-2.5 px-1 py-2" role="status" aria-busy="true" aria-label="Načítání">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className={cx(
            "animate-pulse rounded-[var(--aidv-mobile-card-radius-lg,1.25rem)] bg-slate-200/60",
            heights[idx % heights.length]
          )}
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
  attachments,
}: {
  body: string;
  timestamp?: string;
  own?: boolean;
  attachments?: { id: string; fileName: string }[];
}) {
  const att = attachments ?? [];
  return (
    <div className={cx("flex", own ? "justify-end" : "justify-start")}>
      <MobileCard className={cx("max-w-[85%] p-3", own && "bg-indigo-600 text-white border-indigo-700")}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{body}</p>
        {att.length > 0 ? (
          <div className={cx("mt-2 space-y-1.5", own ? "text-indigo-50" : "")}>
            {att.map((a) => (
              <a
                key={a.id}
                href={`/api/messages/attachments/${a.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(
                  "block text-xs font-bold underline break-all min-h-[44px] py-1",
                  own ? "text-white" : "text-indigo-600",
                )}
              >
                Příloha: {a.fileName}
              </a>
            ))}
          </div>
        ) : null}
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
  statusTone,
  footer,
}: {
  title: string;
  description?: string | null;
  statusLabel: string;
  /** @deprecated prefer statusTone */
  done?: boolean;
  statusTone?: "neutral" | "success" | "warning" | "danger" | "info";
  footer?: ReactNode;
}) {
  const tone = statusTone ?? (done ? "success" : "info");
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[color:var(--wp-text)]">{title}</p>
          {description ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{description}</p> : null}
        </div>
        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
      </div>
      {footer ? <div className="mt-3 border-t border-[color:var(--wp-surface-card-border)] pt-3">{footer}</div> : null}
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
/*  Mobile CRM route placeholders (web-only vs unknown URL)           */
/* ------------------------------------------------------------------ */

/** Opens the same pathname in the system/browser tab — intended for desktop-width CRM. */
function buildAbsoluteAidvisoraUrl(portalPath: string): string {
  if (typeof window === "undefined") return portalPath;
  return `${window.location.origin}${portalPath}`;
}

/** Web-only desktop sections — keep copy internal / administrative (Aidvisora is advisor SaaS CRM). */
export function MobileWebOnlyRoutePlaceholder({
  title,
  description,
  pathnameForWeb,
}: {
  title: string;
  description: string;
  pathnameForWeb: string;
}) {
  const router = useRouter();

  function openDesktopWebSegment() {
    const url = buildAbsoluteAidvisoraUrl(pathnameForWeb || "/portal/today");
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      router.push(pathnameForWeb);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <MobileCard className="space-y-4 overflow-hidden rounded-[var(--aidv-mobile-card-radius-xl,2rem)] p-6 [box-shadow:var(--aidv-mobile-shadow-card-premium)]">
        <h2 className="text-center text-base font-black tracking-tight text-[#0a0f29]">{title}</h2>
        <div className="mx-auto grid h-[3.75rem] w-[3.75rem] place-items-center rounded-3xl border border-indigo-100/90 bg-gradient-to-br from-white to-indigo-50 shadow-[var(--aidv-mobile-shadow-card-premium)]">
          <Laptop className="h-8 w-8 text-indigo-600 drop-shadow-sm" aria-hidden />
        </div>
        <p className="text-center text-[11px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
          Tato část je dostupná na webu
        </p>
        <p className="text-center text-sm leading-relaxed text-[color:var(--wp-text-secondary)]">{description}</p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            className={cx(portalPrimaryButtonClassName, "w-full min-h-[48px] text-sm font-black")}
            onClick={openDesktopWebSegment}
          >
            Otevřít webovou verzi
          </button>
          <button
            type="button"
            onClick={() => router.replace("/portal/today")}
            className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)] active:scale-[0.99] transition-transform"
          >
            Zpět na Přehled
          </button>
        </div>
      </MobileCard>
    </div>
  );
}

export function MobileUnsupportedRouteScreen({
  pathname,
}: {
  pathname: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4 pt-2">
      <MobileCard className="space-y-4 overflow-hidden rounded-[var(--aidv-mobile-card-radius-xl,2rem)] p-6 [box-shadow:var(--aidv-mobile-shadow-card-premium)]">
        <h2 className="text-center text-base font-black tracking-tight text-[#0a0f29]">Nepodporovaná cesta</h2>
        <div className="mx-auto grid h-[3.75rem] w-[3.75rem] place-items-center rounded-3xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white shadow-inner">
          <AlertTriangle className="h-8 w-8 text-amber-700" aria-hidden />
        </div>
        <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed">
          Tuto adresu mobilní aplikace v tomto rozhraní neobsahuje. Použijte Přehled nebo adresu zkontrolujte v desktopovém
          CRM — aktuální cesta:{pathname ? <span className="break-all font-mono text-xs text-[color:var(--wp-text)]"> {pathname}</span> : null}.
        </p>
        <button
          type="button"
          className={cx(portalPrimaryButtonClassName, "w-full min-h-[48px] text-sm font-black")}
          onClick={() => router.replace("/portal/today")}
        >
          Zpět na Přehled
        </button>
      </MobileCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OfflineBanner – shows when browser has no network connection       */
/* ------------------------------------------------------------------ */

const OFFLINE_DEBUG_STORAGE_KEY = "aidv_debug_network";

function offlineBannerDebugLog(...args: unknown[]) {
  try {
    if (typeof window === "undefined" || window.localStorage?.getItem(OFFLINE_DEBUG_STORAGE_KEY) !== "1") {
      return;
    }
    console.log("[OfflineBanner]", new Date().toISOString(), ...args);
  } catch {
    /* ignore */
  }
}

/** WKWebView often fires spurious offline/online; debounce before showing the banner on native. */
function nativeOfflineDebounceMs(): number {
  if (!Capacitor.isNativePlatform()) return 0;
  return Capacitor.getPlatform() === "ios" ? 1400 : 900;
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [justCameBack, setJustCameBack] = useState(false);

  useEffect(() => {
    const debounceMs = nativeOfflineDebounceMs();
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;

    function clearOfflineTimer() {
      if (offlineTimer !== null) {
        clearTimeout(offlineTimer);
        offlineTimer = null;
      }
    }

    function scheduleShowOfflineIfStillDisconnected(source: string) {
      clearOfflineTimer();
      if (typeof navigator === "undefined" || navigator.onLine) {
        offlineBannerDebugLog("skip offline schedule; onLine", { source });
        return;
      }
      if (debounceMs <= 0) {
        setOffline(true);
        setJustCameBack(false);
        offlineBannerDebugLog("offline immediate", { source });
        return;
      }
      offlineTimer = setTimeout(() => {
        offlineTimer = null;
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setOffline(true);
          setJustCameBack(false);
          offlineBannerDebugLog("offline after debounce", { source, debounceMs });
        } else {
          offlineBannerDebugLog("offline debounce cleared; connection ok", { source });
        }
      }, debounceMs);
    }

    function onOffline() {
      offlineBannerDebugLog("offline event", { onLine: navigator.onLine });
      scheduleShowOfflineIfStillDisconnected("event_offline");
    }

    function onOnline() {
      offlineBannerDebugLog("online event");
      clearOfflineTimer();
      setOffline(false);
      setJustCameBack(true);
      setTimeout(() => setJustCameBack(false), 3000);
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      offlineBannerDebugLog("visibility visible", { onLine: navigator.onLine });
      clearOfflineTimer();
      if (typeof navigator !== "undefined" && navigator.onLine) {
        setOffline(false);
      } else {
        scheduleShowOfflineIfStillDisconnected("visibility_resume");
      }
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      scheduleShowOfflineIfStillDisconnected("mount");
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearOfflineTimer();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
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
        "fixed bottom-[calc(var(--aidv-mobile-tabbar-inner-h-phone)+max(0.5rem,var(--safe-area-bottom))+0.75rem)] inset-x-4 z-[201] rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg",
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
  function dismissToast() {
    setToast(null);
  }
  return { toast, showToast, dismissToast };
}

/* ------------------------------------------------------------------ */
/*  Stable aliases — product naming (masterplan) × backwards compat    */
/* ------------------------------------------------------------------ */

/** @alias {@link MobileHeader} premium top bar */
export const MobileTopBar = MobileHeader;

export const MobileBottomSheet = BottomSheet;

/** Same interaction model as BottomSheet — quick secondary panels / action lists. */
export const MobileActionSheet = BottomSheet;

/** KPI dlaždice — stejná data API jako {@link MetricCard}. */
export const MobileKpiCard = MetricCard;

export const MobileEmptyState = EmptyState;
export const MobileErrorState = ErrorState;

/** WCAG label + shimmer — preferuje se pro blokové skeletony nad obrazovkou. */
export function MobileLoadingState(props: {
  rows?: number;
  variant?: "card" | "row" | "list";
  /** Popis dočasného stavu pro screen readery */
  label?: string;
}) {
  return (
    <>
      {props.label ? <span className="sr-only">{props.label}</span> : null}
      <LoadingSkeleton rows={props.rows} variant={props.variant} />
    </>
  );
}

/** @alias {@link MobileWebOnlyRoutePlaceholder} — fáze 0.5 route cleanup */
export const MobileWebOnlyPlaceholder = MobileWebOnlyRoutePlaceholder;
