import Link from "next/link";
import { getHouseholdsList } from "@/app/actions/households";

export default async function HouseholdsPage() {
  const list = await getHouseholdsList();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        Domácnosti
      </h1>
      <p className="text-[color:var(--wp-text-secondary)]">Domácnosti a vazba kontaktů.</p>
      <div className="overflow-hidden rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-[color:var(--wp-text-tertiary)]">Zatím žádné domácnosti.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">Název</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">Počet členů</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]" />
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="border-b border-[color:var(--wp-border)] hover:bg-[color:var(--wp-surface-muted)]">
                  <td className="p-3 font-medium text-[color:var(--wp-text)]">{h.name}</td>
                  <td className="p-3 text-[color:var(--wp-text-secondary)]">{h.memberCount}</td>
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
