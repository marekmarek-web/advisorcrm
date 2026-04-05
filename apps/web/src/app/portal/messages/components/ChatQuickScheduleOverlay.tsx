"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { QuickEventForm } from "@/app/portal/calendar/QuickEventForm";
import {
  addMsToLocalDateTime,
  DEFAULT_EVENT_DURATION_MS,
  formatDateTimeLocal,
  localDateTimeInputToUtcIso,
  reminderIsoBeforeStartUtc,
} from "@/app/portal/calendar/date-utils";
import { loadCalendarSettings } from "@/app/portal/calendar/calendar-settings";
import { createEvent } from "@/app/actions/events";
import type { ContactRow } from "@/app/actions/contacts";
import { useToast } from "@/app/components/Toast";
import { queryKeys } from "@/lib/query-keys";

function computeDefaultSlot(): { start: string; end: string } {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  if (now.getHours() < 9) {
    now.setHours(9, 0, 0, 0);
  }
  const start = formatDateTimeLocal(now);
  return { start, end: addMsToLocalDateTime(start, DEFAULT_EVENT_DURATION_MS) };
}

export function ChatQuickScheduleOverlay({
  open,
  onClose,
  contactId,
  suggestedTitle,
  opportunityId,
  contacts,
  contactsLoading,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  suggestedTitle: string;
  opportunityId: string | null;
  contacts: ContactRow[];
  contactsLoading: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [slot, setSlot] = useState(() => computeDefaultSlot());
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSlot(computeDefaultSlot());
    setFormKey((k) => k + 1);
  }, [open, contactId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[600px]" onMouseDown={(e) => e.stopPropagation()}>
        {contactsLoading && contacts.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-xl">
            <Loader2 className="h-8 w-8 animate-spin text-[color:var(--wp-text-tertiary)]" aria-hidden />
          </div>
        ) : (
          <QuickEventForm
            key={formKey}
            initialStart={slot.start}
            initialEnd={slot.end}
            initialValues={{
              contactId,
              title: suggestedTitle,
            }}
            contacts={contacts}
            eventTypeColors={loadCalendarSettings().eventTypeColors}
            onClose={onClose}
            onSave={async (values) => {
              const startIso = localDateTimeInputToUtcIso(values.startAt);
              const endIso = localDateTimeInputToUtcIso(values.endAt);
              if (!startIso) {
                toast.showToast("Neplatný začátek události.", "error");
                throw new Error("Neplatný začátek");
              }
              const cid = values.contactId?.trim() || undefined;
              const opp =
                opportunityId && cid === contactId ? opportunityId : undefined;
              await createEvent({
                title: values.title.trim() || "Schůzka",
                eventType: values.eventType,
                startAt: startIso,
                endAt: endIso || undefined,
                location: values.location?.trim() || undefined,
                notes: values.notes?.trim() || undefined,
                contactId: cid,
                opportunityId: opp,
                reminderAt: reminderIsoBeforeStartUtc(startIso, 30) ?? undefined,
              });
              await queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
              toast.showToast("Schůzka byla uložena do kalendáře", "success");
            }}
          />
        )}
      </div>
    </div>
  );
}
