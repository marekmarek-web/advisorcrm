import Link from "next/link";
import { Calendar, CreditCard, Hash, MapPin, User } from "lucide-react";
import type { ContactAiProvenanceResult, ContactRow } from "@/app/actions/contacts";
import { AiReviewProvenanceBadge } from "@/app/components/aidvisora/AiReviewProvenanceBadge";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import {
  resolveContactIdentityFieldProvenanceForContactRow,
  shouldShowContactIdentityRow,
} from "@/lib/portal/contact-identity-field-provenance";

type Props = {
  contactId: string;
  contact: ContactRow;
  provenance: ContactAiProvenanceResult | null;
};

export function ContactDetailIdentityTab({ contactId, contact, provenance }: Props) {
  const addressLine = [contact.street, [contact.city, contact.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const rows: {
    key: string;
    label: string;
    icon: typeof User;
    value: string | null | undefined;
  }[] = [
    { key: "title", label: "Titul", icon: User, value: contact.title?.trim() || null },
    {
      key: "birthDate",
      label: "Datum narození",
      icon: Calendar,
      value: contact.birthDate ? formatDisplayDateCs(contact.birthDate) || contact.birthDate : null,
    },
    { key: "personalId", label: "Rodné číslo", icon: Hash, value: contact.personalId?.trim() || null },
    { key: "idCardNumber", label: "Číslo občanského průkazu", icon: CreditCard, value: contact.idCardNumber?.trim() || null },
    { key: "address", label: "Adresa", icon: MapPin, value: addressLine || null },
  ];

  const visibleRows = rows.filter(({ key, value }) =>
    shouldShowContactIdentityRow(key, Boolean(value), provenance),
  );

  return (
    <div className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[color:var(--wp-text)]">Detail klienta</h2>
          <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1">
            Identifikační údaje, rodné číslo a číslo dokladu. Údaje lze doplnit nebo upravit v úpravě kontaktu.
          </p>
        </div>
        <Link
          href={`/portal/contacts/${contactId}/edit`}
          className="inline-flex items-center justify-center rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-black text-indigo-700 hover:bg-indigo-100 transition-colors min-h-[44px] shrink-0"
        >
          Upravit údaje
        </Link>
      </div>
      <div className="p-6">
        {visibleRows.length === 0 ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Zatím nejsou vyplněny žádné identifikační údaje. Použijte{" "}
            <Link href={`/portal/contacts/${contactId}/edit`} className="font-bold text-indigo-600 hover:underline">
              úpravu kontaktu
            </Link>
            .
          </p>
        ) : (
          <dl className="space-y-5">
            {visibleRows.map(({ key, label, icon: Icon, value }) => {
              const p = resolveContactIdentityFieldProvenanceForContactRow(key, provenance, contact);
              return (
                <div key={key} className="flex flex-col gap-1">
                  <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                    <Icon size={14} className="shrink-0 opacity-70" aria-hidden />
                    {label}
                  </dt>
                  <dd className="pl-6 break-words flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-1.5 sm:gap-2 min-w-0">
                    {value ? (
                      <span className="text-base font-bold text-[color:var(--wp-text)]">{value}</span>
                    ) : (
                      <span className="text-sm text-[color:var(--wp-text-tertiary)] italic">—</span>
                    )}
                    {p ? (
                      <span className="inline-flex min-w-0 max-w-full sm:ml-0">
                        <AiReviewProvenanceBadge
                          kind={p.kind}
                          reviewId={p.reviewId}
                          confirmedAt={p.confirmedAt}
                          className="flex-wrap max-w-full [&_a]:break-words"
                        />
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </div>
  );
}
