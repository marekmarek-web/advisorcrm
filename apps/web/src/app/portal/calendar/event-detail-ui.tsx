"use client";

import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { EventRow } from "@/app/actions/events";
import { EVENT_FORM_PRIMARY_TYPE_ORDER } from "./event-form-primary-types";
import {
  getChipClasses,
  getChipInlineStyle,
  getEventCategory,
  getEventStyle,
} from "./event-categories";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatEventDetailDateLine(event: EventRow): string {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;
  const dayLabel = start.toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (event.allDay) return `${dayLabel} · Celý den`;
  const startTime = start.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  const endTime = end?.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) ?? "?";
  return `${dayLabel} · ${startTime} – ${endTime}`;
}

export function buildEventMailtoHref(event: EventRow, contactEmail?: string | null): string {
  const dateLine = formatEventDetailDateLine(event);
  const subject = encodeURIComponent(event.title);
  const body = encodeURIComponent(
    [event.title, dateLine, event.location || "Místo nebylo zadáno.", event.notes || ""]
      .filter(Boolean)
      .join("\n"),
  );
  if (contactEmail?.trim()) {
    return `mailto:${contactEmail.trim()}?subject=${subject}&body=${body}`;
  }
  return `mailto:?subject=${subject}&body=${body}`;
}

export function getEventAccentStyle(
  event: EventRow,
  eventTypeColors?: Record<string, string>,
): CSSProperties {
  const colorOverride = eventTypeColors?.[event.eventType ?? ""];
  return { backgroundColor: getEventStyle(event.eventType, colorOverride).color };
}

export function EventTypeChipGrid({
  eventType,
  eventTypeColors,
  onChangeType,
  disabled = false,
  className,
}: {
  eventType: string | null | undefined;
  eventTypeColors?: Record<string, string>;
  onChangeType?: (nextType: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("grid grid-cols-3 gap-2", className)}>
      {EVENT_FORM_PRIMARY_TYPE_ORDER.map((id) => {
        const category = getEventCategory(id);
        const isActive = category.id === eventType;
        const colorOverride = eventTypeColors?.[category.id];
        return (
          <button
            key={category.id}
            type="button"
            disabled={disabled}
            onClick={() => onChangeType?.(category.id)}
            className={cx(
              "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-xs font-bold transition-all",
              !disabled && "active:scale-[0.98]",
              disabled && "cursor-default",
              getChipClasses(category.id, isActive, colorOverride),
            )}
            style={getChipInlineStyle(category.id, isActive, colorOverride)}
          >
            <span className="text-base leading-none" aria-hidden>
              {category.icon}
            </span>
            <span className="leading-tight">{category.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function EventDetailInfoBlock({
  icon: Icon,
  label,
  accentStyle,
  children,
  subdued = false,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  accentStyle?: CSSProperties;
  children: ReactNode;
  subdued?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-2xl border p-3.5",
        subdued
          ? "border-transparent bg-[color:var(--wp-main-scroll-bg)]/60"
          : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]",
      )}
    >
      <div
        className={cx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
          subdued ? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]",
        )}
        style={accentStyle}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">{label}</p>
        {children}
      </div>
    </div>
  );
}
