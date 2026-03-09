import Link from "next/link";
import { getContactsList } from "@/app/actions/contacts";
import { CsvImportForm } from "./CsvImportForm";

export default async function ContactsPage() {
  const list = await getContactsList();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
          Kontakty
        </h1>
        <Link
          href="/dashboard/contacts/new"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: "var(--brand-main)" }}
        >
          + Přidat kontakt
        </Link>
      </div>
      <p className="text-slate-600">Seznam kontaktů.</p>
      <CsvImportForm />
      <div className="rounded-xl border border-[var(--brand-border)] bg-white overflow-hidden shadow-sm">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Zatím žádné kontakty.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--brand-border)] bg-slate-50">
                <th className="text-left p-3 text-sm font-semibold text-slate-600">Jméno</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600">E-mail</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600">Telefon</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="p-3 text-slate-600">{c.email ?? "—"}</td>
                  <td className="p-3 text-slate-600">{c.phone ?? "—"}</td>
                  <td className="p-3">
                    <Link
                      href={`/dashboard/contacts/${c.id}`}
                      className="text-sm font-medium"
                      style={{ color: "var(--brand-main)" }}
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
