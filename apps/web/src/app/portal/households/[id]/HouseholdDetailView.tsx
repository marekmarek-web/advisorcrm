"use client";

import { useState, useTransition } from "react";
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
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 md:py-6">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-3">
            <Link href="/portal" className="hover:text-slate-700">Databáze</Link>
            <span aria-hidden>/</span>
            <Link href="/portal/households" className="hover:text-slate-700">Domácnosti</Link>
            <span aria-hidden>/</span>
            <span className="text-slate-800 font-medium truncate">{household.name}</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="relative">
                <HouseholdIconDisplay iconId={household.icon} />
                <button
                  type="button"
                  onClick={() => setIconPickerOpen((o) => !o)}
                  disabled={pending}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-200 border border-white flex items-center justify-center text-slate-600 hover:bg-slate-300 text-xs disabled:opacity-50"
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
                      className="wp-input font-semibold text-lg max-w-full"
                      style={{ width: "min(280px, 100%)" }}
                      autoFocus
                      required
                    />
                    <button type="submit" disabled={pending} className="wp-btn wp-btn-primary text-sm">{pending ? "…" : "Uložit"}</button>
                    <button type="button" onClick={() => { setRenaming(false); setNewName(household.name); }} className="wp-btn wp-btn-ghost text-sm">Zrušit</button>
                  </form>
                ) : (
                  <>
                    <h1 className="text-xl md:text-2xl font-semibold text-slate-800 truncate">{household.name}</h1>
                    <p className="text-sm text-slate-500 mt-0.5">{household.members.length} {household.members.length === 1 ? "člen" : "členů"}</p>
                    <button type="button" onClick={() => setRenaming(true)} className="text-sm font-medium mt-1 hover:underline" style={{ color: "var(--wp-cal-accent)" }}>Přejmenovat</button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/portal/households" className="wp-btn wp-btn-ghost text-sm">Zpět na domácnosti</Link>
              <Link href={`/portal/mindmap?householdId=${household.id}`} className="wp-btn wp-btn-primary text-sm font-semibold shadow-sm">Strategická mapa</Link>
            </div>
          </div>

          {iconPickerOpen && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-2">Ikona domácnosti</p>
              <HouseholdIconPicker value={household.icon} onChange={(id) => handleIconChange(id)} disabled={pending} />
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h2 className="font-semibold text-slate-800">Členové domácnosti</h2>
                {!addingMember && (
                  <button type="button" onClick={() => setAddingMember(true)} className="wp-btn wp-btn-primary text-sm">+ Přidat člena</button>
                )}
              </div>

              {addingMember && (
                <form onSubmit={handleAddMember} className="flex flex-wrap items-center gap-2 p-4 bg-slate-50 border-b border-slate-200">
                  <select value={memberContactId} onChange={(e) => setMemberContactId(e.target.value)} className="wp-select flex-1 min-w-[140px]" required>
                    <option value="">Vyberte kontakt…</option>
                    {availableContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                  <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)} className="wp-select w-auto">
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button type="submit" disabled={pending} className="wp-btn wp-btn-primary text-sm">{pending ? "…" : "Přidat"}</button>
                  <button type="button" onClick={() => { setAddingMember(false); setMemberContactId(""); }} className="wp-btn wp-btn-ghost text-sm">Zrušit</button>
                </form>
              )}

              <div className="p-4">
                {household.members.length === 0 && !addingMember ? (
                  <p className="text-sm text-slate-500">Žádní členové.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {household.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white hover:border-slate-300 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium shrink-0" aria-hidden>
                          {initials(m.firstName, m.lastName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 truncate">{m.firstName} {m.lastName}</p>
                          <p className="text-xs text-slate-500 truncate">{m.email ?? "—"}</p>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">{roleLabel(m.role)}</span>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Link href={`/portal/contacts/${m.contactId}`} className="text-sm font-medium hover:underline" style={{ color: "var(--wp-cal-accent)" }}>Profil</Link>
                          <button type="button" onClick={() => handleRemoveMember(m.id)} disabled={pending} className="text-sm font-medium hover:underline disabled:opacity-50 text-red-600 text-left">Odebrat</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-slate-800 p-4 border-b border-slate-200">Aktuální obchody</h2>
              <div className="p-4">
                {opportunities.length === 0 ? (
                  <>
                    <p className="text-sm text-slate-500 mb-2">Žádné otevřené obchody.</p>
                    <Link href="/portal/pipeline" className="text-sm font-medium hover:underline" style={{ color: "var(--wp-cal-accent)" }}>Pipeline →</Link>
                  </>
                ) : (
                  <ul className="space-y-2">
                    {opportunities.map((o) => (
                      <li key={o.id}>
                        <Link href={`/portal/pipeline/${o.id}`} className="block p-2 rounded-[var(--wp-radius-sm)] hover:bg-slate-50 text-sm">
                          <span className="font-medium text-slate-800">{o.title}</span>
                          <span className="text-slate-500 ml-1">{o.stageName ?? "—"} · {o.contactName}</span>
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link href="/portal/pipeline" className="text-sm font-medium hover:underline mt-2 inline-block" style={{ color: "var(--wp-cal-accent)" }}>Všechny obchody →</Link>
                    </li>
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-white rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-slate-800 p-4 border-b border-slate-200">Dokumenty a poznámky</h2>
              <div className="p-4">
                <p className="text-sm text-slate-500 mb-2">Společné dokumenty – připravujeme. Zápisky a dokumenty najdete u profilů členů.</p>
                {household.members.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {household.members.slice(0, 3).map((m) => (
                      <li key={m.id}>
                        <Link href={`/portal/contacts/${m.contactId}`} className="hover:underline" style={{ color: "var(--wp-cal-accent)" }}>Dokumenty {m.firstName} {m.lastName}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-white rounded-[var(--wp-radius-sm)] border border-slate-200 shadow-sm overflow-hidden">
              <h2 className="font-semibold text-slate-800 p-4 border-b border-slate-200">Finanční analýzy</h2>
              <div className="p-4">
                <Link href={`/portal/analyses?householdId=${household.id}`} className="text-sm font-medium hover:underline" style={{ color: "var(--wp-cal-accent)" }}>Přehled finančních analýz →</Link>
              </div>
            </div>

            <div className="pt-2">
              <button type="button" onClick={handleDeleteHousehold} disabled={pending} className="rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 w-full">Smazat domácnost</button>
            </div>
          </div>
        </div>
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
