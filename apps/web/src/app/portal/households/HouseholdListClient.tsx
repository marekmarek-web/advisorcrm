"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Plus, Search, ChevronDown, ChevronUp, User, Baby, Filter } from "lucide-react";
import { createHousehold, deleteHousehold } from "@/app/actions/households";
import type { HouseholdRowWithMembers, HouseholdMemberSummary } from "@/app/actions/households";
import { EmptyState } from "@/app/components/EmptyState";
import { ConfirmDeleteModal } from "@/app/components/ConfirmDeleteModal";
import { useToast } from "@/app/components/Toast";

const ROLE_LABELS: Record<string, string> = {
  primary: "Hlavní",
  member: "Člen",
  child: "Dítě",
};

function getInitials(m: HouseholdMemberSummary): string {
  const a = m.firstName?.charAt(0) ?? "";
  const b = m.lastName?.charAt(0) ?? "";
  return (a + b).toUpperCase() || "?";
}

function MetricCard({
  title,
  value,
  icon: Icon,
  colorClass,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number | string }>;
  colorClass: string;
}) {
  return (
    <div className="bg-white p-5 md:p-6 rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 md:w-14 md:h-14 rounded-[var(--wp-radius-sm)] flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon size={24} />
      </div>
      <div>
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{title}</h3>
        <p className="text-xl md:text-2xl font-bold text-slate-900 leading-none">{value}</p>
      </div>
    </div>
  );
}

export function HouseholdListClient({ list }: { list: HouseholdRowWithMembers[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let out = q
      ? list.filter((h) => {
          if (h.name.toLowerCase().includes(q)) return true;
          return h.members.some(
            (m) =>
              `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
              (m.firstName?.toLowerCase().includes(q) || m.lastName?.toLowerCase().includes(q))
          );
        })
      : [...list];
    out = [...out].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "cs");
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return out;
  }, [list, searchQuery, sortOrder]);

  const totalMembers = useMemo(() => list.reduce((acc, h) => acc + h.members.length, 0), [list]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      await createHousehold(name);
      setName("");
      setShowForm(false);
      toast.showToast("Domácnost vytvořena");
      router.refresh();
    });
  }

  function handleDeleteClick(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteModalId(id);
  }

  function handleConfirmDelete() {
    if (!deleteModalId) return;
    const id = deleteModalId;
    setDeleteModalId(null);
    if (expandedId === id) setExpandedId(null);
    startTransition(async () => {
      await deleteHousehold(id);
      toast.showToast("Domácnost smazána");
      router.refresh();
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <div className="space-y-6 md:space-y-8">
        {/* Top bar: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Domácnosti</h1>
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1a1c2e] text-white rounded-[var(--wp-radius-sm)] text-sm font-bold shadow-md hover:bg-[#2a2d4a] transition-all hover:-translate-y-0.5 shrink-0"
            >
              <Plus size={18} />
              Nová domácnost
            </button>
          ) : (
            <form onSubmit={handleCreate} className="flex items-center gap-2 flex-wrap">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Název domácnosti"
                className="flex-1 min-w-[180px] px-4 py-2.5 border border-slate-200 rounded-[var(--wp-radius-sm)] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                autoFocus
                required
              />
              <button type="submit" disabled={pending} className="px-4 py-2.5 bg-[#1a1c2e] text-white rounded-[var(--wp-radius-sm)] text-sm font-bold disabled:opacity-50">
                {pending ? "…" : "Vytvořit"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setName(""); }}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-[var(--wp-radius-sm)] text-sm font-medium hover:bg-slate-50"
              >
                Zrušit
              </button>
            </form>
          )}
        </div>

        {/* Metrics (real data only) */}
        {list.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard
              title="Spravované domácnosti"
              value={list.length}
              icon={Home}
              colorClass="bg-indigo-50 text-indigo-600 border border-indigo-100"
            />
            <MetricCard
              title="Celkem členů"
              value={totalMembers}
              icon={User}
              colorClass="bg-emerald-50 text-emerald-600 border border-emerald-100"
            />
          </div>
        )}

        {/* Search + Filtry + Řazení */}
        {list.length > 0 && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-1 min-w-0 max-w-md">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" aria-hidden />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Hledat domácnost, jméno člena…"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                />
              </div>
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors shrink-0"
                title="Filtry (připraveno pro budoucí rozšíření)"
              >
                <Filter size={18} /> Filtry
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500 shrink-0">
              Řadit podle:{" "}
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Název ({sortOrder === "asc" ? "A–Z" : "Z–A"})
              </button>
            </div>
          </div>
        )}

        {/* List: empty vs filtered empty vs cards */}
        {list.length === 0 ? (
          <div className="bg-white rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm p-12">
            <EmptyState
              icon="🏠"
              title="Zatím žádné domácnosti"
              description="Vytvořte domácnost pro seskupení kontaktů."
              actionLabel="Vytvořit domácnost"
              onAction={() => setShowForm(true)}
            />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm p-12 text-center">
            <p className="text-slate-500 font-medium">Žádné domácnosti nevyhovují hledání.</p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-3 text-sm font-medium text-indigo-600 hover:underline"
            >
              Zrušit filtr
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredList.map((h) => {
              const isExpanded = expandedId === h.id;
              return (
                <div
                  key={h.id}
                  className={`bg-white rounded-[var(--wp-radius-sm)] border overflow-hidden transition-all duration-200 ${
                    isExpanded ? "border-indigo-200 shadow-md" : "border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300"
                  }`}
                >
                  {/* Card header: click to expand */}
                  <div
                    className="p-4 md:p-6 flex flex-col xl:flex-row xl:items-center gap-4 cursor-pointer"
                    onClick={() => toggleExpand(h.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(h.id); } }}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-[var(--wp-radius-sm)] bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <Home size={24} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-900 truncate">{h.name}</h2>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">
                          {h.members.length === 0 ? "Žádní členové" : `${h.members.length} ${h.members.length === 1 ? "člen" : h.members.length >= 2 && h.members.length <= 4 ? "členové" : "členů"}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between xl:justify-end gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {h.members.slice(0, 4).map((m, idx) => (
                            <div
                              key={m.id}
                              className={`w-9 h-9 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold shadow-sm ${m.role === "child" ? "bg-amber-100 text-amber-800" : "bg-slate-700 text-white"}`}
                              style={{ zIndex: 10 - idx }}
                              title={`${m.firstName} ${m.lastName}`}
                            >
                              {m.role === "child" ? <Baby size={14} /> : getInitials(m)}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/portal/households/${h.id}`}
                          className="px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 rounded-[var(--wp-radius-xs)] transition-colors"
                        >
                          Detail
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(e, h.id)}
                          disabled={pending}
                          className="px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-[var(--wp-radius-xs)] transition-colors disabled:opacity-50"
                        >
                          Smazat
                        </button>
                        <span
                          className={`p-2 rounded-[var(--wp-radius-xs)] transition-colors ${isExpanded ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-100"}`}
                          aria-hidden
                        >
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded: members + Přidat člena */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 md:p-6">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Členové domácnosti</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {h.members.map((m) => (
                          <div
                            key={m.id}
                            className="bg-white p-4 rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm flex items-center gap-4 hover:border-slate-300 transition-colors"
                          >
                            <div
                              className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                m.role === "child" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {m.role === "child" ? <Baby size={22} /> : getInitials(m)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 truncate">
                                {m.firstName} {m.lastName}
                              </p>
                              <p className="text-xs font-medium text-slate-500">
                                {m.role ? ROLE_LABELS[m.role] ?? m.role : "—"}
                              </p>
                            </div>
                          </div>
                        ))}
                        <Link
                          href={`/portal/households/${h.id}`}
                          className="border-2 border-dashed border-slate-200 rounded-[var(--wp-radius-sm)] flex flex-col items-center justify-center p-6 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all min-h-[100px]"
                        >
                          <Plus size={24} className="mb-2 shrink-0" />
                          <span className="text-xs font-bold uppercase tracking-wider">Přidat člena</span>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={deleteModalId !== null}
        title="Smazat domácnost?"
        message="Opravdu smazat tuto domácnost? Smaže se i všechny členství."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalId(null)}
        loading={pending}
      />
    </>
  );
}
