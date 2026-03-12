"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EventRow } from "@/app/actions/events";
import type { TaskRow } from "@/app/actions/tasks";
import { getEventCategory } from "./event-categories";

function formatTime(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Compute free slots (gaps) between events on the given day. Returns array of [start, end] in minutes from midnight. */
function getFreeSlots(dayEvents: EventRow[], dateStr: string): { start: string; end: string }[] {
  const dayStart = new Date(dateStr + "T07:00:00").getTime();
  const dayEnd = new Date(dateStr + "T20:00:00").getTime();
  const withTimes = dayEvents
    .filter((e) => !e.allDay && e.startAt && e.endAt)
    .map((e) => ({
      start: new Date(e.startAt).getTime(),
      end: new Date(e.endAt!).getTime(),
    }))
    .filter((e) => e.start >= dayStart && e.end <= dayEnd)
    .sort((a, b) => a.start - b.start);

  const slots: { start: string; end: string }[] = [];
  let lastEnd = dayStart;
  for (const block of withTimes) {
    if (block.start - lastEnd >= 30 * 60 * 1000) {
      slots.push({
        start: new Date(lastEnd).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
        end: new Date(block.start).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
      });
    }
    lastEnd = Math.max(lastEnd, block.end);
  }
  if (dayEnd - lastEnd >= 30 * 60 * 1000) {
    slots.push({
      start: new Date(lastEnd).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
      end: new Date(dayEnd).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }),
    });
  }
  return slots;
}

export interface CalendarContextPanelProps {
  selectedEvent: EventRow | null;
  selectedDate: string;
  dayEvents: EventRow[];
  dayTasks: TaskRow[];
  dayTasksLoading: boolean;
  unreadMessagesCount?: number;
  onEditEvent: (event: EventRow) => void;
  onQuickEditEvent?: (event: EventRow) => void;
  onDeleteEvent: (event: EventRow) => void;
  onFollowUp: (eventId: string) => void;
  onOpenFullEdit: (event: EventRow) => void;
  onMarkDone: (event: EventRow) => void;
  onToggleTask: (task: TaskRow) => void;
  onRefresh: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  isMobile?: boolean;
}

export function CalendarContextPanel({
  selectedEvent,
  selectedDate,
  dayEvents,
  dayTasks,
  dayTasksLoading,
  unreadMessagesCount = 0,
  onEditEvent,
  onQuickEditEvent,
  onDeleteEvent,
  onFollowUp,
  onOpenFullEdit,
  onMarkDone,
  onToggleTask,
  onRefresh,
  collapsed = false,
  onToggleCollapsed,
  isMobile = false,
}: CalendarContextPanelProps) {
  const freeSlots = useMemo(
    () => getFreeSlots(dayEvents, selectedDate),
    [dayEvents, selectedDate]
  );
  const openTasks = dayTasks.filter((t) => !t.completedAt);

  if (selectedEvent) {
    const cat = getEventCategory(selectedEvent.eventType);
    const start = new Date(selectedEvent.startAt);
    const end = selectedEvent.endAt ? new Date(selectedEvent.endAt) : null;

    return (
      <div className={`wp-cal-context-panel ${collapsed ? "wp-cal-context-panel--collapsed" : ""} ${isMobile ? "wp-cal-context-panel--mobile" : ""}`}>
        <div className="wp-cal-context-panel-header">
          <h3>Detail události</h3>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="wp-cal-context-panel-toggle"
              aria-label={collapsed ? "Rozbalit panel" : "Sbalit panel"}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(90deg)" }}>
                <path strokeLinecap="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <div className="wp-cal-context-panel-body">
          <div className="wp-cal-context-detail">
            <div className="wp-cal-context-detail-type" style={{ background: cat.color + "18", color: cat.color }}>
              <span>{cat.icon}</span> {cat.label}
            </div>
            <h2 className="wp-cal-context-detail-title">{selectedEvent.title}</h2>
            <p className="wp-cal-context-detail-time">
              {start.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "short" })}
              {" · "}
              {formatTime(start)}
              {end ? ` – ${formatTime(end)}` : ""}
            </p>
            {selectedEvent.contactName && (
              <p className="wp-cal-context-detail-contact">
                <strong>👤 {selectedEvent.contactName}</strong>
              </p>
            )}
            {selectedEvent.location && (
              <p className="wp-cal-context-detail-meta">📍 {selectedEvent.location}</p>
            )}
            {selectedEvent.meetingLink && (
              <p className="wp-cal-context-detail-meta">
                <a href={selectedEvent.meetingLink} target="_blank" rel="noopener noreferrer" className="text-[var(--wp-cal-accent)] underline">
                  Odkaz na schůzku
                </a>
              </p>
            )}
            {selectedEvent.notes && (
              <p className="wp-cal-context-detail-notes">{selectedEvent.notes}</p>
            )}

            <div className="wp-cal-context-actions">
              <button type="button" className="wp-cal-context-btn wp-cal-context-btn--primary" onClick={() => onOpenFullEdit(selectedEvent)}>
                Upravit
              </button>
              {onQuickEditEvent && (
                <button type="button" className="wp-cal-context-btn" onClick={() => onQuickEditEvent(selectedEvent)}>
                  Rychlá úprava
                </button>
              )}
              <button type="button" className="wp-cal-context-btn" onClick={() => onMarkDone(selectedEvent)}>
                Označit hotovo
              </button>
              <button type="button" className="wp-cal-context-btn" onClick={() => onFollowUp(selectedEvent.id)}>
                + Follow-up
              </button>
              {selectedEvent.contactId && (
                <>
                  <Link href={`/portal/contacts/${selectedEvent.contactId}`} className="wp-cal-context-btn">
                    Otevřít klienta
                  </Link>
                  <Link href="/portal/messages" className="wp-cal-context-btn">
                    Napsat zprávu
                    {unreadMessagesCount > 0 && (
                      <span className="wp-cal-context-badge">{unreadMessagesCount}</span>
                    )}
                  </Link>
                </>
              )}
              <button
                type="button"
                className="wp-cal-context-btn wp-cal-context-btn--danger"
                onClick={() => {
                  if (confirm("Opravdu smazat tuto událost?")) onDeleteEvent(selectedEvent);
                }}
              >
                Smazat
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`wp-cal-context-panel wp-cal-context-panel--agenda ${collapsed ? "wp-cal-context-panel--collapsed" : ""} ${isMobile ? "wp-cal-context-panel--mobile" : ""}`}>
      <div className="wp-cal-context-panel-header">
        <h3>Agenda – {formatDateLabel(selectedDate)}</h3>
        {onToggleCollapsed && (
          <button type="button" onClick={onToggleCollapsed} className="wp-cal-context-panel-toggle" aria-label={collapsed ? "Rozbalit" : "Sbalit"}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(90deg)" }}>
              <path strokeLinecap="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
      <div className="wp-cal-context-panel-body">
        <section className="wp-cal-context-section">
          <h4>Události dne</h4>
          {dayEvents.length === 0 ? (
            <p className="wp-cal-context-empty">Žádné události</p>
          ) : (
            <ul className="wp-cal-context-list">
              {dayEvents
                .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                .map((ev) => {
                  const c = getEventCategory(ev.eventType);
                  return (
                    <li key={ev.id} className="wp-cal-context-list-item">
                      <span style={{ color: c.color }}>{c.icon}</span>
                      <span className="wp-cal-context-list-time">{formatTime(new Date(ev.startAt))}</span>
                      <span className="wp-cal-context-list-title">{ev.title}</span>
                      {ev.contactName && <span className="wp-cal-context-list-contact">{ev.contactName}</span>}
                    </li>
                  );
                })}
            </ul>
          )}
        </section>

        <section className="wp-cal-context-section">
          <h4>Úkoly</h4>
          {dayTasksLoading ? (
            <p className="wp-cal-context-muted">Načítám…</p>
          ) : openTasks.length === 0 ? (
            <p className="wp-cal-context-empty">Žádné úkoly na tento den</p>
          ) : (
            <ul className="wp-cal-context-list">
              {dayTasks.map((task) => (
                <li key={task.id} className="wp-cal-context-list-item wp-cal-context-list-item--task">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task)}
                    className="wp-cal-context-task-check"
                    aria-label={task.completedAt ? "Znovu otevřít" : "Splnit"}
                    style={{
                      border: task.completedAt ? "none" : "1.5px solid var(--wp-border)",
                      background: task.completedAt ? "var(--wp-success)" : "transparent",
                    }}
                  >
                    {task.completedAt ? "✓" : ""}
                  </button>
                  <span className={task.completedAt ? "wp-cal-context-list-title wp-cal-context-list-title--done" : "wp-cal-context-list-title"}>
                    {task.title}
                  </span>
                  {task.contactName && <span className="wp-cal-context-list-contact">{task.contactName}</span>}
                </li>
              ))}
            </ul>
          )}
          <Link href="/portal/tasks" className="wp-cal-context-link">
            Všechny úkoly →
          </Link>
        </section>

        {unreadMessagesCount > 0 && (
          <section className="wp-cal-context-section">
            <Link href="/portal/messages" className="wp-cal-context-link wp-cal-context-link--badge">
              Zprávy čekající na reakci ({unreadMessagesCount})
            </Link>
          </section>
        )}

        {freeSlots.length > 0 && (
          <section className="wp-cal-context-section">
            <h4>Volná okna</h4>
            <ul className="wp-cal-context-list">
              {freeSlots.slice(0, 5).map((slot, i) => (
                <li key={i} className="wp-cal-context-list-item wp-cal-context-list-item--slot">
                  {slot.start} – {slot.end}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
