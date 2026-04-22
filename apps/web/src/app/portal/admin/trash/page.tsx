"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import {
  listTrashContacts,
  restoreContactFromTrash,
} from "@/app/actions/contacts";
import { useToast } from "@/app/components/Toast";
import { useConfirm } from "@/app/components/ConfirmDialog";

type TrashRow = Awaited<ReturnType<typeof listTrashContacts>>[number];

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400_000));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AdminTrashPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listTrashContacts()
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst koš.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Trash2 className="h-6 w-6 text-rose-600" aria-hidden />
          <h1 className="text-2xl font-black tracking-tight text-[color:var(--wp-text)]">
            Koš kontaktů
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--wp-text-secondary)]">
          Smazané kontakty zůstávají v koši <strong>30 dnů</strong> — během této doby je lze obnovit. Po 30 dnech
          kontakt automaticky zmizí i se všemi souvisejícími záznamy (smlouvy, dokumenty, zprávy).
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Pokud klient požádal o GDPR výmaz, NEobnovujte.
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center text-sm text-[color:var(--wp-text-secondary)]">Načítám…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] py-16 text-center text-sm text-[color:var(--wp-text-secondary)]">
          Koš je prázdný.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-[color:var(--wp-main-scroll-bg)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--wp-text)]">Kontakt</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--wp-text)]">E-mail</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--wp-text)]">Smazáno</th>
                <th className="px-4 py-3 text-left font-semibold text-[color:var(--wp-text)]">Zmizí za</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const days = daysUntil(r.purgeScheduledAt);
                return (
                  <tr key={r.id} className="hover:bg-[color:var(--wp-main-scroll-bg)]">
                    <td className="px-4 py-3 font-semibold text-[color:var(--wp-text)]">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--wp-text-secondary)]">{r.email ?? "—"}</td>
                    <td className="px-4 py-3 text-[color:var(--wp-text-secondary)]">{formatDate(r.deletedAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          days <= 3
                            ? "bg-rose-100 text-rose-800"
                            : days <= 7
                              ? "bg-amber-100 text-amber-800"
                              : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]"
                        }`}
                      >
                        {days} {days === 1 ? "den" : days >= 2 && days <= 4 ? "dny" : "dnů"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Obnovit kontakt z koše?",
                            message: `Opravdu obnovit ${r.firstName} ${r.lastName}? Toto potvrďte POUZE pokud smazání bylo omylem. Pokud klient požádal o GDPR výmaz, NEOBNOVUJTE.`,
                            confirmLabel: "Obnovit",
                          });
                          if (!ok) return;
                          startTransition(async () => {
                            try {
                              await restoreContactFromTrash(r.id);
                              toast.showToast("Kontakt byl obnoven.");
                              load();
                            } catch (e) {
                              toast.showToast(
                                e instanceof Error ? e.message : "Obnovení se nezdařilo.",
                                "error",
                              );
                            }
                          });
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Obnovit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
