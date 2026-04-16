import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { listTerminationRequestsAction } from "@/app/actions/terminations";
import { isTerminationsModuleEnabledOnServer } from "@/lib/terminations/terminations-feature-flag";
import { segmentLabel } from "@/app/lib/segment-labels";
import { FileText, Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Výpovědi smluv",
};

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  intake: "Rozepsaná",
  pending_review: "Čeká na kontrolu",
  ready: "Připraveno",
  dispatched: "Odesláno",
  completed: "Dokončeno",
  cancelled: "Zrušeno",
};

const STATUS_COLORS: Record<string, string> = {
  intake: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  pending_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  ready: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  dispatched: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
};

function formatCzDate(isoOrDate: string | null): string {
  if (!isoOrDate) return "—";
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function TerminationsListPage() {
  const auth = await requireAuth();
  if (auth.roleName === "Client" || !hasPermission(auth.roleName, "contacts:read")) {
    notFound();
  }
  if (!isTerminationsModuleEnabledOnServer()) {
    notFound();
  }

  const result = await listTerminationRequestsAction();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--wp-text)]">Výpovědi smluv</h1>
          <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
            Seznam všech vytvořených žádostí o ukončení smlouvy.
          </p>
        </div>
        <Link
          href="/portal/terminations/new"
          className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-900/20 hover:bg-indigo-700 active:scale-95 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Nová výpověď</span>
        </Link>
      </div>

      {!result.ok ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {result.error}
        </div>
      ) : result.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 dark:border-slate-700 dark:bg-slate-900/30">
          <FileText className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">Zatím žádné výpovědi</p>
          <Link
            href="/portal/terminations/new"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-700 transition"
          >
            <Plus className="h-4 w-4" />
            Vytvořit první výpověď
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-hidden rounded-2xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)]">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Pojišťovna</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Číslo smlouvy</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Segment</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Datum účinnosti</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Stav</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Vytvořeno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--wp-border)]">
                {result.items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-[color:var(--wp-surface-muted)] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/portal/terminations/${item.id}`}
                        className="font-semibold text-[color:var(--wp-text)] hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {item.insurerName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-[color:var(--wp-text-secondary)]">{item.contractNumber ?? "—"}</td>
                    <td className="px-5 py-3 text-[color:var(--wp-text-secondary)]">{item.productSegment ? segmentLabel(item.productSegment) : "—"}</td>
                    <td className="px-5 py-3 text-[color:var(--wp-text-secondary)]">{formatCzDate(item.requestedEffectiveDate)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[item.status] ?? STATUS_COLORS.intake}`}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[color:var(--wp-text-secondary)]">{formatCzDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {result.items.map((item) => (
              <Link
                key={item.id}
                href={`/portal/terminations/${item.id}`}
                className="block rounded-2xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] p-4 hover:bg-[color:var(--wp-surface-muted)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[color:var(--wp-text)]">{item.insurerName}</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${STATUS_COLORS[item.status] ?? STATUS_COLORS.intake}`}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--wp-text-secondary)]">
                  {item.contractNumber && <span>Smlouva: {item.contractNumber}</span>}
                  {item.productSegment && <span>{segmentLabel(item.productSegment)}</span>}
                  {item.requestedEffectiveDate && <span>Účinnost: {formatCzDate(item.requestedEffectiveDate)}</span>}
                  <span>Vytvořeno: {formatCzDate(item.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
