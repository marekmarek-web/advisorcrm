"use client";

import {
  Bell,
  Briefcase,
  Check,
  Clock,
  Edit2,
  ExternalLink,
  Mail,
  MapPin,
  Send,
  Phone,
  Trash2,
  User,
  Video,
  X,
} from "lucide-react";
import type { EventRow } from "@/app/actions/events";
import {
  EVENT_STATUSES,
} from "@/app/portal/calendar/event-categories";
import {
  buildEventMailtoHref,
  EventDetailInfoBlock,
  EventTypeChipGrid,
  formatEventDetailDateLine,
  getEventAccentStyle,
} from "@/app/portal/calendar/event-detail-ui";
import {
  FullscreenSheet,
  MobileCard,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

function formatTimeRange(ev: EventRow) {
  const s = new Date(ev.startAt);
  const e = ev.endAt ? new Date(ev.endAt) : null;
  if (ev.allDay) return "Celý den";
  const t0 = s.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  if (!e) return t0;
  const t1 = e.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  return `${t0} – ${t1}`;
}

function formatDate(ev: EventRow) {
  return new Date(ev.startAt).toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getDuration(ev: EventRow): string | null {
  if (!ev.endAt || ev.allDay) return null;
  const mins = Math.round(
    (new Date(ev.endAt).getTime() - new Date(ev.startAt).getTime()) / 60000,
  );
  if (mins < 60) return `${mins} min`;
  const h = (mins / 60).toFixed(1).replace(".0", "");
  return `${h} hod`;
}

function EventDetailBody({
  ev,
  onClose,
  onEdit,
  onDelete,
  onFollowUpEvent,
  onFollowUpTask,
  onMarkDone,
  onOpenContact,
  onOpenPipeline,
  canWriteCalendar,
  contactPhone,
  contactEmail,
  eventTypeColors,
  onChangeType,
}: {
  ev: EventRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFollowUpEvent: () => void;
  onFollowUpTask: () => void;
  onMarkDone: () => void;
  onOpenContact: (id: string) => void;
  onOpenPipeline?: () => void;
  canWriteCalendar: boolean;
  contactPhone?: string | null;
  contactEmail?: string | null;
  eventTypeColors?: Record<string, string>;
  onChangeType?: (nextType: string) => void;
}) {
  const duration = getDuration(ev);
  const statusObj = EVENT_STATUSES.find((s) => s.id === ev.status);
  const isDone = ev.status === "done";
  const dateLine = formatEventDetailDateLine(ev);
  const mailtoHref = buildEventMailtoHref(ev, contactEmail);
  const accentStyle = getEventAccentStyle(ev, eventTypeColors);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="overflow-hidden rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]">
          <div className="h-1.5 w-full" style={accentStyle} />
          <div className="px-4 pb-4 pt-4">
            <div className="mb-4">
              <h2 className="text-xl font-extrabold leading-tight text-[color:var(--wp-text)]">{ev.title}</h2>
              {statusObj ? (
                <p className="mt-1 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                  {statusObj.label}
                  {duration ? ` · ${duration}` : null}
                </p>
              ) : null}
            </div>

            <EventTypeChipGrid
              eventType={ev.eventType}
              eventTypeColors={eventTypeColors}
              onChangeType={canWriteCalendar ? onChangeType : undefined}
              disabled={!canWriteCalendar}
              className="mb-4"
            />

            <div className="space-y-2">
              <EventDetailInfoBlock icon={Clock} label="Kdy" accentStyle={accentStyle}>
                <p className="text-sm font-semibold text-[color:var(--wp-text)]">{dateLine}</p>
              </EventDetailInfoBlock>
              <EventDetailInfoBlock icon={MapPin} label="Místo" subdued={!ev.location}>
                <p className={ev.location ? "text-sm font-medium text-[color:var(--wp-text-secondary)]" : "text-sm font-medium text-[color:var(--wp-text-tertiary)]"}>
                  {ev.location?.trim() || "Místo nebylo zadáno."}
                </p>
              </EventDetailInfoBlock>
            </div>
          </div>
        </div>

        <MobileCard className="divide-y divide-[color:var(--wp-surface-card-border)] px-4 py-0">
        {ev.contactName && ev.contactId ? (
          <div className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <User size={15} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
              <p className="truncate text-sm font-bold text-[color:var(--wp-text)]">{ev.contactName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {contactPhone?.trim() ? (
                <a
                  href={`tel:${contactPhone.replace(/\s/g, "")}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--wp-surface-card-border)] text-indigo-600"
                  aria-label="Zavolat"
                >
                  <Phone size={14} />
                </a>
              ) : null}
              {contactEmail?.trim() ? (
                <a
                  href={`mailto:${contactEmail.trim()}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--wp-surface-card-border)] text-indigo-600"
                  aria-label="Napsat e-mail"
                >
                  <Mail size={14} />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenContact(ev.contactId!)}
                className="flex min-h-[32px] items-center gap-1 px-2 text-xs font-bold text-indigo-600"
              >
                Profil <ExternalLink size={11} />
              </button>
            </div>
          </div>
        ) : null}

        {ev.opportunityId ? (
          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Briefcase size={15} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
              <p className="text-sm text-[color:var(--wp-text-secondary)]">Propojeno s obchodem</p>
            </div>
            {onOpenPipeline ? (
              <button
                type="button"
                onClick={onOpenPipeline}
                className="min-h-[40px] rounded-lg border border-[color:var(--wp-surface-card-border)] px-3 text-xs font-bold text-indigo-600 active:bg-[color:var(--wp-surface-muted)]"
              >
                Otevřít obchody
              </button>
            ) : null}
          </div>
        ) : null}

        {ev.location ? (
          <div className="flex items-center gap-3 py-3">
            <MapPin size={15} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
            <p className="text-sm text-[color:var(--wp-text-secondary)]">{ev.location}</p>
          </div>
        ) : null}
        {ev.meetingLink ? (
          <div className="flex items-center gap-3 py-3">
            <Video size={15} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
            <a
              href={ev.meetingLink}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm font-bold text-indigo-600"
            >
              Připojit se online
            </a>
          </div>
        ) : null}

        {ev.reminderAt ? (
          <div className="flex items-center gap-3 py-3">
            <Bell size={15} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
            <p className="text-sm text-[color:var(--wp-text-secondary)]">
              Připomínka:{" "}
              {new Date(ev.reminderAt).toLocaleString("cs-CZ", {
                day: "numeric",
                month: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ) : null}
      </MobileCard>

        {ev.notes ? (
          <MobileCard className="p-4">
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Poznámky
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--wp-text-secondary)]">{ev.notes}</p>
          </MobileCard>
        ) : null}

        {!canWriteCalendar ? (
          <p className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3 py-2 text-center text-xs text-[color:var(--wp-text-secondary)]">
            Nemáte oprávnění upravovat kalendář — zobrazení je jen pro čtení.
          </p>
        ) : null}
      </div>

      {canWriteCalendar ? (
        <div className="shrink-0 space-y-2 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3 pb-[max(0.75rem,var(--safe-area-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text-secondary)] shadow-sm transition-colors active:scale-[0.98]"
            >
              <Edit2 size={16} /> Upravit
            </button>
            <a
              href={mailtoHref}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text-secondary)] shadow-sm transition-colors active:scale-[0.98]"
            >
              <Send size={16} /> Poslat
            </a>
            <button
              type="button"
              onClick={onDelete}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 text-sm font-bold text-rose-600 transition-colors active:scale-[0.98]"
            >
              <Trash2 size={16} /> Smazat
            </button>
          </div>

          <div className="flex gap-2">
            {!isDone ? (
              <button
                type="button"
                onClick={onMarkDone}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 transition-colors active:scale-[0.98]"
              >
                <Check size={14} /> Hotovo
              </button>
            ) : null}
            <button
              type="button"
              onClick={onFollowUpEvent}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl border border-[color:var(--wp-surface-card-border)] text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors active:scale-[0.98]"
            >
              + Follow-up
            </button>
            <button
              type="button"
              onClick={onFollowUpTask}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-xl border border-[color:var(--wp-surface-card-border)] text-xs font-bold text-[color:var(--wp-text-secondary)] transition-colors active:scale-[0.98]"
            >
              + Úkol
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CalendarEventDetail({
  ev,
  onClose,
  onEdit,
  onDelete,
  onFollowUpEvent,
  onFollowUpTask,
  onMarkDone,
  onOpenContact,
  onOpenPipeline,
  canWriteCalendar = true,
  contactPhone,
  contactEmail,
  eventTypeColors,
  onChangeType,
  deviceClass = "phone",
}: {
  ev: EventRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFollowUpEvent: () => void;
  onFollowUpTask: () => void;
  onMarkDone: () => void;
  onOpenContact: (id: string) => void;
  onOpenPipeline?: () => void;
  canWriteCalendar?: boolean;
  contactPhone?: string | null;
  contactEmail?: string | null;
  eventTypeColors?: Record<string, string>;
  onChangeType?: (nextType: string) => void;
  deviceClass?: DeviceClass;
}) {
  const openEdit = () => {
    onClose();
    onEdit();
  };

  const openContact = (id: string) => {
    onOpenContact(id);
    onClose();
  };

  const openPipeline = onOpenPipeline
    ? () => {
        onOpenPipeline();
        onClose();
      }
    : undefined;

  if (deviceClass === "tablet" || deviceClass === "desktop") {
    return (
      <>
        <button
          type="button"
          aria-label="Zavřít detail"
          className="fixed inset-0 z-[100] bg-[color:var(--wp-overlay-scrim)] animate-in fade-in duration-200"
          onClick={onClose}
        />
        <aside
          className="fixed right-0 top-0 z-[101] flex h-full w-full max-w-[360px] flex-col border-l border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-2xl animate-in slide-in-from-right duration-300 ease-out"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cal-ev-detail-title"
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[color:var(--wp-surface-card-border)] px-4 py-3">
            <h2 id="cal-ev-detail-title" className="min-w-0 flex-1 font-black text-sm leading-snug text-[color:var(--wp-text)]">
              {ev.title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zavřít"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <EventDetailBody
              ev={ev}
              onClose={onClose}
              onEdit={openEdit}
              onDelete={onDelete}
              onFollowUpEvent={onFollowUpEvent}
              onFollowUpTask={onFollowUpTask}
              onMarkDone={onMarkDone}
              onOpenContact={openContact}
              onOpenPipeline={openPipeline}
              canWriteCalendar={canWriteCalendar}
              contactPhone={contactPhone}
              contactEmail={contactEmail}
              eventTypeColors={eventTypeColors}
              onChangeType={onChangeType}
            />
          </div>
        </aside>
      </>
    );
  }

  return (
    <FullscreenSheet open onClose={onClose} title={ev.title} noPadding>
      <EventDetailBody
        ev={ev}
        onClose={onClose}
        onEdit={openEdit}
        onDelete={onDelete}
        onFollowUpEvent={onFollowUpEvent}
        onFollowUpTask={onFollowUpTask}
        onMarkDone={onMarkDone}
        onOpenContact={openContact}
        onOpenPipeline={openPipeline}
        canWriteCalendar={canWriteCalendar}
        contactPhone={contactPhone}
        contactEmail={contactEmail}
        eventTypeColors={eventTypeColors}
        onChangeType={onChangeType}
      />
    </FullscreenSheet>
  );
}
