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
      <p className="text-[color:var(--wp-text-secondary)]">Seznam kontaktů.</p>
      <CsvImportForm />
      <div className="overflow-hidden rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-[color:var(--wp-text-tertiary)]">Zatím žádné kontakty.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">Jméno</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">E-mail</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">Telefon</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-[color:var(--wp-border)] hover:bg-[color:var(--wp-surface-muted)]">
                  <td className="p-3 text-[color:var(--wp-text)]">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="p-3 text-[color:var(--wp-text-secondary)]">{c.email ?? "—"}</td>
                  <td className="p-3 text-[color:var(--wp-text-secondary)]">{c.phone ?? "—"}</td>
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
