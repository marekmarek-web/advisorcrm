import Link from "next/link";
import { getContractsForPeriod, type PeriodType } from "@/app/actions/production";
import { FileText } from "lucide-react";

const PERIOD_LABELS: Record<string, string> = {
  month: "Měsíc",
  quarter: "Kvartál",
  year: "Rok",
};

export default async function PortalContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = (params.period === "quarter" || params.period === "year" ? params.period : "month") as PeriodType;
  const { rows, periodLabel } = await getContractsForPeriod(period);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <div className="wp-projects-section flex-1 min-w-0 pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6" style={{ marginBottom: "var(--wp-space-8)" }}>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2" style={{ color: "var(--wp-text)" }}>
              Smlouvy v období
            </h1>
            <p className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--wp-text-muted)" }}>
              <FileText size={16} style={{ color: "var(--wp-accent, #4f46e5)" }} />
              Období: <span style={{ color: "var(--wp-text)" }}>{periodLabel}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["month", "quarter", "year"] as const).map((p) => (
              <Link
                key={p}
                href={`/portal/contracts?period=${p}`}
                className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${
                  period === p ? "shadow-sm border" : "opacity-80 hover:opacity-100"
                }`}
                style={
                  period === p
                    ? { background: "var(--wp-bg-card, #fff)", borderColor: "var(--wp-border)", color: "var(--wp-accent, #4f46e5)" }
                    : { background: "var(--wp-bg)", borderColor: "var(--wp-border)", color: "var(--wp-text-muted)" }
                }
              >
                {PERIOD_LABELS[p]}
              </Link>
            ))}
          </div>
        </div>

        <div
          className="rounded-3xl border overflow-hidden flex flex-col"
          style={{ background: "var(--wp-bg-card, #fff)", borderColor: "var(--wp-border)" }}
        >
          <div
            className="px-6 md:px-8 py-4 border-b"
            style={{ background: "var(--wp-bg)", borderColor: "var(--wp-border)" }}
          >
            <h2 className="text-lg font-bold" style={{ color: "var(--wp-text)" }}>
              Seznam smluv ({rows.length})
            </h2>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--wp-border)" }}>
                  <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                    Segment
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                    Partner
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                    Číslo smlouvy
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                    Začátek
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--wp-text-muted)" }}>
                    Pojistné
                  </th>
                  <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                    Klient
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-8 text-center text-sm" style={{ color: "var(--wp-text-muted)" }}>
                      Žádné smlouvy v tomto období.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 transition-colors hover:bg-black/5"
                      style={{ borderColor: "var(--wp-border)" }}
                    >
                      <td className="px-6 md:px-8 py-4">
                        <span className="text-sm font-medium" style={{ color: "var(--wp-text)" }}>
                          {r.segmentLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm" style={{ color: "var(--wp-text-muted)" }}>
                          {r.partnerName ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono" style={{ color: "var(--wp-text)" }}>
                          {r.contractNumber ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: "var(--wp-text-muted)" }}>
                        {r.startDate ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-medium" style={{ color: "var(--wp-text)" }}>
                          {r.premiumAmount.toLocaleString("cs-CZ")} Kč
                        </span>
                      </td>
                      <td className="px-6 md:px-8 py-4">
                        <Link
                          href={`/portal/contacts/${r.contactId}`}
                          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          Otevřít klienta →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
