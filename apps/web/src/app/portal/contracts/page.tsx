import Link from "next/link";
import { getContractsForPeriod, type PeriodType } from "@/app/actions/production";
import { AlertTriangle, FileText } from "lucide-react";
import { PortalPageShell } from "@/app/components/layout/PortalPageShell";

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
  const result = await getContractsForPeriod(period)
    .then((data) => ({ ok: true as const, data }))
    .catch((error) => ({
      ok: false as const,
      message: error instanceof Error ? error.message : "Smlouvy v období se nepodařilo načíst.",
    }));
  const rows = result.ok ? result.data.rows : [];
  const periodLabel = result.ok ? result.data.periodLabel : PERIOD_LABELS[period];

  return (
    <PortalPageShell maxWidth="standard" outerClassName="[animation:wp-fade-in_0.3s_ease]">
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

        {!result.ok ? (
          <div
            className="rounded-3xl border p-6 md:p-8 mb-6 flex flex-col sm:flex-row gap-4"
            style={{ background: "var(--wp-bg-card, #fff)", borderColor: "var(--wp-border)" }}
          >
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(245, 158, 11, 0.12)", color: "#b45309" }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold mb-1" style={{ color: "var(--wp-text)" }}>
                Detail smluv se nepodařilo načíst
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--wp-text-muted)" }}>
                {result.message}
              </p>
              <Link
                href="/portal/production"
                className="inline-flex items-center min-h-[44px] mt-3 text-sm font-semibold text-indigo-600 hover:underline"
              >
                Zpět na produkci
              </Link>
            </div>
          </div>
        ) : null}

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

          <div className="md:hidden p-4 space-y-3">
            {rows.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "var(--wp-text-muted)" }}>
                {result.ok ? "Žádné smlouvy v tomto období." : "Data nejsou dostupná."}
              </p>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border p-4"
                  style={{ background: "var(--wp-bg)", borderColor: "var(--wp-border)" }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: "var(--wp-text)" }}>
                        {r.segmentLabel}
                      </p>
                      <p className="text-xs truncate" style={{ color: "var(--wp-text-muted)" }}>
                        {[r.partnerName, r.productName].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span
                      className="text-[11px] font-bold shrink-0"
                      style={{ color: r.calculationStatus === "missing_rule" ? "#b45309" : "var(--wp-text-muted)" }}
                    >
                      {r.calculationStatus === "missing_rule"
                        ? "Chybí pravidlo"
                        : r.calculationStatus === "manual_review"
                          ? "Ruční kontrola"
                          : r.calculationStatus === "manual_override"
                            ? "Ručně upraveno"
                            : "Spočteno"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span style={{ color: "var(--wp-text-muted)" }}>Vstup</span>
                      <p className="font-bold" style={{ color: "var(--wp-text)" }}>
                        {r.clientAmount == null ? "—" : `${r.clientAmount.toLocaleString("cs-CZ")} Kč`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span style={{ color: "var(--wp-text-muted)" }}>Produkce</span>
                      <p className="font-bold" style={{ color: "var(--wp-text)" }}>
                        {r.productionBj == null ? "—" : `${r.productionBj.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} BJ`}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/portal/contacts/${r.contactId}`}
                    className="inline-flex items-center min-h-[44px] mt-2 text-sm font-semibold text-indigo-600 hover:underline"
                  >
                    Otevřít klienta
                  </Link>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block flex-1 overflow-x-auto">
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
                    Datum produkce
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--wp-text-muted)" }}>
                    Vstup klienta
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--wp-text-muted)" }}>
                    Produkce BJ
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                    Stav
                  </th>
                  <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                    Klient
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-8 py-8 text-center text-sm" style={{ color: "var(--wp-text-muted)" }}>
                      {result.ok ? "Žádné smlouvy v tomto období." : "Data nejsou dostupná."}
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
                        {r.productionDate ?? r.startDate ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-medium" style={{ color: "var(--wp-text)" }}>
                          {r.clientAmount == null ? "—" : `${r.clientAmountLabel}: ${r.clientAmount.toLocaleString("cs-CZ")} Kč`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold" style={{ color: "var(--wp-text)" }}>
                          {r.productionBj == null ? "—" : `${r.productionBj.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} BJ`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold" style={{ color: r.calculationStatus === "missing_rule" ? "#b45309" : "var(--wp-text-muted)" }}>
                          {r.calculationStatus === "missing_rule"
                            ? "Chybí pravidlo"
                            : r.calculationStatus === "manual_review"
                              ? "Ruční kontrola"
                              : r.calculationStatus === "manual_override"
                                ? "Ručně upraveno"
                                : "Spočteno"}
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
    </PortalPageShell>
  );
}
