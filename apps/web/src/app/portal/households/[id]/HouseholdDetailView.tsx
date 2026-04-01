"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import {
  updateHousehold,
  deleteHousehold,
  addHouseholdMember,
  removeHouseholdMember,
} from "@/app/actions/households";
import type { HouseholdDetail } from "@/app/actions/households";
import type { OpportunityByHouseholdRow } from "@/app/actions/pipeline";
import { getFinancialAnalysesForHousehold } from "@/app/actions/financial-analyses";
import { createContact } from "@/app/actions/contacts";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import { ConfirmDeleteModal } from "@/app/components/ConfirmDeleteModal";
import { HouseholdIconDisplay, HouseholdIconPicker } from "./HouseholdIconPicker";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import clsx from "clsx";
import { User, UserCog, Share2, MapPin, Activity, Baby, Mail, Phone, Target, Briefcase, Plus, Trash2, ChevronRight } from "lucide-react";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import { useConfirm } from "@/app/components/ConfirmDialog";

type ContactOption = { id: string; firstName: string; lastName: string };

type HouseholdDetailViewProps = {
  household: HouseholdDetail;
  contacts: ContactOption[];
  opportunities: OpportunityByHouseholdRow[];
};

const ROLES = [
  { value: "primary", label: "Hlavní" },
  { value: "member", label: "Člen" },
  { value: "child", label: "Dítě" },
];

function roleLabel(role: string | null): string {
  if (!role) return "—";
  const r = ROLES.find((x) => x.value === role);
  return r?.label ?? role;
}

function initials(firstName: string | null, lastName: string | null): string {
  const a = (firstName ?? "").trim().slice(0, 1);
  const b = (lastName ?? "").trim().slice(0, 1);
  if (a || b) return (a + b).toUpperCase();
  return "?";
}

function isChildMember(member: { role: string | null; birthDate?: string | null }): boolean {
  if (member.role === "child") return true;
  if (!member.birthDate) return false;
  const birthDate = new Date(member.birthDate);
  if (Number.isNaN(birthDate.getTime())) return false;
  const ageMs = Date.now() - birthDate.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18;
}

export function HouseholdDetailView({ household, contacts, opportunities }: HouseholdDetailViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const refreshHouseholdAndCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.households.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    router.refresh();
  }, [queryClient, router]);

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(household.name);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const [addingMember, setAddingMember] = useState(false);
  const [memberContactId, setMemberContactId] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [addMode, setAddMode] = useState<"select" | "new">("select");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [analysesList, setAnalysesList] = useState<FinancialAnalysisListItem[]>([]);
  const [analysesLoading, setAnalysesLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getFinancialAnalysesForHousehold(household.id)
      .then((rows) => { if (!cancelled) setAnalysesList(rows); })
      .finally(() => { if (!cancelled) setAnalysesLoading(false); });
    return () => { cancelled = true; };
  }, [household.id]);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    startTransition(async () => {
      await updateHousehold(household.id, newName, household.icon);
      setRenaming(false);
      refreshHouseholdAndCaches();
    });
  }

  function handleIconChange(iconId: string | null) {
    startTransition(async () => {
      await updateHousehold(household.id, household.name, iconId);
      setIconPickerOpen(false);
      refreshHouseholdAndCaches();
    });
  }

  function handleDeleteHousehold() {
    setDeleteModalOpen(true);
  }

  function handleConfirmDelete() {
    startTransition(async () => {
      await deleteHousehold(household.id);
      setDeleteModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.households.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
      router.push("/portal/households");
      router.refresh();
    });
  }

  function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (addMode === "select" && !memberContactId) return;
    if (addMode === "new" && (!newFirstName.trim() || !newLastName.trim())) return;
    startTransition(async () => {
      let contactId = memberContactId;
      if (addMode === "new") {
        const created = await createContact({ firstName: newFirstName.trim(), lastName: newLastName.trim() });
        if (!created.ok) throw new Error(created.message);
        contactId = created.id;
      }
      await addHouseholdMember(household.id, contactId, memberRole);
      setMemberContactId("");
      setMemberRole("member");
      setNewFirstName("");
      setNewLastName("");
      setAddMode("select");
      setAddingMember(false);
      refreshHouseholdAndCaches();
    });
  }

  function handleRemoveMember(memberId: string) {
    void (async () => {
      if (
        !(await confirm({
          title: "Odebrat člena",
          message: "Opravdu chcete odebrat tohoto člena z domácnosti?",
          confirmLabel: "Odebrat",
          variant: "destructive",
        }))
      ) {
        return;
      }
      startTransition(async () => {
        await removeHouseholdMember(memberId);
        refreshHouseholdAndCaches();
      });
    })();
  }

  const existingContactIds = new Set(household.members.map((m) => m.contactId));
  const availableContacts = contacts.filter((c) => !existingContactIds.has(c.id));

  return (
    <>
      <div className="min-h-screen bg-[color:var(--wp-surface-muted)] pb-24">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-[color:var(--wp-surface-card)]/90 backdrop-blur-sm border-b border-[color:var(--wp-surface-card-border)] px-4 sm:px-6 md:px-8 py-3 md:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <Link
              href="/portal/households"
              className="flex items-center gap-2 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:text-indigo-600 transition-colors shrink-0 min-h-[44px] items-center md:min-h-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span className="hidden sm:inline">Zpět na domácnosti</span>
            </Link>
            <span className="w-px h-5 bg-[color:var(--wp-surface-card-border)] shrink-0 hidden sm:block" aria-hidden />
            <nav className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] min-w-0 truncate" aria-label="Breadcrumb">
              <Link href="/portal" className="hover:text-[color:var(--wp-text-secondary)] truncate hidden md:inline">Databáze</Link>
              <span aria-hidden className="opacity-50 hidden md:inline">/</span>
              <Link href="/portal/households" className="hover:text-[color:var(--wp-text-secondary)] truncate">Domácnosti</Link>
              <span aria-hidden className="opacity-50">/</span>
              <span className="text-[color:var(--wp-text)] normal-case tracking-normal truncate">{household.name}</span>
            </nav>
          </div>
          {!isMobile && (
            <Link
              href={`/portal/mindmap?householdId=${household.id}`}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-bold uppercase tracking-wide shadow-lg shadow-indigo-900/20 hover:opacity-95 transition-opacity min-h-[44px] shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Strategická mapa
            </Link>
          )}
          {isMobile && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setHeaderMenuOpen((o) => !o)}
                className="min-w-[44px] min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] flex items-center justify-center text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                aria-label="Menu"
              >
                <span className="text-lg font-bold">⋯</span>
              </button>
              {headerMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setHeaderMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full mt-1 py-2 min-w-[220px] bg-[color:var(--wp-surface-card)] rounded-xl shadow-xl border border-[color:var(--wp-surface-card-border)] z-50">
                    <Link
                      href={`/portal/mindmap?householdId=${household.id}`}
                      onClick={() => setHeaderMenuOpen(false)}
                      className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-semibold text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      Strategická mapa
                    </Link>
                    <button
                      type="button"
                      onClick={() => { setHeaderMenuOpen(false); handleDeleteHousehold(); }}
                      disabled={pending}
                      className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-bold text-rose-600 hover:bg-rose-50 min-h-[44px] disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Smazat domácnost
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
          <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] p-6 md:p-8 border border-[color:var(--wp-surface-card-border)] shadow-sm">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
              <div className="flex items-center gap-6 min-w-0">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setIconPickerOpen((o) => !o)}
                    disabled={pending}
                    className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-[color:var(--wp-border-strong)] bg-gradient-to-br from-[color:var(--wp-surface-muted)] to-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-tertiary)] shadow-inner transition-colors hover:text-indigo-600 disabled:opacity-50"
                    aria-label="Změnit ikonu domácnosti"
                  >
                    {household.icon ? <HouseholdIconDisplay iconId={household.icon} /> : <Share2 size={30} />}
                  </button>
                </div>
                <div className="min-w-0">
                  {renaming ? (
                    <form onSubmit={handleRename} className="flex flex-wrap items-center gap-2">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 font-semibold text-base md:text-lg max-w-full w-full sm:w-auto min-w-[180px] md:min-w-[220px]"
                        autoFocus
                        required
                      />
                      <button type="submit" disabled={pending} className={clsx(portalPrimaryButtonClassName, "px-4 py-2 font-semibold disabled:opacity-50")}>
                        {pending ? "…" : "Uložit"}
                      </button>
                      <button type="button" onClick={() => { setRenaming(false); setNewName(household.name); }} className="rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]">
                        Zrušit
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h1 className="text-2xl md:text-3xl font-black text-[color:var(--wp-text)] tracking-tight truncate">{household.name}</h1>
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-md border border-amber-200">Domácnost</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-[color:var(--wp-text-secondary)]">
                        <span className="flex items-center gap-1.5"><MapPin size={14} /> Detail domácnosti</span>
                        <span className="h-1 w-1 rounded-full bg-[color:var(--wp-text-tertiary)]" />
                        <span>
                          {household.members.length} {household.members.length === 1 ? "člen" : household.members.length >= 2 && household.members.length <= 4 ? "členové" : "členů"}
                        </span>
                      </div>
                      <button type="button" onClick={() => setRenaming(true)} className="text-sm font-medium mt-2 text-indigo-600 hover:underline min-h-[44px] md:min-h-0 flex items-center">
                        Přejmenovat
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Link
                  href={`/portal/mindmap?householdId=${household.id}`}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:scale-[1.02] transition-all active:scale-95 min-h-[44px]"
                >
                  Strategická mapa
                </Link>
                <div className="flex items-center gap-8 bg-[color:var(--wp-surface-muted)] p-4 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
                  <div>
                    <span className="block text-[10px] font-black text-[color:var(--wp-text-tertiary)] uppercase tracking-widest mb-1">Společný majetek (AUM)</span>
                    <span className="text-2xl font-black text-indigo-600">—</span>
                  </div>
                  <div className="w-px h-10 bg-[color:var(--wp-surface-card-border)]" />
                  <div>
                    <span className="block text-[10px] font-black text-[color:var(--wp-text-tertiary)] uppercase tracking-widest mb-1 flex items-center gap-1">
                      Health Score <Activity size={10} />
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-black text-emerald-500">—</span>
                      <div className="w-16 h-1.5 bg-[color:var(--wp-surface-card-border)] rounded-full overflow-hidden" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {iconPickerOpen && (
              <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
                <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mb-2">Ikona domácnosti</p>
                <HouseholdIconPicker value={household.icon} onChange={(id) => handleIconChange(id)} disabled={pending} />
              </div>
            )}
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-8">
            {/* Left column: Members + Documents */}
            <div className="xl:col-span-2 space-y-6 min-w-0">
              {/* Members */}
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6 border-b border-[color:var(--wp-surface-card-border)]">
                  <h2 className="text-xl font-black text-[color:var(--wp-text)]">Členové domácnosti</h2>
                  {!addingMember && (
                    <button
                      type="button"
                      onClick={() => setAddingMember(true)}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 px-3 py-2 rounded-lg min-h-[44px]"
                    >
                      <Plus size={16} />
                      Přidat člena
                    </button>
                  )}
                </div>

                {addingMember && (
                  <form onSubmit={handleAddMember} className="p-4 sm:p-6 bg-[color:var(--wp-surface-muted)] border-b border-[color:var(--wp-surface-card-border)] space-y-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setAddMode("select")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] ${addMode === "select" ? "bg-indigo-600 text-white" : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] border border-[color:var(--wp-surface-card-border)]"}`}>
                        Vybrat existující
                      </button>
                      <button type="button" onClick={() => setAddMode("new")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[36px] ${addMode === "new" ? "bg-indigo-600 text-white" : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] border border-[color:var(--wp-surface-card-border)]"}`}>
                        Vytvořit nový kontakt
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {addMode === "select" ? (
                        <CustomDropdown
                          value={memberContactId}
                          onChange={setMemberContactId}
                          options={[{ id: "", label: "Vyberte kontakt…" }, ...availableContacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))]}
                          placeholder="Vyberte kontakt…"
                          icon={User}
                        />
                      ) : (
                        <>
                          <input
                            type="text"
                            placeholder="Jméno"
                            value={newFirstName}
                            onChange={(e) => setNewFirstName(e.target.value)}
                            className="rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2.5 text-sm flex-1 min-w-[120px] min-h-[44px]"
                            required
                          />
                          <input
                            type="text"
                            placeholder="Příjmení"
                            value={newLastName}
                            onChange={(e) => setNewLastName(e.target.value)}
                            className="rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2.5 text-sm flex-1 min-w-[120px] min-h-[44px]"
                            required
                          />
                        </>
                      )}
                      <CustomDropdown
                        value={memberRole}
                        onChange={setMemberRole}
                        options={ROLES.map((r) => ({ id: r.value, label: r.label }))}
                        placeholder="Role"
                        icon={UserCog}
                      />
                      <button type="submit" disabled={pending} className={clsx(portalPrimaryButtonClassName, "px-4 py-2.5 font-semibold disabled:opacity-50")}>
                        {pending ? "…" : "Přidat"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddingMember(false); setMemberContactId(""); setNewFirstName(""); setNewLastName(""); setAddMode("select"); }}
                        className="rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
                      >
                        Zrušit
                      </button>
                    </div>
                  </form>
                )}

                <div className="p-4 sm:p-6">
                  {household.members.length === 0 && !addingMember ? (
                    <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádní členové.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {household.members.map((m) => (
                        <div key={m.id} className="bg-[color:var(--wp-surface-card)] p-5 rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col group">
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm border-2 border-white shadow-sm shrink-0 ${
                                  isChildMember({ role: m.role, birthDate: (m as { birthDate?: string | null }).birthDate })
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-[#1e293b] text-white"
                                }`}
                                aria-hidden
                              >
                                {isChildMember({ role: m.role, birthDate: (m as { birthDate?: string | null }).birthDate }) ? (
                                  <Baby size={20} />
                                ) : (
                                  initials(m.firstName, m.lastName)
                                )}
                              </div>
                              <div className="min-w-0">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest mb-1 ${
                                    m.role === "primary"
                                      ? "bg-indigo-50 text-indigo-700"
                                      : m.role === "child"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                                  }`}
                                >
                                  {roleLabel(m.role)}
                                </span>
                                <h3 className="font-bold text-lg text-[color:var(--wp-text)] leading-none truncate">{m.firstName} {m.lastName}</h3>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.id)}
                              disabled={pending}
                              className="text-[color:var(--wp-text-tertiary)] hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-2 rounded-lg disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title="Odebrat z domácnosti"
                              aria-label="Odebrat z domácnosti"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="space-y-1.5 mb-5">
                            {m.email && (
                              <div className="flex items-center gap-2 text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">
                                <Mail size={14} className="text-[color:var(--wp-text-tertiary)] shrink-0" aria-hidden />
                                <span className="truncate">{m.email}</span>
                              </div>
                            )}
                            {m.phone && (
                              <div className="flex items-center gap-2 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                                <Phone size={14} className="text-[color:var(--wp-text-tertiary)] shrink-0" aria-hidden />
                                <span>{m.phone}</span>
                              </div>
                            )}
                            {!m.email && !m.phone && <span className="text-xs font-bold text-[color:var(--wp-text-tertiary)]">—</span>}
                          </div>
                          <div className="mt-auto pt-4 border-t border-[color:var(--wp-surface-card-border)] flex items-center justify-between gap-2">
                            <div>
                              <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">Osobní AUM</span>
                              <span className="text-sm font-black text-[color:var(--wp-text)]">—</span>
                            </div>
                            <Link
                              href={`/portal/contacts/${m.contactId}`}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[color:var(--wp-surface-muted)] hover:bg-indigo-50 text-[color:var(--wp-text-secondary)] hover:text-indigo-700 text-xs font-black uppercase tracking-widest rounded-xl transition-colors border border-[color:var(--wp-surface-card-border)] hover:border-indigo-200 min-h-[44px]"
                            >
                              Profil 360°
                              <ChevronRight size={14} />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Rodinné dokumenty a poznámky */}
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[color:var(--wp-text-secondary)] px-4 sm:px-6 py-4 border-b border-[color:var(--wp-surface-card-border)]">
                  Rodinné dokumenty a poznámky
                </h3>
                <div className="p-4 sm:p-6">
                  <div className="border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)]/50 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-2 text-[color:var(--wp-text-tertiary)]" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <p className="text-sm font-semibold">Společné dokumenty – připravujeme</p>
                    <p className="text-xs mt-1">SJM, oddací listy, společná daňová přiznání…</p>
                  </div>
                  <p className="text-sm text-[color:var(--wp-text-secondary)] mb-3">Zápisky a dokumenty najdete u profilů členů.</p>
                  {household.members.length > 0 && (
                    <ul className="space-y-2">
                      {household.members.slice(0, 5).map((m) => (
                        <li key={m.id}>
                          <Link href={`/portal/contacts/${m.contactId}`} className="text-sm font-medium text-indigo-600 hover:underline">
                            Dokumenty {m.firstName} {m.lastName} →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: Goals, Opportunities, Financial, Delete */}
            <div className="xl:col-span-1 space-y-6">
              {/* Společné cíle – empty state */}
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[color:var(--wp-surface-card-border)]/50 flex items-center justify-between bg-[color:var(--wp-surface-muted)]/50">
                  <h3 className="font-bold text-[color:var(--wp-text)] flex items-center gap-2">
                    <Target size={18} className="text-amber-500" />
                    Společné cíle
                  </h3>
                  <button type="button" className="w-8 h-8 rounded-lg bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] flex items-center justify-center text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 transition-colors shadow-sm min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0">
                    <Plus size={16} />
                  </button>
                </div>
                <div className="p-6">
                  <p className="text-sm text-[color:var(--wp-text-secondary)] mb-2">Žádné cíle.</p>
                  <p className="text-xs text-[color:var(--wp-text-tertiary)]">Cíle domácnosti budou dostupné v budoucí verzi.</p>
                </div>
              </div>

              {/* Aktuální obchody */}
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[color:var(--wp-surface-card-border)]/50 flex items-center justify-between bg-[color:var(--wp-surface-muted)]/50">
                  <h3 className="font-bold text-[color:var(--wp-text)] flex items-center gap-2">
                    <Briefcase size={18} className="text-indigo-500" />
                    Aktuální obchody
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {opportunities.length === 0 ? (
                    <>
                      <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné otevřené obchody.</p>
                      <Link href="/portal/pipeline" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
                        Obchody
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </Link>
                    </>
                  ) : (
                    <>
                      {opportunities.map((o) => (
                        <Link
                          key={o.id}
                          href={`/portal/pipeline/${o.id}`}
                          className="block p-4 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card)] hover:shadow-sm hover:border-indigo-100 transition-all group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {o.stageName ?? "—"}
                            </span>
                            <div className="flex -space-x-2">
                              {((o.contactName ?? "??")
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase())
                                .join("") || "??")
                                .split("")
                                .map((initialChar, idx) => (
                                  <div
                                  key={`${o.id}-${idx}`}
                                  className="flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--wp-surface-card)] bg-[#1e293b] text-[8px] font-black text-white"
                                >
                                    {initialChar}
                                  </div>
                                ))}
                            </div>
                          </div>
                          <h4 className="font-bold text-sm text-[color:var(--wp-text)] group-hover:text-indigo-600 transition-colors">{o.title}</h4>
                          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">{o.contactName}</p>
                        </Link>
                      ))}
                      <Link
                        href="/portal/pipeline"
                        className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline mt-2"
                      >
                        Všechny obchody
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </Link>
                    </>
                  )}
                  <Link
                    href="/portal/pipeline"
                    className="flex items-center justify-center gap-2 w-full py-3 mt-2 border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-xl text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors min-h-[44px]"
                  >
                    <Plus size={14} />
                    Nový obchod pro rodinu
                  </Link>
                </div>
              </div>

              {/* Finanční analýzy */}
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[color:var(--wp-surface-card-border)]">
                  <h3 className="font-bold text-[color:var(--wp-text)]">Finanční analýzy</h3>
                  <Link
                    href={`/portal/analyses/financial?householdId=${household.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500 text-white px-4 py-2.5 text-sm font-semibold hover:bg-amber-600 transition-colors min-h-[44px]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nová analýza
                  </Link>
                </div>
                <div className="p-4 sm:p-6">
                  {analysesLoading ? (
                    <p className="text-sm text-[color:var(--wp-text-secondary)]">Načítám…</p>
                  ) : analysesList.length === 0 ? (
                    <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné analýzy. Vytvořte novou.</p>
                  ) : (
                    <ul className="space-y-2">
                      {analysesList.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 py-2 border-b border-[color:var(--wp-surface-card-border)]/50 last:border-0">
                          <span className="text-sm text-[color:var(--wp-text-secondary)]">
                            {a.status === "draft" ? "Rozpracováno" : a.status === "completed" ? "Dokončeno" : a.status === "exported" ? "Exportováno" : a.status}
                          </span>
                          <span className="text-xs text-[color:var(--wp-text-tertiary)]">{new Date(a.updatedAt).toLocaleDateString("cs-CZ")}</span>
                          <Link href={`/portal/analyses/financial?id=${a.id}`} className="text-sm font-semibold text-amber-600 hover:underline min-h-[44px] flex items-center">
                            Otevřít
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Desktop mazání řeší fixed floating tlačítko dole vlevo */}
            </div>
          </div>
        </main>

        {!isMobile && (
          <div className="fixed bottom-8 left-8 hidden xl:flex gap-3 z-50">
            <button
              type="button"
              onClick={handleDeleteHousehold}
              disabled={pending}
              className="px-6 py-3 bg-[color:var(--wp-surface-card)] text-rose-600 border border-rose-100 rounded-2xl shadow-lg shadow-rose-900/5 font-black text-xs uppercase tracking-widest hover:bg-rose-50 transition-all flex items-center gap-2 min-h-[44px] disabled:opacity-50"
            >
              <Trash2 size={16} />
              Smazat domácnost
            </button>
          </div>
        )}

      </div>

      <ConfirmDeleteModal
        open={deleteModalOpen}
        title="Smazat domácnost?"
        message="Opravdu smazat celou domácnost? Smaže se i všechna členství."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalOpen(false)}
        loading={pending}
      />
    </>
  );
}
