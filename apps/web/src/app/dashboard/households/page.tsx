import Link from "next/link";
import { getHouseholdsList } from "@/app/actions/households";

export default async function HouseholdsPage() {
  const list = await getHouseholdsList();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        Domácnosti
      </h1>
      <p className="text-slate-600">Domácnosti a vazba kontaktů.</p>
      <div className="rounded-xl border border-[var(--brand-border)] bg-white overflow-hidden shadow-sm">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Zatím žádné domácnosti.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--brand-border)] bg-slate-50">
                <th className="text-left p-3 text-sm font-semibold text-slate-600">Název</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600">Počet členů</th>
                <th className="text-left p-3 text-sm font-semibold text-slate-600" />
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3 font-medium">{h.name}</td>
                  <td className="p-3 text-slate-600">{h.memberCount}</td>
                  <td className="p-3">
                    <Link href={`/dashboard/households/${h.id}`} className="text-sm font-medium" style={{ color: "var(--brand-main)" }}>
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
