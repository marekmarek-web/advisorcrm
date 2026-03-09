import Link from "next/link";
import { notFound } from "next/navigation";
import { getHousehold } from "@/app/actions/households";

export default async function HouseholdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const household = await getHousehold(id);
  if (!household) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        {household.name}
      </h1>
      <div className="rounded-xl border border-[var(--brand-border)] bg-white overflow-hidden shadow-sm">
        <h2 className="p-3 border-b border-slate-100 font-semibold text-slate-700">Členové</h2>
        {household.members.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Žádní členové.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left p-3 text-sm font-semibold text-slate-600">Jméno</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600">E-mail</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600">Role</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600" />
              </tr>
            </thead>
            <tbody>
              {household.members.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="p-3">
                    {m.firstName} {m.lastName}
                  </td>
                  <td className="p-3 text-slate-600">{m.email ?? "—"}</td>
                  <td className="p-3 text-slate-600">{m.role ?? "—"}</td>
                  <td className="p-3">
                    <Link href={`/dashboard/contacts/${m.contactId}`} className="text-sm" style={{ color: "var(--brand-main)" }}>
                      Kontakt
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Link href="/dashboard/households" className="text-sm font-medium" style={{ color: "var(--brand-main)" }}>
        ← Zpět na domácnosti
      </Link>
    </div>
  );
}
