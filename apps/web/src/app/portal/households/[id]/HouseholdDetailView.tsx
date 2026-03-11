"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updateHousehold,
  deleteHousehold,
  addHouseholdMember,
  removeHouseholdMember,
} from "@/app/actions/households";
import type { HouseholdDetail } from "@/app/actions/households";
import type { OpportunityByHouseholdRow } from "@/app/actions/pipeline";
import { ConfirmDeleteModal } from "@/app/components/ConfirmDeleteModal";
import { HouseholdIconDisplay, HouseholdIconPicker } from "./HouseholdIconPicker";

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

export function HouseholdDetailView({ household, contacts, opportunities }: HouseholdDetailViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(household.name);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const [addingMember, setAddingMember] = useState(false);
  const [memberContactId, setMemberContactId] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
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
      router.refresh();
    });
  }

  function handleIconChange(iconId: string | null) {
    startTransition(async () => {
      await updateHousehold(household.id, household.name, iconId);
      setIconPickerOpen(false);
      router.refresh();
    });
  }

  function handleDeleteHousehold() {
    setDeleteModalOpen(true);
  }

  function handleConfirmDelete() {
    startTransition(async () => {
      await deleteHousehold(household.id);
      setDeleteModalOpen(false);
      router.push("/portal/households");
      router.refresh();
    });
  }

  function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!memberContactId) return;
    startTransition(async () => {
      await addHouseholdMember(household.id, memberContactId, memberRole);
      setMemberContactId("");
      setMemberRole("member");
      setAddingMember(false);
      router.refresh();
    });
  }

  function handleRemoveMember(memberId: string) {
    if (!confirm("Opravdu odebrat tohoto člena z domácnosti?")) return;
    startTransition(async () => {
      await removeHouseholdMember(memberId);
      router.refresh();
    });
  }

  const existingContactIds = new Set(household.members.map((m) => m.contactId));
  const availableContacts = contacts.filter((c) => !existingContactIds.has(c.id));

  return (
    <>
      <div className="min-h-screen bg-slate-100 pb-24">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 md:px-8 py-3 md:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <Link
              href="/portal/households"
              className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors shrink-0 min-h-[44px] items-center md:min-h-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span className="hidden sm:inline">Zpět na domácnosti</span>
            </Link>
            <span className="w-px h-5 bg-slate-200 shrink-0 hidden sm:block" aria-hidden />
            <nav className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 min-w-0 truncate" aria-label="Breadcrumb">
              <Link href="/portal" className="hover:text-slate-600 truncate hidden md:inline">Databáze</Link>
              <span aria-hidden className="opacity-50 hidden md:inline">/</span>
              <Link href="/portal/households" className="hover:text-slate-600 truncate">Domácnosti</Link>
              <span aria-hidden className="opacity-50">/</span>
              <span className="text-slate-800 normal-case tracking-normal truncate">{household.name}</span>
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
                className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                aria-label="Menu"
              >
                <span className="text-lg font-bold">⋯</span>
              </button>
              {headerMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setHeaderMenuOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full mt-1 py-2 min-w-[220px] bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                    <Link
                      href={`/portal/mindmap?householdId=${household.id}`}
                      onClick={() => setHeaderMenuOpen(false)}
                      className="flex items-center gap-2 w-full text-left px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 min-h-[44px]"
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
          {/* Hero card: compact on mobile */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 md:p-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 md:gap-6">
                <div className="flex flex-col sm:flex-row items-start gap-3 md:gap-6 min-w-0">
                  <div className="relative shrink-0">
                    <HouseholdIconDisplay iconId={household.icon} />
                    <button
                      type="button"
                      onClick={() => setIconPickerOpen((o) => !o)}
                      disabled={pending}
                      className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-600 hover:bg-slate-300 text-xs disabled:opacity-50 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                      aria-label="Změnit ikonu"
                    >
                      &#9998;
                    </button>
                  </div>
                  <div className="min-w-0">
                    {renaming ? (
                      <form onSubmit={handleRename} className="flex flex-wrap items-center gap-2">
                        <input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-base md:text-lg max-w-full w-full sm:w-auto min-w-[160px] md:min-w-[200px]"
                          autoFocus
                          required
                        />
                        <button type="submit" disabled={pending} className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 min-h-[44px]">
                          {pending ? "…" : "Uložit"}
                        </button>
                        <button type="button" onClick={() => { setRenaming(false); setNewName(household.name); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]">
                          Zrušit
                        </button>
                      </form>
                    ) : (
                      <>
                        <h1 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight truncate">{household.name}</h1>
                        <p className="text-sm text-slate-500 mt-1">
                          {household.members.length} {household.members.length === 1 ? "člen" : household.members.length >= 2 && household.members.length <= 4 ? "členové" : "členů"}
                        </p>
                        <button type="button" onClick={() => setRenaming(true)} className="text-sm font-medium mt-2 text-indigo-600 hover:underline min-h-[44px] md:min-h-0 flex items-center">
                          Přejmenovat
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center shrink-0">
                  <Link
                    href={`/portal/analyses?householdId=${household.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors min-h-[44px]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    <span className="hidden sm:inline">Přehled finančních analýz</span>
                    <span className="sm:hidden">Analýzy</span>
                  </Link>
                </div>
              </div>

              {iconPickerOpen && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <p className="text-sm font-medium text-slate-700 mb-2">Ikona domácnosti</p>
                  <HouseholdIconPicker value={household.icon} onChange={(id) => handleIconChange(id)} disabled={pending} />
                </div>
              )}
            </div>
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 xl:gap-8">
            {/* Left column: Members + Documents */}
            <div className="xl:col-span-2 space-y-6 min-w-0">
              {/* Members */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900">Členové domácnosti</h2>
                  {!addingMember && (
                    <button
                      type="button"
                      onClick={() => setAddingMember(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-colors min-h-[44px]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Přidat člena
                    </button>
                  )}
                </div>

                {addingMember && (
                  <form onSubmit={handleAddMember} className="flex flex-wrap items-center gap-2 p-4 sm:p-6 bg-slate-50 border-b border-slate-100">
                    <select
                      value={memberContactId}
                      onChange={(e) => setMemberContactId(e.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm flex-1 min-w-[160px] min-h-[44px]"
                      required
                    >
                      <option value="">Vyberte kontakt…</option>
                      {availableContacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                      ))}
                    </select>
                    <select
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-auto min-h-[44px]"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={pending} className="rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 min-h-[44px]">
                      {pending ? "…" : "Přidat"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingMember(false); setMemberContactId(""); }}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 min-h-[44px]"
                    >
                      Zrušit
                    </button>
                  </form>
                )}

                <div className="p-4 sm:p-6">
                  {household.members.length === 0 && !addingMember ? (
                    <p className="text-sm text-slate-500">Žádní členové.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {household.members.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col"
                        >
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center text-sm font-bold shrink-0" aria-hidden>
                                {initials(m.firstName, m.lastName)}
                              </div>
                              <div className="min-w-0">
                                <span className="inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 mb-1">
                                  {roleLabel(m.role)}
                                </span>
                                <h3 className="font-bold text-slate-900 truncate">{m.firstName} {m.lastName}</h3>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.id)}
                              disabled={pending}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              title="Odebrat z domácnosti"
                              aria-label="Odebrat z domácnosti"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                          <div className="space-y-1.5 mb-4 text-sm text-slate-600">
                            {m.email && (
                              <div className="flex items-center gap-2 truncate">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0" aria-hidden><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                <span className="truncate">{m.email}</span>
                              </div>
                            )}
                            {m.phone && (
                              <div className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0" aria-hidden><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                <span>{m.phone}</span>
                              </div>
                            )}
                            {!m.email && !m.phone && <span className="text-slate-400">—</span>}
                          </div>
                          <div className="mt-auto pt-4 border-t border-slate-200 flex items-center justify-between gap-2">
                            <Link
                              href={`/portal/contacts/${m.contactId}`}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition-colors border border-slate-200 hover:border-indigo-200 min-h-[44px]"
                            >
                              Profil 360°
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Rodinné dokumenty a poznámky */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-4 sm:px-6 py-4 border-b border-slate-100">
                  Rodinné dokumenty a poznámky
                </h3>
                <div className="p-4 sm:p-6">
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center text-slate-500 bg-slate-50/50 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-2 text-slate-400" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <p className="text-sm font-semibold">Společné dokumenty – připravujeme</p>
                    <p className="text-xs mt-1">SJM, oddací listy, společná daňová přiznání…</p>
                  </div>
                  <p className="text-sm text-slate-500 mb-3">Zápisky a dokumenty najdete u profilů členů.</p>
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
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500" aria-hidden><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                    Společné cíle
                  </h3>
                </div>
                <div className="p-4 sm:p-6">
                  <p className="text-sm text-slate-500 mb-2">Žádné cíle.</p>
                  <p className="text-xs text-slate-400">Cíle domácnosti budou dostupné v budoucí verzi.</p>
                </div>
              </div>

              {/* Aktuální obchody */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500" aria-hidden><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                    Aktuální obchody
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {opportunities.length === 0 ? (
                    <>
                      <p className="text-sm text-slate-500">Žádné otevřené obchody.</p>
                      <Link href="/portal/pipeline" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline">
                        Pipeline
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </Link>
                    </>
                  ) : (
                    <>
                      {opportunities.map((o) => (
                        <Link
                          key={o.id}
                          href={`/portal/pipeline/${o.id}`}
                          className="block p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-sm hover:border-indigo-100 transition-all group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              {o.stageName ?? "—"}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">{o.title}</h4>
                          <p className="text-xs text-slate-500 mt-1">{o.contactName}</p>
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
                    className="flex items-center justify-center gap-2 w-full py-3 mt-2 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold uppercase tracking-wider text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors min-h-[44px]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Nový obchod pro rodinu
                  </Link>
                </div>
              </div>

              {/* Finanční analýzy */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <h3 className="font-bold text-slate-900 px-4 sm:px-6 py-4 border-b border-slate-100">Finanční analýzy</h3>
                <div className="p-4 sm:p-6">
                  <Link
                    href={`/portal/analyses?householdId=${household.id}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline min-h-[44px] items-center"
                  >
                    Přehled finančních analýz
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </Link>
                </div>
              </div>

              {/* Smazat domácnost – in sidebar on desktop */}
              <div className="pt-2 xl:block hidden">
                <button
                  type="button"
                  onClick={handleDeleteHousehold}
                  disabled={pending}
                  className="w-full rounded-2xl border border-rose-200 bg-white text-rose-600 px-4 py-3 text-sm font-bold uppercase tracking-wider hover:bg-rose-50 transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  Smazat domácnost
                </button>
              </div>
            </div>
          </div>
        </main>

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
