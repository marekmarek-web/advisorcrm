"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart2,
  Search,
  Filter,
  FileText,
  FileCheck,
  FileEdit,
  Clock,
  Calendar,
  User,
  ArrowRight,
  CheckCircle2,
  Download,
  Trash2,
  MoreHorizontal,
  Edit3,
} from "lucide-react";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import { deleteFinancialAnalysisPermanently, setFinancialAnalysisStatus } from "@/app/actions/financial-analyses";
import { formatUpdated, TABS, matchesTab, isCompleted, type TabId } from "./analyses-page-utils";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

export default function AnalysesPageClient({ analyses }: { analyses: FinancialAnalysisListItem[] }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  function getStatusDesign(status: string): { label: string; color: string; icon: ReactNode } {
    switch (status) {
      case "completed":
      case "exported":
        return {
          label: "Hotovo",
          color:
            "bg-emerald-100 text-emerald-800 border-emerald-200 dark:border-emerald-500/35 dark:bg-emerald-950/50 dark:text-emerald-200",
          icon: <CheckCircle2 size={12} />,
        };
      case "review":
        return {
          label: "Ke schválení",
          color:
            "bg-amber-100 text-amber-900 border-amber-200 dark:border-amber-500/35 dark:bg-amber-950/45 dark:text-amber-100",
          icon: <Clock size={12} />,
        };
      case "draft":
      case "archived":
        return { label: "Koncept", color: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]", icon: <FileEdit size={12} /> };
      default:
        return { label: status, color: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]", icon: <FileText size={12} /> };
    }
  }

  const filteredList = useMemo(() => {
    let list = analyses;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((a) => (a.clientName ?? "").toLowerCase().includes(q));
    }
    return list.filter((a) => matchesTab(a, activeTab));
  }, [analyses, searchQuery, activeTab]);

  async function handleArchive(id: string) {
    setOpenMenuId(null);
    if (!confirm("Opravdu chcete archivovat tuto analýzu?")) return;
    setArchivingId(id);
    try {
      await setFinancialAnalysisStatus(id, "archived");
      router.refresh();
    } finally {
      setArchivingId(null);
    }
  }

  async function handleConfirmPermanentDelete() {
    if (!permanentDeleteTarget) return;
    const { id } = permanentDeleteTarget;
    setDeletingId(id);
    try {
      await deleteFinancialAnalysisPermanently(id);
      setPermanentDeleteTarget(null);
      setOpenMenuId(null);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smazání se nepodařilo.";
      alert(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--wp-main-scroll-bg)] pb-20">
      {permanentDeleteTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fa-delete-title"
          aria-describedby="fa-delete-desc"
          onClick={() => (deletingId ? null : setPermanentDeleteTarget(null))}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] shadow-xl p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="fa-delete-title" className="text-lg font-black text-[color:var(--wp-text)] mb-2">
              Trvale smazat analýzu?
            </h2>
            <p id="fa-delete-desc" className="text-sm text-[color:var(--wp-text-secondary)] mb-1">
              <span className="font-semibold text-[color:var(--wp-text)]">{permanentDeleteTarget.label}</span> bude
              nenávratně odstraněna z CRM včetně konceptu a historie u této položky.
            </p>
            <p className="text-sm text-rose-700 font-medium mb-6">Tuto akci nelze vrátit zpět.</p>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setPermanentDeleteTarget(null)}
                disabled={deletingId !== null}
                className="min-h-[44px] px-5 py-3 rounded-xl border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-secondary)] font-semibold hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
              >
                Ne
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPermanentDelete()}
                disabled={deletingId !== null}
                className="min-h-[44px] px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
              >
                {deletingId ? "Mažu…" : "Ano, smazat"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <style>{`
        .hub-bg {
          background-image:
            linear-gradient(to right, rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        html.dark .hub-bg {
          background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
        }
      `}</style>

      <main className="max-w-[1200px] mx-auto p-4 sm:p-6 md:p-8 hub-bg min-h-[calc(100vh-73px)]">
        {/* Hlavička stránky & akce */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-[color:var(--wp-text)] tracking-tight">
                Finanční analýzy
              </h1>
              <span className="px-3 py-1 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] text-xs font-black rounded-lg border border-[color:var(--wp-surface-card-border)]">
                {analyses.length} celkem
              </span>
            </div>
            <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
              Uložené analýzy, rozpracované koncepty a nástroje pro interní podklady poradce.
            </p>
          </div>
          <CreateActionButton href="/portal/analyses/financial">Nová analýza</CreateActionButton>
        </div>

        {/* Zvýrazněná CTA karta – Wizard */}
        <Link
          href="/portal/analyses/financial"
          className="block bg-[color:var(--wp-surface-card)] rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 md:p-8 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-lg hover:border-indigo-100 transition-all duration-300 mb-10 sm:mb-12 group relative overflow-hidden"
        >
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-indigo-50 blur-3xl transition-colors group-hover:bg-indigo-100 dark:bg-indigo-950/50 dark:group-hover:bg-indigo-900/40 sm:h-48 sm:w-48" />
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 relative z-10">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-inner transition-transform duration-300 group-hover:scale-105 dark:bg-indigo-950/60 dark:text-indigo-300 sm:h-16 sm:w-16">
              <BarChart2 size={28} className="sm:w-8 sm:h-8" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-lg sm:text-xl font-black text-[color:var(--wp-text)] mb-1 group-hover:text-indigo-600 transition-colors">
                Komplexní finanční analýza (Wizard)
              </h2>
              <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] leading-relaxed">
                Kompletní průvodce pro sestavení finančního plánu. Cashflow, bilance, cíle, strategie a generování PDF reportu.
              </p>
            </div>
            <div className="mt-2 sm:mt-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[color:var(--wp-surface-muted)] flex items-center justify-center text-[color:var(--wp-text-tertiary)] group-hover:bg-indigo-600 group-hover:text-white transition-colors shadow-sm">
                <ArrowRight size={20} />
              </div>
            </div>
          </div>
        </Link>

        {/* Sekce Uložené analýzy */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-black text-[color:var(--wp-text)]">Uložené analýzy</h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:min-w-[200px] sm:max-w-[256px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)] pointer-events-none"
              />
              <input
                type="text"
                placeholder="Hledat podle klienta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all shadow-sm min-h-[44px]"
              />
            </div>
            <button
              type="button"
              className="p-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl hover:bg-[color:var(--wp-surface-muted)] transition-colors shadow-sm min-h-[44px] min-w-[44px]"
              aria-label="Filtrovat"
            >
              <Filter size={16} />
            </button>
          </div>
        </div>

        {/* Taby */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto hide-scrollbar pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap min-h-[44px]
                ${activeTab === tab.id ? "bg-indigo-600 text-white shadow-md" : "bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Seznam karet */}
        {analyses.length === 0 ? (
          <div className="p-8 sm:p-12 text-center border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-3xl bg-[color:var(--wp-surface-muted)]/50">
            <div className="w-16 h-16 bg-[color:var(--wp-surface-card)] rounded-2xl flex items-center justify-center text-[color:var(--wp-text-tertiary)] mx-auto mb-4 shadow-sm">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-bold text-[color:var(--wp-text-secondary)] mb-2">Zatím žádné analýzy</h3>
            <p className="text-sm text-[color:var(--wp-text-secondary)] mb-6">
              Vytvořte novou analýzu nebo otevřete analýzu z profilu klienta.
            </p>
            <CreateActionButton href="/portal/analyses/financial">Nová analýza</CreateActionButton>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 sm:p-12 text-center border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-3xl bg-[color:var(--wp-surface-muted)]/50">
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Pro vybraný filtr nejsou žádné záznamy.</p>
          </div>
        ) : (
          <ul className="space-y-4" role="list">
            {filteredList.map((a) => {
              const statusDesign = getStatusDesign(a.status);
              const completed = isCompleted(a.status);
              const progress = a.progress ?? (completed ? 100 : 0);
              const typeLabel = a.analysisTypeLabel ?? "Komplexní finanční analýza";

              return (
                <li
                  key={a.id}
                  className="bg-[color:var(--wp-surface-card)] rounded-2xl p-4 sm:p-5 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6"
                >
                  {/* Levá část: ikona + info */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner
                        ${completed ? "bg-indigo-50 text-indigo-600" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border border-[color:var(--wp-surface-card-border)]"}
                      `}
                    >
                      {completed ? <FileCheck size={24} /> : <FileText size={24} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-[color:var(--wp-text)] text-base mb-0.5 truncate group-hover:text-indigo-600">
                        {a.clientName || "Bez názvu"}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {typeLabel}
                        </span>
                        <span className="hidden h-1 w-1 rounded-full bg-[color:var(--wp-text-tertiary)] sm:inline" />
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          Upraveno: {formatUpdated(a.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Střed: progres + status */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 w-full md:w-auto">
                    {!completed && (
                      <div className="w-full sm:w-32 min-w-0">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
                          <span>Progres</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-[width] duration-300"
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${statusDesign.color}`}
                    >
                      {statusDesign.icon}
                      {statusDesign.label}
                    </div>
                  </div>

                  {/* Pravá část: akce */}
                  <div className="flex items-center justify-end gap-2 border-t md:border-t-0 border-[color:var(--wp-surface-card-border)] pt-4 md:pt-0 w-full md:w-auto flex-shrink-0">
                    {completed ? (
                      <Link
                        href={`/portal/analyses/financial?id=${encodeURIComponent(a.id)}`}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]"
                      >
                        <Download size={14} />
                        PDF
                      </Link>
                    ) : (
                      <Link
                        href={`/portal/analyses/financial?id=${encodeURIComponent(a.id)}`}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-indigo-600 hover:border-indigo-200 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-colors min-h-[44px]"
                      >
                        <Edit3 size={14} />
                        Pokračovat
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setPermanentDeleteTarget({
                          id: a.id,
                          label: a.clientName || a.analysisTypeLabel || "Analýza bez názvu",
                        })
                      }
                      disabled={deletingId === a.id || archivingId === a.id}
                      className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 text-[color:var(--wp-text-tertiary)] hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors min-h-[44px] min-w-[44px] sm:min-w-0 border border-transparent hover:border-rose-200 disabled:opacity-50"
                      aria-label="Trvale smazat analýzu"
                    >
                      <Trash2 size={16} />
                      <span className="text-xs font-black uppercase tracking-wider hidden sm:inline">Smazat</span>
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === a.id ? null : a.id)}
                        className="p-2.5 text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] rounded-xl transition-colors min-h-[44px] min-w-[44px]"
                        aria-label="Další možnosti"
                        aria-expanded={openMenuId === a.id}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {openMenuId === a.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            aria-hidden
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 py-1 w-48 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl shadow-lg">
                            <Link
                              href={`/portal/analyses/financial?id=${encodeURIComponent(a.id)}`}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg"
                              onClick={() => setOpenMenuId(null)}
                            >
                              Otevřít
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleArchive(a.id)}
                              disabled={archivingId === a.id}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--wp-text-secondary)] hover:bg-amber-50 hover:text-amber-900 rounded-lg"
                            >
                              Archivovat
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setPermanentDeleteTarget({
                                  id: a.id,
                                  label: a.clientName || a.analysisTypeLabel || "Analýza bez názvu",
                                });
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 rounded-lg"
                            >
                              Trvale smazat…
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
