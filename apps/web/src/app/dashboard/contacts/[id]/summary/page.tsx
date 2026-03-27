import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientSummary } from "@/app/actions/export-pdf";
import { PrintButton } from "@/app/components/PrintButton";

export default async function ClientSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const summary = await getClientSummary(id);
  if (!summary) notFound();

  const { contact, householdName, openOpportunities } = summary;

  return (
    <div className="max-w-2xl mx-auto space-y-6 print:max-w-none">
      <div className="flex gap-4 print:hidden">
        <PrintButton />
        <Link href={`/dashboard/contacts/${id}`} className="rounded-lg border border-[color:var(--wp-border-strong)] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text-secondary)]">
          ← Zpět na kontakt
        </Link>
      </div>
      <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-[color:var(--wp-text)]">
          Klientská zpráva
        </h1>
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase text-[color:var(--wp-text-tertiary)]">Kontakt</h2>
          <p className="font-medium text-[color:var(--wp-text)]">{contact.firstName} {contact.lastName}</p>
          <p className="text-[color:var(--wp-text-secondary)]">{contact.email ?? "—"}</p>
          <p className="text-[color:var(--wp-text-secondary)]">{contact.phone ?? "—"}</p>
        </section>
        {householdName && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase text-[color:var(--wp-text-tertiary)]">Domácnost</h2>
            <p className="text-[color:var(--wp-text)]">{householdName}</p>
          </section>
        )}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase text-[color:var(--wp-text-tertiary)]">Otevřené případy</h2>
          {openOpportunities.length === 0 ? (
            <p className="text-[color:var(--wp-text-secondary)]">Žádné otevřené případy.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-[color:var(--wp-text)]">
              {openOpportunities.map((o, i) => (
                <li key={i}>{o.title} ({o.stageName})</li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="hidden text-xs text-[color:var(--wp-text-tertiary)] print:block">Pro export do PDF použijte v prohlížeči Tisk → Uložit jako PDF.</p>
    </div>
  );
}
