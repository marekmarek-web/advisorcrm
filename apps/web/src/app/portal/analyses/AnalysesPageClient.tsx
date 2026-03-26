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
import { setFinancialAnalysisStatus } from "@/app/actions/financial-analyses";
import { formatUpdated, TABS, matchesTab, isCompleted, type TabId } from "./analyses-page-utils";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

export default function AnalysesPageClient({ analyses }: { analyses: FinancialAnalysisListItem[] }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  function getStatusDesign(status: string): { label: string; color: string; icon: ReactNode } {
    switch (status) {
      case "completed":
      case "exported":
        return { label: "Hotovo", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={12} /> };
      case "review":
        return { label: "Ke schválení", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock size={12} /> };
      case "draft":
      case "archived":
        return { label: "Koncept", color: "bg-slate-100 text-slate-600 border-slate-200", icon: <FileEdit size={12} /> };
      default:
        return { label: status, color: "bg-slate-100 text-slate-600 border-slate-200", icon: <FileText size={12} /> };
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

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20">
      <style>{`
        .hub-bg {
          background-image:
            linear-gradient(to right, rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <main className="max-w-[1200px] mx-auto p-4 sm:p-6 md:p-8 hub-bg min-h-[calc(100vh-73px)]">
        {/* Hlavička stránky & akce */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                Finanční analýzy
              </h1>
              <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-black rounded-lg border border-slate-200">
                {analyses.length} celkem
              </span>
            </div>
            <p className="text-sm font-medium text-slate-500">
              Uložené analýzy, rozpracované koncepty a nástroje pro tvorbu doporučení.
            </p>
          </div>
          <CreateActionButton href="/portal/analyses/financial">Nová analýza</CreateActionButton>
        </div>

        {/* Zvýrazněná CTA karta – Wizard */}
        <Link
          href="/portal/analyses/financial"
          className="block bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 md:p-8 border border-slate-100 shadow-sm hover:shadow-lg hover:border-indigo-100 transition-all duration-300 mb-10 sm:mb-12 group relative overflow-hidden"
        >
          <div className="absolute -right-10 -bottom-10 w-40 sm:w-48 h-40 sm:h-48 bg-indigo-50 rounded-full blur-3xl group-hover:bg-indigo-100 transition-colors pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 relative z-10">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300 shadow-inner">
              <BarChart2 size={28} className="sm:w-8 sm:h-8" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                Komplexní finanční analýza (Wizard)
              </h2>
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                Kompletní průvodce pro sestavení finančního plánu. Cashflow, bilance, cíle, strategie a generování PDF reportu.
              </p>
            </div>
            <div className="mt-2 sm:mt-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors shadow-sm">
                <ArrowRight size={20} />
              </div>
            </div>
          </div>
        </Link>

        {/* Sekce Uložené analýzy */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-black text-slate-900">Uložené analýzy</h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:min-w-[200px] sm:max-w-[256px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Hledat podle klienta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all shadow-sm min-h-[44px]"
              />
            </div>
            <button
              type="button"
              className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm min-h-[44px] min-w-[44px]"
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
                ${activeTab === tab.id ? "bg-indigo-600 text-white shadow-md" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Seznam karet */}
        {analyses.length === 0 ? (
          <div className="p-8 sm:p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-slate-300 mx-auto mb-4 shadow-sm">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">Zatím žádné analýzy</h3>
            <p className="text-sm text-slate-500 mb-6">
              Vytvořte novou analýzu nebo otevřete analýzu z profilu klienta.
            </p>
            <CreateActionButton href="/portal/analyses/financial">Nová analýza</CreateActionButton>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-8 sm:p-12 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
            <p className="text-sm text-slate-500">Pro vybraný filtr nejsou žádné záznamy.</p>
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
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6"
                >
                  {/* Levá část: ikona + info */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner
                        ${completed ? "bg-indigo-50 text-indigo-600" : "bg-slate-50 text-slate-500 border border-slate-200"}
                      `}
                    >
                      {completed ? <FileCheck size={24} /> : <FileText size={24} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-base mb-0.5 truncate group-hover:text-indigo-600">
                        {a.clientName || "Bez názvu"}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-slate-500">
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {typeLabel}
                        </span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full hidden sm:inline" />
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
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          <span>Progres</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
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
                  <div className="flex items-center justify-end gap-2 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 w-full md:w-auto flex-shrink-0">
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
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm transition-colors min-h-[44px]"
                      >
                        <Edit3 size={14} />
                        Pokračovat
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => handleArchive(a.id)}
                      disabled={archivingId === a.id}
                      className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors min-h-[44px] min-w-[44px] disabled:opacity-50"
                      aria-label="Archivovat"
                    >
                      <Trash2 size={16} />
                    </button>
                    <div className="relative hidden sm:block">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === a.id ? null : a.id)}
                        className="p-2.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors min-h-[44px] min-w-[44px]"
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
                          <div className="absolute right-0 top-full mt-1 z-20 py-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg">
                            <Link
                              href={`/portal/analyses/financial?id=${encodeURIComponent(a.id)}`}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
                              onClick={() => setOpenMenuId(null)}
                            >
                              Otevřít
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleArchive(a.id)}
                              disabled={archivingId === a.id}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-rose-50 hover:text-rose-700 rounded-lg"
                            >
                              Archivovat
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
