"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Download, Upload, Phone, Mail, CheckSquare, ArrowRight, MessageSquare, Tags, UserCog, UserPlus, Trash2 } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { NewClientWizard } from "@/app/components/aidvisora/NewClientWizard";
import { useToast } from "@/app/components/Toast";
import {
  ListPageShell,
  ListPageHeader,
  ListPageToolbar,
  ListPageSearchInput,
  ListPageEmpty,
  ListPageNoResults,
} from "@/app/components/list-page";
import { SkeletonLine, SkeletonTableRow } from "@/app/components/Skeleton";
import {
  exportContactsCsv,
  getContactsList,
  updateContactsLifecycle,
  addTagToContacts,
  permanentlyDeleteContacts,
  type ContactRow,
} from "@/app/actions/contacts";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

const LIFECYCLE_TABS: { value: string; label: string }[] = [
  { value: "", label: "Všichni" },
  { value: "lead", label: "Úvodní kontakt" },
  { value: "prospect", label: "Zájemce" },
  { value: "client", label: "Klient" },
  { value: "former_client", label: "Bývalý klient" },
];

const LIFECYCLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Všechny fáze" },
  ...LIFECYCLE_TABS.filter((t) => t.value),
];

/** Desktop: zobrazit po částech, aby DOM nepřetížil tisíce řádků. */
const CONTACTS_VISIBLE_CHUNK = 150;

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
    "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]",
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
      return { label: "Úvodní kontakt", className: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]" };
    case "prospect":
      return { label: "Zájemce", className: "bg-blue-50 text-blue-700 border-blue-200" };
    case "former_client":
      return { label: "Bývalý klient", className: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]" };
    default:
      return { label: stage || "—", className: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]" };
  }
}

export function ContactsPageClient({
  initialList,
  canPermanentlyDelete = false,
}: {
  initialList: ContactRow[];
  canPermanentlyDelete?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: list = initialList } = useQuery({
    queryKey: queryKeys.contacts.list(),
    queryFn: () => getContactsList(),
    initialData: initialList,
    staleTime: 60_000,
  });
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
  const tableLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(CONTACTS_VISIBLE_CHUNK);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [permanentDeleteBusy, setPermanentDeleteBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (searchParams.get("newClient") === "1") {
      setWizardOpen(true);
      router.replace("/portal/contacts", { scroll: false });
    }
  }, [searchParams, router]);

  const triggerTableLoading = useCallback(() => {
    setTableLoading(true);
    if (tableLoadingTimerRef.current != null) { clearTimeout(tableLoadingTimerRef.current); tableLoadingTimerRef.current = null; }
    tableLoadingTimerRef.current = setTimeout(() => setTableLoading(false), 250);
  }, []);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of list) {
      if (c.tags) for (const t of c.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [list]);

  useEffect(() => {
    setVisibleLimit(CONTACTS_VISIBLE_CHUNK);
  }, [lifecycleFilter, tagFilter, searchQuery, list.length]);

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

  const displayedList = useMemo(
    () => filteredList.slice(0, visibleLimit),
    [filteredList, visibleLimit]
  );

  const selectedContactsWithEmail = useMemo(() => {
    return filteredList.filter((c) => selectedIds.has(c.id) && c.email?.trim());
  }, [filteredList, selectedIds]);
  const bulkMailtoHref = useMemo(() => {
    if (selectedContactsWithEmail.length === 0) return undefined;
    return `mailto:${selectedContactsWithEmail.map((c) => c.email).filter(Boolean).join(",")}`;
  }, [selectedContactsWithEmail]);

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
  const showLoadMore = filteredList.length > visibleLimit;
  async function handleBulkLifecycle() {
    if (!bulkLifecycle || selectedIds.size === 0) return;
    setBulkPending(true);
    try {
      await updateContactsLifecycle(Array.from(selectedIds), bulkLifecycle);
      toast.showToast("Fáze upravena");
      setSelectedIds(new Set());
      setBulkLifecycle("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list() });
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list() });
    } catch {
      toast.showToast("Přidání štítku se nezdařilo", "error");
    } finally {
      setBulkPending(false);
    }
  }

  async function handlePermanentDeleteConfirm() {
    if (selectedIds.size === 0) return;
    setPermanentDeleteBusy(true);
    try {
      await permanentlyDeleteContacts(Array.from(selectedIds));
      toast.showToast("Kontakty trvale odstraněny");
      setSelectedIds(new Set());
      setPermanentDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list() });
    } catch (e) {
      toast.showToast(e instanceof Error ? e.message : "Smazání se nezdařilo", "error");
    } finally {
      setPermanentDeleteBusy(false);
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

  const handleResetSearchAndFilters = () => {
    setSearchQuery("");
    setLifecycleFilter("");
    setTagFilter("");
  };

  const hasActiveFilters = Boolean(lifecycleFilter || tagFilter || searchQuery.trim());

  useEffect(() => {
    if (filteredList.length === 0) {
      setSelectedIds(new Set());
    }
  }, [filteredList.length]);

  return (
    <>
      <ListPageShell>
        <ListPageHeader
          title="Kontakty"
          count={filteredList.length}
          totalCount={list.length}
          subtitle="Centrální adresář — záložky podle fáze životního cyklu v záznamu kontaktu, dále štítky a vyhledávání."
          actions={
            <>
              <a
                href="#import"
                className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-[var(--wp-radius-sm)] text-xs font-bold uppercase tracking-wide shadow-sm hover:shadow-md hover:bg-[color:var(--wp-surface-muted)] transition-all min-h-[44px] md:min-h-0"
              >
                <Upload size={16} />
                <span className="hidden sm:inline">Import</span>
              </a>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exporting || list.length === 0}
                className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-[var(--wp-radius-sm)] text-xs font-bold uppercase tracking-wide shadow-sm hover:shadow-md hover:bg-[color:var(--wp-surface-muted)] transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] md:min-h-0"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Exportovat CSV</span>
              </button>
              <CreateActionButton type="button" onClick={() => setWizardOpen(true)} icon={UserPlus}>
                Nový klient
              </CreateActionButton>
            </>
          }
        />

        {list.length === 0 ? (
          <ListPageEmpty
            icon="👤"
            title="Zatím žádné kontakty"
            description="Přidejte prvního klienta a začněte spravovat vztahy."
            actionLabel="Přidat první kontakt"
            onAction={() => setWizardOpen(true)}
          />
        ) : (
          <>
            <ListPageToolbar
              leftSlot={
                <>
                  {LIFECYCLE_TABS.map((tab) => (
                    <button
                      key={tab.value || "all"}
                      type="button"
                      onClick={() => {
                        setLifecycleFilter(tab.value);
                        triggerTableLoading();
                      }}
                      className={`px-3 py-1.5 md:px-4 md:py-2 rounded-[var(--wp-radius-xs)] text-xs md:text-sm font-bold transition-all whitespace-nowrap shrink-0 min-h-[44px] md:min-h-0 flex items-center ${
                        lifecycleFilter === tab.value ? "bg-indigo-50 text-indigo-700" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </>
              }
            >
              <ListPageSearchInput
                placeholder="Hledat jméno, e-mail, telefon…"
                value={searchQuery}
                onChange={(v) => {
                  setSearchQuery(v);
                  triggerTableLoading();
                }}
              />
              <CustomDropdown
                value={tagFilter}
                onChange={(id) => {
                  setTagFilter(id);
                  triggerTableLoading();
                }}
                options={[{ id: "", label: "Všechny štítky" }, ...uniqueTags.map((t) => ({ id: t, label: t }))]}
                placeholder="Všechny štítky"
                icon={Tags}
              />
            </ListPageToolbar>

            {filteredList.length === 0 ? (
              <>
                <div className="md:hidden">
                  <ListPageNoResults onReset={handleResetSearchAndFilters} resetLabel="Zrušit vyhledávání a filtry" />
                </div>
                <div className="hidden md:block bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[color:var(--wp-surface-muted)]/80 border-b border-[color:var(--wp-surface-card-border)]">
                          <th className="px-4 md:px-6 py-4 w-12" aria-hidden />
                          <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Kontakt</th>
                          <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Spojení</th>
                          <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] hidden lg:table-cell">Stav</th>
                          <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] hidden xl:table-cell">Štítky</th>
                          <th className="px-4 md:px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] text-right">Akce</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={6} className="px-4 md:px-6 py-10 text-center align-middle">
                            <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
                              Žádné výsledky nevyhovují hledání nebo filtrům.
                            </p>
                            {hasActiveFilters ? (
                              <button
                                type="button"
                                onClick={handleResetSearchAndFilters}
                                className="mt-4 rounded-[var(--wp-radius-sm)] border border-indigo-300/60 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/15 dark:border-indigo-500/40 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                              >
                                Zrušit vyhledávání a filtry
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 px-4 md:px-6 py-3 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 items-center justify-between">
                    <span className="text-xs font-medium text-[color:var(--wp-text-secondary)]">
                      Zobrazeno 0 kontaktů (z {list.length} celkem)
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
            {/* --- Bulk action bar --- */}
            {selectedIds.size > 0 && (
              <div className="bg-indigo-50 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border border-indigo-100 rounded-[var(--wp-radius-sm)]">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-indigo-800 bg-[color:var(--wp-surface-card)] px-2.5 py-0.5 rounded-md border border-indigo-100 shadow-sm">
                    {selectedIds.size}
                  </span>
                  <span className="text-sm font-bold text-indigo-800">vybraných kontaktů</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CustomDropdown
                    value={bulkLifecycle}
                    onChange={setBulkLifecycle}
                    options={[{ id: "", label: "— změnit fázi —" }, ...LIFECYCLE_OPTIONS.filter((o) => o.value).map((o) => ({ id: o.value, label: o.label }))]}
                    placeholder="— změnit fázi —"
                    icon={UserCog}
                  />
                  <button
                    type="button"
                    onClick={handleBulkLifecycle}
                    disabled={bulkPending || !bulkLifecycle}
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-[color:var(--wp-surface-card)] hover:bg-indigo-100 transition-colors disabled:opacity-50"
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
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-[color:var(--wp-surface-card)] hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    Přidat štítek
                  </button>
                  {bulkMailtoHref && (
                    <a
                      href={bulkMailtoHref}
                      className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-[color:var(--wp-surface-card)] hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5"
                    >
                      Hromadný e-mail
                    </a>
                  )}
                  {canPermanentlyDelete && (
                    <button
                      type="button"
                      onClick={() => setPermanentDeleteOpen(true)}
                      disabled={bulkPending}
                      className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-red-200 text-red-700 text-xs font-bold bg-red-50 hover:bg-red-100 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 size={14} aria-hidden />
                      Trvale smazat
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 rounded-[var(--wp-radius-xs)] border border-indigo-200 text-indigo-700 text-xs font-bold bg-[color:var(--wp-surface-card)] hover:bg-indigo-100 transition-colors"
                  >
                    Zrušit výběr
                  </button>
                </div>
              </div>
            )}

            {/* --- Mobile: card list – kompaktní, CTA Detail primární --- */}
            <div className="md:hidden space-y-2">
              {tableLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] p-3 animate-pulse">
                      <div className="flex gap-2">
                        <SkeletonLine className="h-10 w-10 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                          <SkeletonLine className="h-4 w-32" />
                          <SkeletonLine className="h-3 w-48" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!tableLoading &&
                displayedList.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  const colorClass = avatarColor(`${c.firstName} ${c.lastName}`);
                  const badge = lifecycleBadge(c.lifecycleStage);
                  return (
                    <div
                      key={c.id}
                      className={`bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-sm)] border shadow-sm overflow-hidden ${
                        isSelected ? "border-indigo-300 ring-1 ring-indigo-200" : "border-[color:var(--wp-surface-card-border)]"
                      }`}
                    >
                      <div className="p-3 flex gap-2">
                        <div className="shrink-0 flex items-center self-start pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(c.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-[color:var(--wp-border-strong)] text-indigo-600 focus:ring-indigo-500 h-5 w-5"
                            aria-label={`Vybrat ${c.firstName} ${c.lastName}`}
                          />
                        </div>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border border-[color:var(--wp-surface-card)] shadow-sm ${colorClass}`}>
                          {getInitials(c)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/portal/contacts/${c.id}`}
                            className="font-bold text-[color:var(--wp-text)] text-[15px] hover:text-indigo-600 transition-colors block truncate"
                          >
                            {c.firstName} {c.lastName}
                          </Link>
                          <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${badge.className}`}>
                            {badge.label}
                          </span>
                          <div className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-[color:var(--wp-text-secondary)]">
                            {c.email && (
                              <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 truncate">
                                <Mail size={12} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                                <span className="truncate">{c.email}</span>
                              </a>
                            )}
                            {c.phone && (
                              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5">
                                <Phone size={12} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                                {c.phone}
                              </a>
                            )}
                          </div>
                          {c.tags && c.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {c.tags.slice(0, 3).map((t) => (
                                <span key={t} className="px-1.5 py-0.5 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] text-[10px] font-medium rounded border border-[color:var(--wp-surface-card-border)]">
                                  {t}
                                </span>
                              ))}
                              {c.tags.length > 3 && <span className="text-[10px] text-[color:var(--wp-text-tertiary)]">+{c.tags.length - 3}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="px-3 pb-3 pt-2 flex items-center justify-between gap-2 border-t border-[color:var(--wp-surface-card-border)]">
                        <div className="flex items-center gap-0.5">
                          {c.phone && (
                            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-[color:var(--wp-text-secondary)] hover:text-emerald-600 hover:bg-emerald-50 rounded-[var(--wp-radius-sm)]" aria-label="Zavolat">
                              <Phone size={18} />
                            </a>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-[color:var(--wp-text-secondary)] hover:text-blue-600 hover:bg-blue-50 rounded-[var(--wp-radius-sm)]" aria-label="E-mail">
                              <Mail size={18} />
                            </a>
                          )}
                          <Link href={`/portal/tasks?contactId=${c.id}`} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-[color:var(--wp-text-secondary)] hover:text-amber-600 hover:bg-amber-50 rounded-[var(--wp-radius-sm)]" aria-label="Přidat úkol">
                            <CheckSquare size={18} />
                          </Link>
                          <Link href={`/portal/messages?contact=${c.id}`} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-[color:var(--wp-text-secondary)] hover:text-indigo-600 hover:bg-indigo-50 rounded-[var(--wp-radius-sm)]" aria-label="Napsat zprávu">
                            <MessageSquare size={18} />
                          </Link>
                        </div>
                        <Link href={`/portal/contacts/${c.id}`} className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-[var(--wp-radius-sm)] hover:bg-indigo-700 shadow-sm">
                          Detail <ArrowRight size={16} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              {!tableLoading && (
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] px-2">
                  Zobrazeno {displayedList.length}
                  {filteredList.length !== displayedList.length ? ` z ${filteredList.length}` : ""} kontaktů
                  {(lifecycleFilter || tagFilter || searchQuery.trim()) && ` (z ${list.length} celkem)`}
                </p>
              )}
              {showLoadMore && !tableLoading && (
                <div className="px-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((n) => n + CONTACTS_VISIBLE_CHUNK)}
                    className="w-full min-h-[44px] rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                  >
                    Načíst další ({filteredList.length - displayedList.length} zbývá)
                  </button>
                </div>
              )}
            </div>

            {/* --- Desktop: table --- */}
            <div className="hidden md:block bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
              <div className="overflow-x-auto relative">
                {tableLoading && (
                  <div className="absolute inset-0 z-10 bg-[color:var(--wp-surface-card)]/80 flex items-center justify-center pointer-events-none">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
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
                    <tr className="bg-[color:var(--wp-surface-muted)]/80 border-b border-[color:var(--wp-surface-card-border)]">
                      <th className="px-4 md:px-6 py-4 w-12">
                        <input
                          type="checkbox"
                          checked={filteredList.length > 0 && selectedIds.size === filteredList.length}
                          onChange={toggleSelectAll}
                          className="rounded border-[color:var(--wp-border-strong)] text-indigo-600 focus:ring-indigo-500"
                          aria-label="Vybrat všechny"
                        />
                      </th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Kontakt</th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Spojení</th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] hidden lg:table-cell">Stav</th>
                      <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] hidden xl:table-cell">Štítky</th>
                      <th className="px-4 md:px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedList.map((c) => {
                      const isSelected = selectedIds.has(c.id);
                      const initials = getInitials(c);
                      const colorClass = avatarColor(`${c.firstName} ${c.lastName}`);
                      const badge = lifecycleBadge(c.lifecycleStage);
                      return (
                        <tr
                          key={c.id}
                          className={`border-b border-[color:var(--wp-surface-card-border)] last:border-0 transition-colors group ${
                            isSelected ? "bg-indigo-50/50" : "hover:bg-[color:var(--wp-surface-muted)]/80"
                          }`}
                        >
                          <td className="px-4 md:px-6 py-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(c.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-[color:var(--wp-border-strong)] text-indigo-600 focus:ring-indigo-500"
                              aria-label={`Vybrat ${c.firstName} ${c.lastName}`}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border border-[color:var(--wp-surface-card)] shadow-sm ${colorClass}`}>
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/portal/contacts/${c.id}`}
                                  className="font-bold text-[color:var(--wp-text)] text-[15px] hover:text-indigo-600 transition-colors block truncate"
                                >
                                  {c.firstName} {c.lastName}
                                </Link>
                                <div className="text-[11px] font-medium text-[color:var(--wp-text-tertiary)] lg:hidden mt-0.5">
                                  {badge.label}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1 text-[13px] font-medium text-[color:var(--wp-text-secondary)]">
                              {c.email ? (
                                <a href={`mailto:${c.email}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors w-fit truncate max-w-[220px]">
                                  <Mail size={14} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                                  <span className="truncate">{c.email}</span>
                                </a>
                              ) : (
                                <span className="flex items-center gap-2 text-[color:var(--wp-text-tertiary)]">—</span>
                              )}
                              {c.phone ? (
                                <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors w-fit">
                                  <Phone size={14} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                                  {c.phone}
                                </a>
                              ) : (
                                <span className="flex items-center gap-2 text-[color:var(--wp-text-tertiary)]">—</span>
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
                                  <span key={t} className="px-2 py-0.5 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] text-[11px] font-medium rounded border border-[color:var(--wp-surface-card-border)]">
                                    {t}
                                  </span>
                                ))}
                                {c.tags.length > 2 && (
                                  <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">+{c.tags.length - 2}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[color:var(--wp-text-tertiary)]">—</span>
                            )}
                          </td>
                          <td className="px-4 md:px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.phone && (
                                <a
                                  href={`tel:${c.phone.replace(/\s/g, "")}`}
                                  className="p-2 text-[color:var(--wp-text-tertiary)] hover:text-emerald-600 hover:bg-emerald-50 rounded-[var(--wp-radius-sm)] transition-all"
                                  title="Zavolat"
                                  aria-label="Zavolat"
                                >
                                  <Phone size={16} />
                                </a>
                              )}
                              {c.email && (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="p-2 text-[color:var(--wp-text-tertiary)] hover:text-blue-600 hover:bg-blue-50 rounded-[var(--wp-radius-sm)] transition-all"
                                  title="Napsat e-mail"
                                  aria-label="Napsat e-mail"
                                >
                                  <Mail size={16} />
                                </a>
                              )}
                              <Link
                                href={`/portal/tasks?contactId=${c.id}`}
                                className="p-2 text-[color:var(--wp-text-tertiary)] hover:text-amber-600 hover:bg-amber-50 rounded-[var(--wp-radius-sm)] transition-all"
                                title="Přidat úkol"
                                aria-label="Přidat úkol"
                              >
                                <CheckSquare size={16} />
                              </Link>
                              <Link
                                href={`/portal/messages?contact=${c.id}`}
                                className="p-2 text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 rounded-[var(--wp-radius-sm)] transition-all"
                                title="Napsat zprávu"
                                aria-label="Napsat zprávu"
                              >
                                <MessageSquare size={16} />
                              </Link>
                              <Link
                                href={`/portal/contacts/${c.id}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] text-xs font-bold rounded-[var(--wp-radius-sm)] hover:bg-[color:var(--wp-surface-muted)] transition-all ml-1"
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
              {/* Footer: Zobrazeno X kontaktů (desktop only) */}
              <div className="hidden md:flex flex-col sm:flex-row gap-2 px-4 md:px-6 py-3 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 items-center justify-between">
                <span className="text-xs font-medium text-[color:var(--wp-text-secondary)]">
                  Zobrazeno {displayedList.length}
                  {filteredList.length !== displayedList.length ? ` z ${filteredList.length}` : ""} kontaktů
                  {(lifecycleFilter || tagFilter || searchQuery.trim()) && ` (z ${list.length} celkem)`}
                </span>
                {showLoadMore && (
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((n) => n + CONTACTS_VISIBLE_CHUNK)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 min-h-[44px] px-3 rounded-[var(--wp-radius-sm)] border border-indigo-200 bg-[color:var(--wp-surface-card)]"
                  >
                    Načíst další ({filteredList.length - displayedList.length})
                  </button>
                )}
              </div>
            </div>
              </>
            )}
          </>
        )}
      </ListPageShell>

      {permanentDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="permanent-delete-title">
          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-[color:var(--wp-surface-card-border)]">
            <h3 id="permanent-delete-title" className="text-lg font-black text-[color:var(--wp-text)]">
              Trvale smazat kontakty?
            </h3>
            <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed">
              Chystáte se nenávratně odstranit <strong>{selectedIds.size}</strong> kontakt
              {selectedIds.size === 1 ? "" : "ů"} včetně navázaných záznamů, které databáze propojuje s kontaktem (např. smlouvy, dokumenty, zprávy podle nastavení mazání).
              Tuto akci nelze vrátit zpět.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPermanentDeleteOpen(false)}
                disabled={permanentDeleteBusy}
                className="rounded-xl px-4 py-2.5 text-sm font-bold border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handlePermanentDeleteConfirm}
                disabled={permanentDeleteBusy}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
              >
                {permanentDeleteBusy ? "Mažu…" : "Ano, trvale smazat"}
              </button>
            </div>
          </div>
        </div>
      )}

      <NewClientWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={async (id) => {
          toast.showToast("Kontakt vytvořen");
          await queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list() });
          router.push(`/portal/contacts/${id}`);
        }}
      />
    </>
  );
}
