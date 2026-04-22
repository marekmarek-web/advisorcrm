"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Baby,
  Bell,
  ChevronDown,
  ChevronUp,
  Heart,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Shield,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { clientUpdateProfile } from "@/app/actions/contacts";
import type { ClientHouseholdDetail } from "@/app/actions/households";
import { householdRoleLabel, isHouseholdChildLikeRole } from "@/lib/households/roles";
import { AddFamilyMemberModal } from "../AddFamilyMemberModal";
import { SignOutButton } from "@/app/components/SignOutButton";

type ProfileClientViewProps = {
  profile: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    street: string | null;
    city: string | null;
    zip: string | null;
  };
  household: ClientHouseholdDetail | null;
};

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden ${className}`}>
      {children}
    </section>
  );
}

function SectionHeader({ title, icon, action }: { title: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="px-6 sm:px-8 py-5 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-main-scroll-bg)]/40">
      <h3 className="text-base font-black text-[color:var(--wp-text)] flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {action}
    </div>
  );
}

export function ProfileClientView({ profile, household }: ProfileClientViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    email: profile.email || "",
    phone: profile.phone || "",
    street: profile.street || "",
    city: profile.city || "",
    zip: profile.zip || "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [familyModalOpen, setFamilyModalOpen] = useState(false);

  const initials = useMemo(
    () => `${profile.firstName?.[0] ?? ""}${profile.lastName?.[0] ?? ""}`.toUpperCase() || "K",
    [profile.firstName, profile.lastName]
  );

  function saveProfile() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        await clientUpdateProfile(form);
        setSaved(true);
        setEditOpen(false);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Profil se nepodařilo uložit.");
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 client-fade-in">
      <div>
        <h2 className="text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">Můj účet</h2>
        <p className="text-[color:var(--wp-text-secondary)] font-medium mt-1">Správa profilu, domácnosti a nastavení účtu.</p>
      </div>

      {/* ── PŘEHLED ÚČTU ── */}
      <SectionCard>
        <div className="p-6 sm:p-8 flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-black text-[color:var(--wp-text)]">
              {profile.firstName} {profile.lastName}
            </h3>
            <div className="flex flex-wrap gap-3 mt-1.5">
              {profile.email && (
                <span className="flex items-center gap-1.5 text-sm text-[color:var(--wp-text-secondary)] font-medium">
                  <Mail size={13} className="text-[color:var(--wp-text-tertiary)]" />
                  {profile.email}
                </span>
              )}
              {profile.phone && (
                <span className="flex items-center gap-1.5 text-sm text-[color:var(--wp-text-secondary)] font-medium">
                  <Phone size={13} className="text-[color:var(--wp-text-tertiary)]" />
                  {profile.phone}
                </span>
              )}
              {(profile.city || profile.street) && (
                <span className="flex items-center gap-1.5 text-sm text-[color:var(--wp-text-secondary)] font-medium">
                  <MapPin size={13} className="text-[color:var(--wp-text-tertiary)]" />
                  {[profile.street, profile.city].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            className="shrink-0 min-h-[40px] min-w-[40px] rounded-xl border border-[color:var(--wp-surface-card-border)] grid place-items-center text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-main-scroll-bg)] hover:text-[color:var(--wp-text)] transition-colors"
            aria-label="Upravit kontaktní údaje"
          >
            {editOpen ? <ChevronUp size={16} /> : <Pencil size={16} />}
          </button>
        </div>

        {/* Editace — skrytá za togglem */}
        {editOpen && (
          <div className="border-t border-[color:var(--wp-surface-card-border)] p-6 sm:p-8 space-y-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Upravit kontaktní údaje</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] block mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                  className="w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                />
              </div>
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] block mb-1.5">Telefon</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                  className="w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                />
              </div>
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] block mb-1.5">Ulice</label>
                <input
                  type="text"
                  value={form.street}
                  onChange={(e) => setForm((c) => ({ ...c, street: e.target.value }))}
                  className="w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] block mb-1.5">Město</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))}
                    className="w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] block mb-1.5">PSČ</label>
                  <input
                    type="text"
                    value={form.zip}
                    onChange={(e) => setForm((c) => ({ ...c, zip: e.target.value }))}
                    className="w-full px-4 py-3 bg-[color:var(--wp-main-scroll-bg)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={saveProfile}
                disabled={isPending}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md shadow-indigo-600/20 transition-all min-h-[44px] disabled:opacity-50"
              >
                {isPending ? "Ukládám..." : "Uložit změny"}
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="px-4 py-2.5 text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] rounded-xl text-sm font-bold min-h-[44px] border border-[color:var(--wp-surface-card-border)] hover:bg-[color:var(--wp-main-scroll-bg)] transition-all"
              >
                Zrušit
              </button>
              {saved && <span className="text-sm text-emerald-600 font-bold">Uloženo.</span>}
              {error && <span className="text-sm text-rose-600 font-bold">{error}</span>}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── DOMÁCNOST ── */}
      <SectionCard>
        <SectionHeader
          title="Moje domácnost"
          icon={<Heart size={17} className="text-rose-500" />}
          action={
            <button
              onClick={() => setFamilyModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-100 transition-all min-h-[40px]"
            >
              <Plus size={14} />
              Přidat
            </button>
          }
        />
        <div className="p-6 sm:p-8">
          {!household || household.members.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-6 text-center space-y-2">
              <p className="text-sm text-[color:var(--wp-text-secondary)] font-medium">Domácnost zatím neobsahuje žádné členy.</p>
              <button
                onClick={() => setFamilyModalOpen(true)}
                className="text-indigo-600 text-sm font-black hover:underline"
              >
                Přidat prvního člena
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {household.members.map((member) => {
                const roleLabel = householdRoleLabel(member.role ?? null);
                const childLike = isHouseholdChildLikeRole(member.role);
                return (
                  <div key={member.id} className="p-4 border border-[color:var(--wp-surface-card-border)] rounded-2xl flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                        childLike ? "bg-amber-100 text-amber-700" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)]"
                      }`}
                    >
                      {childLike ? <Baby size={18} /> : `${member.firstName[0] ?? ""}${member.lastName[0] ?? ""}`}
                    </div>
                    <div>
                      <h4 className="font-bold text-[color:var(--wp-text)] text-sm">
                        {member.firstName} {member.lastName}
                      </h4>
                      <p className="text-xs font-bold text-[color:var(--wp-text-secondary)]">
                        {roleLabel}
                        {member.birthDate ? ` · ${new Date(member.birthDate).getFullYear()}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => setFamilyModalOpen(true)}
                className="p-4 border-2 border-dashed border-[color:var(--wp-surface-card-border)] rounded-2xl flex items-center justify-center gap-2 text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors min-h-[60px]"
              >
                <Plus size={18} />
                <span className="text-xs font-black uppercase tracking-widest">Přidat člena</span>
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── NASTAVENÍ ── */}
      <SectionCard>
        <SectionHeader title="Nastavení" icon={<Bell size={17} className="text-indigo-500" />} />
        <div className="p-6 sm:p-8 space-y-2">
          <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/50">
            <div className="flex items-center gap-3">
              <Bell size={16} className="text-[color:var(--wp-text-tertiary)]" />
              <span className="text-sm font-bold text-[color:var(--wp-text)]">E-mailová oznámení</span>
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
              Aktivní
            </span>
          </div>
          <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/50">
            <div className="flex items-center gap-3">
              <Shield size={16} className="text-[color:var(--wp-text-tertiary)]" />
              <span className="text-sm font-bold text-[color:var(--wp-text)]">Dvoufaktorové ověření</span>
            </div>
            <span className="text-xs font-bold text-[color:var(--wp-text-tertiary)]">Spravováno přes Supabase</span>
          </div>
        </div>
      </SectionCard>

      {/* ── ZABEZPEČENÍ A SOUKROMÍ ── */}
      <SectionCard>
        <SectionHeader title="Zabezpečení a soukromí" icon={<Lock size={17} className="text-[color:var(--wp-text-secondary)]" />} />
        <div className="p-6 sm:p-8 space-y-2">
          <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)]/50">
            <div className="flex items-center gap-3">
              <User size={16} className="text-[color:var(--wp-text-tertiary)]" />
              <span className="text-sm font-bold text-[color:var(--wp-text)]">GDPR a správa dat</span>
            </div>
            <span className="text-xs font-bold text-[color:var(--wp-text-tertiary)]">Kontaktujte poradce</span>
          </div>
        </div>
      </SectionCard>

      {/* ── ODHLÁŠENÍ ── */}
      <div className="pb-4">
        <SignOutButton variant="danger" />
      </div>

      <AddFamilyMemberModal
        open={familyModalOpen}
        onClose={() => setFamilyModalOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
