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
      <div className="overflow-hidden rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
        <h2 className="border-b border-[color:var(--wp-surface-card-border)] p-3 font-semibold text-[color:var(--wp-text)]">Členové</h2>
        {household.members.length === 0 ? (
          <p className="p-6 text-sm text-[color:var(--wp-text-tertiary)]">Žádní členové.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">Jméno</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">E-mail</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]">Role</th>
                <th className="p-3 text-left text-sm font-semibold text-[color:var(--wp-text-secondary)]" />
              </tr>
            </thead>
            <tbody>
              {household.members.map((m) => (
                <tr key={m.id} className="border-b border-[color:var(--wp-border)]">
                  <td className="p-3 text-[color:var(--wp-text)]">
                    {m.firstName} {m.lastName}
                  </td>
                  <td className="p-3 text-[color:var(--wp-text-secondary)]">{m.email ?? "—"}</td>
                  <td className="p-3 text-[color:var(--wp-text-secondary)]">{m.role ?? "—"}</td>
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
