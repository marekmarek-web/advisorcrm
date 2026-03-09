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
    <div className="max-w-2xl mx-auto p-4 space-y-6 print:max-w-none">
      <div className="flex gap-4 print:hidden">
        <PrintButton />
        <Link
          href={`/portal/contacts/${id}`}
          className="rounded-[6px] px-4 py-2 text-sm font-semibold border border-monday-border text-monday-text hover:bg-monday-row-hover"
        >
          ← Zpět na kontakt
        </Link>
      </div>
      <div className="rounded-lg border border-monday-border bg-monday-surface p-8">
        <h1 className="text-lg font-bold text-monday-text mb-6">Client summary</h1>
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-monday-text-muted uppercase mb-2">Kontakt</h2>
          <p className="font-medium text-monday-text">{contact.firstName} {contact.lastName}</p>
          <p className="text-monday-text-muted text-sm">{contact.email ?? "—"}</p>
          <p className="text-monday-text-muted text-sm">{contact.phone ?? "—"}</p>
        </section>
        {householdName && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-monday-text-muted uppercase mb-2">Domácnost</h2>
            <p className="text-monday-text text-sm">{householdName}</p>
          </section>
        )}
        <section>
          <h2 className="text-xs font-semibold text-monday-text-muted uppercase mb-2">Otevřené případy</h2>
          {openOpportunities.length === 0 ? (
            <p className="text-monday-text-muted text-sm">Žádné otevřené případy.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-sm text-monday-text">
              {openOpportunities.map((o, i) => (
                <li key={i}>{o.title} ({o.stageName})</li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-xs text-monday-text-muted print:block hidden">
        Pro export do PDF použijte v prohlížeči Tisk → Uložit jako PDF.
      </p>
    </div>
  );
}
