"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Download, Filter, Phone, Mail, CheckSquare, ArrowRight } from "lucide-react";
import { NewClientWizard } from "@/app/components/weplan/NewClientWizard";
import { useToast } from "@/app/components/Toast";
import { EmptyState } from "@/app/components/EmptyState";
import { SkeletonLine, SkeletonTableRow } from "@/app/components/Skeleton";
import { exportContactsCsv, updateContactsLifecycle, addTagToContacts, type ContactRow } from "@/app/actions/contacts";

const LIFECYCLE_TABS: { value: string; label: string }[] = [
  { value: "", label: "Všichni" },
  { value: "lead", label: "Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "client", label: "Klient" },
  { value: "former_client", label: "Bývalý klient" },
];

const LIFECYCLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Všechny fáze" },
  ...LIFECYCLE_TABS.filter((t) => t.value),
];

function getInitials(c: ContactRow): string {
  const f = (c.firstName ?? "").trim();
  const l = (c.lastName ?? "").trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (l) return l.slice(0, 2).toUpperCase();
  return "?";
}

function avatarColor(name: string): string {
  const colors = [
    "bg-indigo-100 text-indigo-700",
    "bg-emerald-100 text-emerald-700",
    "bg-slate-100 text-slate-700",
    "bg-rose-100 text-rose-700",
    "bg-amber-100 text-amber-700",
    "bg-blue-100 text-blue-700",
    "bg-purple-100 text-purple-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function lifecycleBadge(stage: string | null | undefined): { label: string; className: string } {
  switch (stage) {
    case "client":
      return { label: "Klient", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "lead":
      return { label: "Lead", className: "bg-slate-100 text-slate-600 border-slate-200" };
    case "prospect":
      return { label: "Prospect", className: "bg-blue-50 text-blue-700 border-blue-200" };
    case "former_client":
      return { label: "Bývalý klient", className: "bg-slate-100 text-slate-500 border-slate-200" };
    default:
      return { label: stage || "—", className: "bg-slate-100 text-slate-600 border-slate-200" };
  }
}

export function ContactsPageClient({ list }: { list: ContactRow[] }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLifecycle, setBulkLifecycle] = useState("");
  const [bulkTag, setBulkTag] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const tableLoadingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const router = useRouter();
  const toast = useToast();

  const triggerTableLoading = useCallback(() => {
    setTableLoading(true);
    if (tableLoadingTimerRef.current) clearTimeout(tableLoadingTimerRef.current);
    tableLoadingTimerRef.current = setTimeout(() => setTableLoading(false), 250);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredList.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredList.map((c) => c.id)));
  };
  async function handleBulkLifecycle() {
    if (!bulkLifecycle || selectedIds.size === 0) return;
    setBulkPending(true);
    try {
      await updateContactsLifecycle(Array.from(selectedIds), bulkLifecycle);
      toast.showToast("Fáze upravena");
      setSelectedIds(new Set());
      setBulkLifecycle("");
      router.refresh();
    } catch {
      toast.showToast("Změna se nezdařila", "error");
    } finally {
      setBulkPending(false);
    }
  }
  async function handleBulkAddTag() {
    if (!bulkTag.trim() || selectedIds.size === 0) return;
    setBulkPending(true);
    try {
      await addTagToContacts(Array.from(selectedIds), bulkTag.trim());
      toast.showToast("Štítek přidán");
      setSelectedIds(new Set());
      setBulkTag("");
      router.refresh();
    } catch {
      toast.showToast("Přidání štítku se nezdařilo", "error");
    } finally {
      setBulkPending(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const csv = await exportContactsCsv();
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kontakty-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.showToast("Export dokončen");
    } catch {
      toast.showToast("Export se nezdařil", "error");
    } finally {
      setExporting(false);
    }
  }

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of list) {
      if (c.tags) for (const t of c.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [list]);

  const filteredList = useMemo(() => {
    return list.filter((c) => {
      if (lifecycleFilter && (c.lifecycleStage ?? "") !== lifecycleFilter) return false;
      if (tagFilter && (!c.tags || !c.tags.includes(tagFilter))) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const email = (c.email ?? "").toLowerCase();
        const phone = (c.phone ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [list, lifecycleFilter, tagFilter, searchQuery]);

  const selectedContactsWithEmail = useMemo(() => {
    return filteredList.filter((c) => selectedIds.has(c.id) && c.email?.trim());
  }, [filteredList, selectedIds]);
  const bulkMailtoHref = useMemo(() => {
    if (selectedContactsWithEmail.length === 0) return undefined;
    return `mailto:${selectedContactsWithEmail.map((c) => c.email).filter(Boolean).join(",")}`;
  }, [selectedContactsWithEmail]);

  return (
    <>
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* --- Page header --- */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3 flex-wrap">
              Kontakty
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 text-sm font-semibold rounded-lg border border-slate-200">
                {filteredList.length === list.length ? `${list.length} celkem` : `${filteredList.length} / ${list.length}`}
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">Centrální adresář klientů a leadů.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting || list.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-[var(--wp-radius-sm)] text-xs font-bold uppercase tracking-wide shadow-sm hover:shadow-md hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              Exportovat CSV
            </button>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1c2e] text-white rounded-[var(--wp-radius-sm)] text-xs font-bold uppercase tracking-wide shadow-md hover:bg-[#2a2d4a] transition-all hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Plus size={16} />
              Nový klient
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white overflow-hidden">
            <EmptyState
              icon="👤"
              title="Zatím žádné kontakty"
              description="Přidejte prvního klienta a začněte spravovat vztahy."
              actionLabel="Přidat první kontakt"
              onAction={() => setWizardOpen(true)}
            />
          </div>
        ) : (
          <>
            {/* --- Filter panel: tabs + search + tags --- */}
            <div className="bg-white p-2 rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-1 overflow-x-auto px-2 min-w-0">
                {LIFECYCLE_TABS.map((tab) => (
                  <button
                    key={tab.value || "all"}
                    type="button"
                    onClick={() => { setLifecycleFilter(tab.value); triggerTableLoading(); }}
                    className={`px-4 py-2 rounded-[var(--wp-radius-xs)] text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
                      lifecycleFilter === tab.value ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto px-2 flex-shrink-0">
                <div className="relative flex-1 md:w-72 min-w-0">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Hledat jméno, e-mail, telefon…"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); triggerTableLoading(); }}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-[var(--wp-radius-sm)] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
                  />
                </div>
                <select
                  value={tagFilter}
                  onChange={(e) => { setTagFilter(e.target.value); triggerTableLoading(); }}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-[var(--wp-radius-sm)] text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Všechny štítky</option>
                  {uniqueTags.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* --- Bulk action bar --- */}
            {selectedIds.size > 0 && (
              <div className="bg-indigo-50 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border border-indigo-100 rounded-[var(--wp-radius-sm)]">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-indigo-800 bg-white px-2.5 py-0.5 rounded-md border border-indigo-100 shadow-sm">
                    {selectedIds.size}
                  </span>
                  <span className="text-sm font-bold text-indigo-800">vybraných kontaktů</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bulkLifecycle}
                    onChange={(e) => setBulkLifecycle(e.target.value)}
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-800 text-xs font-bold bg-white"
                  >
                    <option value="">— změnit fázi —</option>
                    {LIFECYCLE_OPTIONS.filter((o) => o.value).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleBulkLifecycle}
                    disabled={bulkPending || !bulkLifecycle}
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-white hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    Změnit fázi
                  </button>
                  <input
                    type="text"
                    placeholder="Přidat štítek"
                    value={bulkTag}
                    onChange={(e) => setBulkTag(e.target.value)}
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 w-28 text-xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleBulkAddTag}
                    disabled={bulkPending || !bulkTag.trim()}
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-white hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    Přidat štítek
                  </button>
                  {bulkMailtoHref && (
                    <a
                      href={bulkMailtoHref}
                      className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-white hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5"
                    >
                      Hromadný e-mail
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-white hover:bg-indigo-100 transition-colors"
                  >
                    Zrušit výběr
                  </button>
                </div>
              </div>
            )}

            {/* --- Table --- */}
            <div className="bg-white rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto relative">
                {tableLoading && (
                  <div className="absolute inset-0 z-10 bg-white/80 flex items-center justify-center pointer-events-none">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="w-12 px-4 py-3"><SkeletonLine className="h-4 w-4" /></th>
                          <th className="text-left px-4 py-3"><SkeletonLine className="h-4 w-24" /></th>
                          <th className="text-left px-4 py-3"><SkeletonLine className="h-4 w-32" /></th>
                          <th className="text-left px-4 py-3 hidden lg:table-cell"><SkeletonLine className="h-4 w-16" /></th>
                          <th className="text-left px-4 py-3 hidden xl:table-cell"><SkeletonLine className="h-4 w-20" /></th>
                          <th className="w-32 px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <SkeletonTableRow key={i} columns={6} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200">
                      <th className="px-4 md:px-6 py-4 w-12">
                        <input
                          type="checkbox"
                          checked={filteredList.length > 0 && selectedIds.size === filteredList.length}
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label="Vybrat všechny"
                        />
                      </th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Kontakt</th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Spojení</th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden lg:table-cell">Status</th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden xl:table-cell">Štítky</th>
                      <th className="px-4 md:px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((c) => {
                      const isSelected = selectedIds.has(c.id);
                      const initials = getInitials(c);
                      const colorClass = avatarColor(`${c.firstName} ${c.lastName}`);
                      const badge = lifecycleBadge(c.lifecycleStage);
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-slate-100 last:border-0 transition-colors group ${
                            isSelected ? "bg-indigo-50/50" : "hover:bg-slate-50/80"
                          }`}
                        >
                          <td className="px-4 md:px-6 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(c.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              aria-label={`Vybrat ${c.firstName} ${c.lastName}`}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border border-white shadow-sm shrink-0 ${colorClass}`}>
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/portal/contacts/${c.id}`}
                                  className="font-bold text-slate-900 text-[15px] hover:text-indigo-600 transition-colors block truncate"
                                >
                                  {c.firstName} {c.lastName}
                                </Link>
                                <div className="text-[11px] font-medium text-slate-400 lg:hidden mt-0.5">
                                  {badge.label}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1 text-[13px] font-medium text-slate-600">
                              {c.email ? (
                                <a href={`mailto:${c.email}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors w-fit truncate max-w-[220px]">
                                  <Mail size={14} className="text-slate-400 shrink-0" />
                                  <span className="truncate">{c.email}</span>
                                </a>
                              ) : (
                                <span className="flex items-center gap-2 text-slate-400">—</span>
                              )}
                              {c.phone ? (
                                <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors w-fit">
                                  <Phone size={14} className="text-slate-400 shrink-0" />
                                  {c.phone}
                                </a>
                              ) : (
                                <span className="flex items-center gap-2 text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 hidden lg:table-cell">
                            <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-4 hidden xl:table-cell">
                            {c.tags && c.tags.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {c.tags.slice(0, 2).map((t) => (
                                  <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] font-medium rounded border border-slate-200">
                                    {t}
                                  </span>
                                ))}
                                {c.tags.length > 2 && (
                                  <span className="text-[11px] text-slate-400">+{c.tags.length - 2}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 md:px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.phone && (
                                <a
                                  href={`tel:${c.phone.replace(/\s/g, "")}`}
                                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-[var(--wp-radius-sm)] transition-all"
                                  title="Zavolat"
                                  aria-label="Zavolat"
                                >
                                  <Phone size={16} />
                                </a>
                              )}
                              {c.email && (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-[var(--wp-radius-sm)] transition-all"
                                  title="Napsat e-mail"
                                  aria-label="Napsat e-mail"
                                >
                                  <Mail size={16} />
                                </a>
                              )}
                              <Link
                                href={`/portal/tasks?contactId=${c.id}`}
                                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-[var(--wp-radius-sm)] transition-all"
                                title="Přidat úkol"
                                aria-label="Přidat úkol"
                              >
                                <CheckSquare size={16} />
                              </Link>
                              <Link
                                href={`/portal/contacts/${c.id}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-[var(--wp-radius-sm)] hover:bg-slate-100 transition-all ml-1"
                              >
                                Detail <ArrowRight size={14} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Footer: Zobrazeno X kontaktů */}
              <div className="px-4 md:px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  Zobrazeno {filteredList.length} kontaktů
                  {(lifecycleFilter || tagFilter || searchQuery.trim()) && ` (z ${list.length} celkem)`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <NewClientWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => {
          toast.showToast("Kontakt vytvořen");
          router.push(`/portal/contacts/${id}`);
          router.refresh();
        }}
      />
    </>
  );
}
