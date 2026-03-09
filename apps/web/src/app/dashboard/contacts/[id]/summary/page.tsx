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
        <Link href={`/dashboard/contacts/${id}`} className="rounded-lg px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-600">
          ← Zpět na kontakt
        </Link>
      </div>
      <div className="rounded-xl border border-[var(--brand-border)] bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold mb-6" style={{ color: "var(--brand-dark)" }}>
          Client summary
        </h1>
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase mb-2">Kontakt</h2>
          <p className="font-medium">{contact.firstName} {contact.lastName}</p>
          <p className="text-slate-600">{contact.email ?? "—"}</p>
          <p className="text-slate-600">{contact.phone ?? "—"}</p>
        </section>
        {householdName && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase mb-2">Domácnost</h2>
            <p>{householdName}</p>
          </section>
        )}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase mb-2">Otevřené případy</h2>
          {openOpportunities.length === 0 ? (
            <p className="text-slate-500">Žádné otevřené případy.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {openOpportunities.map((o, i) => (
                <li key={i}>{o.title} ({o.stageName})</li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-xs text-slate-400 print:block hidden">Pro export do PDF použijte v prohlížeči Tisk → Uložit jako PDF.</p>
    </div>
  );
}
