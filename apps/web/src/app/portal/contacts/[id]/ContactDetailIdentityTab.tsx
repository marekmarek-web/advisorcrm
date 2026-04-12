import Link from "next/link";
import { Calendar, CreditCard, Hash, MapPin, User } from "lucide-react";
import type { ContactAiProvenanceResult, ContactRow } from "@/app/actions/contacts";
import { AiReviewProvenanceBadge } from "@/app/components/aidvisora/AiReviewProvenanceBadge";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";

function resolveContactFieldProvenance(
  fieldKey: string,
  provenance: ContactAiProvenanceResult | null,
): { kind: "confirmed" | "auto_applied"; reviewId: string; confirmedAt?: string | null } | null {
  if (!provenance) return null;
  if (provenance.confirmedFields.includes(fieldKey)) {
    return { kind: "confirmed", reviewId: provenance.reviewId, confirmedAt: provenance.appliedAt };
  }
  if (provenance.autoAppliedFields.includes(fieldKey)) {
    return { kind: "auto_applied", reviewId: provenance.reviewId };
  }
  return null;
}

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

  const hasAny = rows.some((r) => r.value);

  return (
    <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
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
        {!hasAny ? (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">
            Zatím nejsou vyplněny žádné identifikační údaje. Použijte{" "}
            <Link href={`/portal/contacts/${contactId}/edit`} className="font-bold text-indigo-600 hover:underline">
              úpravu kontaktu
            </Link>
            .
          </p>
        ) : (
          <dl className="space-y-5">
            {rows.map(({ key, label, icon: Icon, value }) => {
              if (!value) return null;
              const p = resolveContactFieldProvenance(key, provenance);
              return (
                <div key={key} className="flex flex-col gap-1">
                  <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                    <Icon size={14} className="shrink-0 opacity-70" aria-hidden />
                    {label}
                  </dt>
                  <dd className="text-base font-bold text-[color:var(--wp-text)] pl-6 break-words">
                    {value}
                    {p && (
                      <span className="ml-2 inline-block align-middle">
                        <AiReviewProvenanceBadge kind={p.kind} reviewId={p.reviewId} confirmedAt={p.confirmedAt} />
                      </span>
                    )}
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
