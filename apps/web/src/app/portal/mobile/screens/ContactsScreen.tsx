"use client";

import { useState, useMemo } from "react";
import { Phone, Mail, ChevronRight, UserPlus, User } from "lucide-react";
import type { ContactRow } from "@/app/actions/contacts";
import {
  EmptyState,
  MobileCard,
  SearchBar,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import { MasterDetailLayout } from "@/app/shared/mobile-ui/MobileLayouts";
import { VirtualizedColumn } from "@/app/shared/mobile-ui/VirtualizedColumn";
import { ClientProfileScreen } from "./ClientProfileScreen";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

const CONTACT_LIST_VIRTUAL_THRESHOLD = 24;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const SEGMENT_LABELS: Record<string, string> = {
  lead: "Lead",
  prospect: "Prospect",
  client: "Klient",
  former_client: "Bývalý",
  vip: "VIP",
};

const SEGMENT_COLORS: Record<string, string> = {
  lead: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
  prospect: "bg-blue-50 text-blue-700",
  client: "bg-emerald-50 text-emerald-700",
  former_client: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
  vip: "bg-amber-50 text-amber-700",
};

function Initials({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const colors = [
    "bg-indigo-500",
    "bg-purple-500",
    "bg-emerald-500",
    "bg-blue-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-teal-500",
  ];
  const idx = (firstName.charCodeAt(0) + lastName.charCodeAt(0)) % colors.length;
  return (
    <div
      className={cx(
        "w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black flex-shrink-0",
        colors[idx]
      )}
      aria-hidden
    >
      {initials || <User size={16} />}
    </div>
  );
}

function ContactCard({
  contact,
  onSelect,
  onTaskWizard,
  isActive,
}: {
  contact: ContactRow;
  onSelect: () => void;
  onTaskWizard: () => void;
  isActive?: boolean;
}) {
  const segment = contact.lifecycleStage ?? contact.tags?.[0];

  return (
    <MobileCard
      className={cx(
        "p-0 overflow-hidden transition-colors",
        isActive && "ring-2 ring-indigo-500 border-indigo-200"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left"
      >
        <div className="flex items-center gap-3 p-3.5">
          <Initials firstName={contact.firstName} lastName={contact.lastName} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
              {contact.firstName} {contact.lastName}
            </p>
            {contact.email ? (
              <p className="text-xs text-[color:var(--wp-text-secondary)] truncate mt-0.5">{contact.email}</p>
            ) : contact.phone ? (
              <p className="text-xs text-[color:var(--wp-text-secondary)] truncate mt-0.5">{contact.phone}</p>
            ) : null}
            {segment ? (
              <span
                className={cx(
                  "inline-block mt-1 text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                  SEGMENT_COLORS[segment] ?? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                )}
              >
                {SEGMENT_LABELS[segment] ?? segment}
              </span>
            ) : null}
          </div>
          <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0" />
        </div>
      </button>

      {/* Quick action row */}
      <div className="flex gap-0 border-t border-[color:var(--wp-surface-card-border)]">
        {contact.phone ? (
          <a
            href={`tel:${contact.phone}`}
            className="flex-1 min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors border-r border-[color:var(--wp-surface-card-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone size={13} /> Zavolat
          </a>
        ) : null}
        {contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            className="flex-1 min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors border-r border-[color:var(--wp-surface-card-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail size={13} /> E-mail
          </a>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTaskWizard();
          }}
          className="flex-1 min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors"
        >
          + Úkol
        </button>
      </div>
    </MobileCard>
  );
}

interface ContactsScreenProps {
  contacts: ContactRow[];
  selectedContactId: string | null;
  deviceClass: DeviceClass;
  /** Shell transition (e.g. refresh) — suppress empty-state flash while data may be stale. */
  refreshing?: boolean;
  onSelectContact: (contactId: string) => void;
  onOpenNewContact: () => void;
  onTaskWizard: (contactId: string) => void;
  onOpportunityWizard: (contactId: string) => void;
  onOpenHousehold: (householdId: string) => void;
}

export function ContactsScreen({
  contacts,
  selectedContactId,
  deviceClass,
  refreshing = false,
  onSelectContact,
  onOpenNewContact,
  onTaskWizard,
  onOpportunityWizard,
  onOpenHousehold,
}: ContactsScreenProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      return (
        name.includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [contacts, search]);

  const masterList = (
    <div className="space-y-3 pb-4">
      <SearchBar value={search} onChange={setSearch} placeholder="Hledat klienta…" />

      {/* Stats row */}
      <div className="flex items-center gap-2 px-0.5">
        <StatusBadge tone="info">{contacts.length} kontaktů</StatusBadge>
        {filtered.length !== contacts.length ? (
          <StatusBadge tone="neutral">{filtered.length} výsledků</StatusBadge>
        ) : null}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onOpenNewContact}
          className="min-h-[36px] flex items-center gap-1.5 px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold"
        >
          <UserPlus size={13} /> Nový
        </button>
      </div>

      {!refreshing && filtered.length === 0 ? (
        <EmptyState
          title="Žádní klienti"
          description={search ? "Žádné výsledky hledání." : "Zatím nemáte žádné kontakty."}
        />
      ) : filtered.length > 0 ? (
        <VirtualizedColumn
          count={filtered.length}
          estimateSize={132}
          enabled={filtered.length >= CONTACT_LIST_VIRTUAL_THRESHOLD}
          fallback={filtered.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onSelect={() => onSelectContact(c.id)}
              onTaskWizard={() => onTaskWizard(c.id)}
              isActive={selectedContactId === c.id && deviceClass === "tablet"}
            />
          ))}
        >
          {(index) => {
            const c = filtered[index];
            if (!c) return null;
            return (
              <div className="pb-3">
                <ContactCard
                  contact={c}
                  onSelect={() => onSelectContact(c.id)}
                  onTaskWizard={() => onTaskWizard(c.id)}
                  isActive={selectedContactId === c.id && deviceClass === "tablet"}
                />
              </div>
            );
          }}
        </VirtualizedColumn>
      ) : null}
    </div>
  );

  const detailPanel =
    selectedContactId ? (
      <div className="px-3 py-4 space-y-4">
        <ClientProfileScreen
          contactId={selectedContactId}
          onOpenTaskWizard={onTaskWizard}
          onOpenOpportunityWizard={onOpportunityWizard}
          onOpenHousehold={onOpenHousehold}
        />
      </div>
    ) : null;

  return (
    <MasterDetailLayout
      master={masterList}
      detail={detailPanel}
      showDetail={Boolean(selectedContactId)}
      deviceClass={deviceClass}
    />
  );
}
