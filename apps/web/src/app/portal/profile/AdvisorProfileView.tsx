"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  ShieldCheck,
  Mail,
  Phone,
  Building,
  CheckCircle,
  Link as LinkIcon,
  Key,
  Copy,
  Check,
  AlertCircle,
  ChevronRight,
  MapPin,
  Globe,
  Save,
  Settings,
  Bell,
  FileText,
  BarChart3,
  User,
} from "lucide-react";
import { WorkspaceStripeBilling } from "@/app/components/billing/WorkspaceStripeBilling";
import type { WorkspaceBillingSnapshot } from "@/lib/stripe/billing-types";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { updatePortalProfile, updatePortalPassword } from "@/app/actions/auth";
import type { SupervisorOption } from "@/app/actions/auth";
import {
  getAdvisorAvatarUrl,
  uploadAdvisorAvatar,
  updateAdvisorReportBranding,
  uploadReportLogo,
} from "@/app/actions/preferences";

const VALID_TABS = ["osobni", "rezervace", "integrace", "notifikace", "fakturace"] as const;
type TabId = (typeof VALID_TABS)[number];
const ADVISOR_AVATAR_MAX_SIZE = 3 * 1024 * 1024;

function isValidTab(t: string): t is TabId {
  return VALID_TABS.includes(t as TabId);
}

export type AdvisorProfileInitial = {
  email: string;
  fullName: string | null;
  roleName: string;
  tenantName: string;
  phone?: string | null;
  website?: string | null;
  reportLogoUrl?: string | null;
  currentSupervisorId?: string | null;
  supervisorOptions?: SupervisorOption[];
  billing?: WorkspaceBillingSnapshot;
};

function parseFullName(full: string | null): { firstName: string; lastName: string } {
  if (!full || !full.trim()) return { firstName: "", lastName: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// SVG ikony pro integrace
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const TABS = [
  { id: "osobni", label: "Osobní údaje" },
  { id: "rezervace", label: "Rezervační systém" },
  { id: "integrace", label: "Integrace & Účty" },
  { id: "notifikace", label: "Notifikace" },
  { id: "fakturace", label: "Fakturace" },
] as const;

// Placeholder licence / integrace – později z API nebo DB
const MOCK_LICENSES = [
  { name: "Vázaný zástupce – Pojištění", status: "valid" as const, expiry: "12. 05. 2027" },
  { name: "Vázaný zástupce – Úvěry", status: "valid" as const, expiry: "08. 11. 2026" },
  { name: "Vázaný zástupce – Investice", status: "expiring" as const, expiry: "15. 04. 2026" },
];
type IntegrationKey = "google-drive" | "gmail";
type IntegrationState = {
  connected: boolean;
  email: string | null;
  loading: boolean;
  error: string | null;
};
type IntegrationCard = {
  id: IntegrationKey;
  name: string;
  href: string;
};

const PROFILE_INTEGRATIONS: IntegrationCard[] = [
  { id: "google-drive", name: "Google Disk", href: "/portal/tools/drive" },
  { id: "gmail", name: "Gmail", href: "/portal/tools/gmail" },
];

export function AdvisorProfileView({
  initial,
  isFallback = false,
}: {
  initial: AdvisorProfileInitial;
  isFallback?: boolean;
}) {
  if (!initial) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] px-4 text-center">
        <p className="text-slate-600 font-medium">Profil není k dispozici.</p>
        <p className="text-sm text-slate-500 mt-1">Zkuste obnovit stránku nebo se vrátit později.</p>
      </div>
    );
  }
  const parsed = parseFullName(initial.fullName ?? null);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<TabId>(isValidTab(tabParam ?? "") ? (tabParam as TabId) : "osobni");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (isValidTab(t ?? "")) setActiveTabState(t as TabId);
    else setActiveTabState("osobni");
  }, [searchParams]);

  const setActiveTab = (tabId: TabId) => {
    setActiveTabState(tabId);
    router.replace(`${pathname}?tab=${tabId}`);
  };

  const [copied, setCopied] = useState(false);
  const [firstName, setFirstName] = useState(parsed.firstName);
  const [lastName, setLastName] = useState(parsed.lastName);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [supervisorUserId, setSupervisorUserId] = useState(initial.currentSupervisorId ?? "");
  const [ico, setIco] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [advisorAvatarUrl, setAdvisorAvatarUrl] = useState<string | null>(null);
  const [advisorAvatarUploading, setAdvisorAvatarUploading] = useState(false);
  const [advisorAvatarError, setAdvisorAvatarError] = useState<string | null>(null);
  const [reportLogoUrl, setReportLogoUrl] = useState<string | null>(initial.reportLogoUrl ?? null);
  const [reportLogoUploading, setReportLogoUploading] = useState(false);
  const [reportLogoError, setReportLogoError] = useState<string | null>(null);
  const [continuingEducationDueAt, setContinuingEducationDueAt] = useState("");
  const [integrations, setIntegrations] = useState<Record<IntegrationKey, IntegrationState>>({
    "google-drive": { connected: false, email: null, loading: true, error: null },
    gmail: { connected: false, email: null, loading: true, error: null },
  });

  useEffect(() => {
    getAdvisorAvatarUrl().then(setAdvisorAvatarUrl);
  }, []);

  useEffect(() => {
    let active = true;

    const loadStatus = async (id: IntegrationKey, endpoint: string) => {
      try {
        const res = await fetch(endpoint);
        const data = (await res.json().catch(() => ({}))) as {
          connected?: boolean;
          email?: string;
          error?: string;
        };
        if (!active) return;
        if (!res.ok) {
          setIntegrations((prev) => ({
            ...prev,
            [id]: {
              connected: false,
              email: null,
              loading: false,
              error: data.error ?? "Stav se nepodařilo načíst.",
            },
          }));
          return;
        }
        setIntegrations((prev) => ({
          ...prev,
          [id]: {
            connected: !!data.connected,
            email: data.email ?? null,
            loading: false,
            error: null,
          },
        }));
      } catch {
        if (!active) return;
        setIntegrations((prev) => ({
          ...prev,
          [id]: {
            connected: false,
            email: null,
            loading: false,
            error: "Stav se nepodařilo načíst.",
          },
        }));
      }
    };

    void Promise.all([
      loadStatus("google-drive", "/api/drive/status"),
      loadStatus("gmail", "/api/gmail/status"),
    ]);

    return () => {
      active = false;
    };
  }, []);

  const onAdvisorAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > ADVISOR_AVATAR_MAX_SIZE) {
      setAdvisorAvatarError("Soubor je příliš velký (max 3 MB)");
      e.target.value = "";
      return;
    }
    setAdvisorAvatarError(null);
    setAdvisorAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const url = await uploadAdvisorAvatar(fd);
      if (url) setAdvisorAvatarUrl(url);
    } catch (err) {
      setAdvisorAvatarError(err instanceof Error ? err.message : "Nahrání se nezdařilo");
    } finally {
      setAdvisorAvatarUploading(false);
      e.target.value = "";
    }
  };

  const onReportLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReportLogoError(null);
    setReportLogoUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const url = await uploadReportLogo(fd);
      if (url) setReportLogoUrl(url);
    } catch (err) {
      setReportLogoError(err instanceof Error ? err.message : "Nahrání loga se nezdařilo");
    } finally {
      setReportLogoUploading(false);
      e.target.value = "";
    }
  };

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const bookingLink = "www.aidvisora.cz/rezervace"; // placeholder

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(bookingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updatePortalProfile(fullName ?? "", undefined, supervisorUserId || null);
      await updateAdvisorReportBranding({ phone: phone.trim() || null, website: website.trim() || null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (!password.trim()) {
      setPasswordError("Zadejte nové heslo.");
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordError("Hesla se neshodují.");
      return;
    }
    if (password.length < 6) {
      setPasswordError("Heslo musí mít alespoň 6 znaků.");
      return;
    }
    setPasswordSaving(true);
    try {
      await updatePortalPassword(password);
      setPasswordSuccess(true);
      setPassword("");
      setPasswordConfirm("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Změna hesla selhala.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 placeholder:text-slate-400 placeholder:font-medium min-h-[44px]";

  const initials = [parsed.firstName, parsed.lastName].map((s) => s[0]).filter(Boolean).join("").toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-12 md:pb-20">
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Top nav – uvnitř portálu, konzistentní s breadcrumbs */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 md:px-8 py-4 sticky top-0 z-40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link
            href="/portal"
            className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
          >
            <ArrowLeft size={16} aria-hidden /> Zpět na nástěnku
          </Link>
          <div className="w-px h-6 bg-slate-200 hidden sm:block" aria-hidden />
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 min-w-0 truncate">
            <Link href="/portal/setup" className="hover:text-indigo-600 transition-colors">
              Nastavení CRM
            </Link>
            <span className="opacity-30">/</span>
            <span className="text-slate-800">Můj profil</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200" role="status">
              Uloženo
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-aidv-create text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-aidv-create-hover transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:pointer-events-none min-h-[44px]"
          >
            <Save size={16} aria-hidden /> {saving ? "Ukládám…" : "Uložit změny"}
          </button>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8 space-y-6">
        {isFallback && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
            Část údajů se nepodařilo načíst. Můžete upravit a uložit základní údaje.
          </div>
        )}
        {/* Hlavička profilu */}
        <div className="bg-white rounded-2xl sm:rounded-[32px] p-6 sm:p-8 border border-slate-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row items-center md:items-start justify-between gap-6 md:gap-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 z-10 text-center md:text-left">
            <div className="relative group">
              <label className="block cursor-pointer">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl sm:rounded-[28px] bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-2xl sm:text-3xl shadow-xl shadow-indigo-200 border-4 border-white transition-transform group-hover:scale-105 overflow-hidden">
                  {advisorAvatarUrl ? (
                    <img src={advisorAvatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="absolute inset-0 bg-slate-900/40 rounded-2xl sm:rounded-[28px] border-4 border-transparent flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <Camera size={24} className="text-white mb-0.5" aria-hidden />
                  <span className="text-[9px] font-black uppercase text-white">Nahrát fotku</span>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={onAdvisorAvatarChange}
                  disabled={advisorAvatarUploading}
                />
              </label>
              {advisorAvatarUploading && (
                <p className="text-xs text-slate-500 mt-1 text-center">Nahrávám…</p>
              )}
              {advisorAvatarError && (
                <p className="text-xs text-red-600 mt-1 text-center max-w-[100px]">{advisorAvatarError}</p>
              )}
              <div
                className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1.5 rounded-full border-4 border-white shadow-sm pointer-events-none"
                title="Účet je aktivní"
              >
                <ShieldCheck size={16} aria-hidden />
              </div>
            </div>
            <div className="pt-0 md:pt-2">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-1">
                {firstName || lastName ? `${firstName} ${lastName}`.trim() || "—" : "Můj profil"}
              </h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-md border border-indigo-100">
                  {initial.roleName}
                </span>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-slate-200">
                  {initial.tenantName}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 w-full md:w-auto justify-center">
            <div className="text-center">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Aktivní klienti
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900">—</span>
            </div>
            <div className="w-px h-10 bg-slate-200" aria-hidden />
            <div className="text-center">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Spravované AUM
              </span>
              <span className="text-xl sm:text-2xl font-black text-indigo-600">—</span>
            </div>
          </div>
        </div>

        {/* Taby */}
        <div className="flex items-center gap-4 sm:gap-8 border-b border-slate-200 px-2 overflow-x-auto hide-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`pb-4 text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap min-h-[44px] flex items-end
                ${activeTab === tab.id ? "text-indigo-600" : "text-slate-400 hover:text-slate-800"}
              `}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-indigo-600 rounded-t-full" aria-hidden />
              )}
            </button>
          ))}
        </div>

        {/* Hlavní obsah podle tabu */}
        {activeTab === "osobni" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Osobní a firemní údaje */}
            <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-5 border-b border-slate-50">
                <h2 className="text-lg font-black text-slate-900">Základní informace</h2>
              </div>
              <div className="p-6 sm:p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                      Jméno
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={inputClass}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                      Příjmení
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={inputClass}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                      E-mail (pro přihlášení)
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="email"
                        value={initial.email}
                        readOnly
                        className={`${inputClass} pl-11 bg-slate-100 text-slate-500 cursor-not-allowed border-transparent`}
                        aria-readonly
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                      Telefon
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`${inputClass} pl-11`}
                        autoComplete="tel"
                        placeholder="+420 123 456 789"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                      Web
                    </label>
                    <div className="relative">
                      <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        className={`${inputClass} pl-11`}
                        placeholder="https://www.example.cz"
                        autoComplete="url"
                      />
                    </div>
                  </div>
                  {(initial.roleName === "Advisor" || initial.roleName === "Manager" || initial.roleName === "Director") && (
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                        Nadřízený
                      </label>
                      <CustomDropdown
                        value={supervisorUserId}
                        onChange={setSupervisorUserId}
                        options={[
                          { id: "", label: "Bez nadřízeného" },
                          ...(initial.supervisorOptions ?? []).map((opt) => ({
                            id: opt.userId,
                            label: `${opt.displayName} (${opt.roleName})`,
                          })),
                        ]}
                        placeholder="Bez nadřízeného"
                        icon={User}
                      />
                    </div>
                  )}
                </div>
                <div className="pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                      IČO
                    </label>
                    <div className="relative">
                      <Building size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={ico}
                        onChange={(e) => setIco(e.target.value)}
                        className={`${inputClass} pl-11`}
                        placeholder="12345678"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                      Sídlo / Korespondenční adresa
                    </label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className={`${inputClass} pl-11`}
                        placeholder="Václavské nám. 1, Praha 1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Zabezpečení účtu */}
            <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-5 border-b border-slate-50 flex items-center gap-2">
                <Key size={18} className="text-slate-400 shrink-0" />
                <h2 className="text-lg font-black text-slate-900">Zabezpečení účtu</h2>
              </div>
              <form onSubmit={handleUpdatePassword} className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                    Nové heslo
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                    Potvrdit nové heslo
                  </label>
                  <input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  {passwordError && (
                    <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200" role="alert">
                      {passwordError}
                    </p>
                  )}
                  {passwordSuccess && (
                    <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200" role="status">
                      Heslo bylo změněno.
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="px-5 py-2.5 bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors min-h-[44px] disabled:opacity-60"
                  >
                    {passwordSaving ? "Ukládám…" : "Aktualizovat heslo"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Pravý sloupec */}
          <div className="lg:col-span-1 space-y-6">
            {/* Rezervační odkaz */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl sm:rounded-[24px] p-6 text-white shadow-lg shadow-indigo-900/20 relative overflow-hidden group">
              <Globe className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10 group-hover:scale-110 transition-transform duration-700 pointer-events-none" aria-hidden />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-4 flex items-center gap-2">
                <LinkIcon size={12} aria-hidden /> Váš rezervační odkaz
              </h3>
              <p className="text-sm font-bold text-indigo-50 mb-4 leading-relaxed">
                Pošlete tento odkaz klientům, aby si mohli sami naplánovat schůzku přímo do vašeho kalendáře.
              </p>
              <div className="bg-white/10 border border-white/20 p-3 rounded-xl flex items-center justify-between gap-2 backdrop-blur-md mb-4">
                <span className="text-xs font-medium truncate opacity-90">{bookingLink}</span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px]"
                  title="Kopírovat odkaz"
                >
                  {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                </button>
              </div>
              <Link
                href="/portal/calendar"
                className="text-xs font-black uppercase tracking-widest text-white hover:text-indigo-200 transition-colors flex items-center gap-1 min-h-[44px]"
              >
                Nastavit dostupnost <ChevronRight size={14} aria-hidden />
              </Link>
            </div>

            {/* Logo do reportu PDF */}
            <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-50 flex items-center gap-2">
                <FileText size={18} className="text-slate-400 shrink-0" aria-hidden />
                <h3 className="font-black text-slate-900">Pro report PDF</h3>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Logo se zobrazí na titulní stránce finančního reportu. Telefon a web z této stránky se použijí v záhlaví a zápatí.
                </p>
                <label className="block cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 transition-colors min-h-[44px]">
                    {reportLogoUploading ? "Nahrávám…" : "Nahrát logo"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={onReportLogoChange}
                    disabled={reportLogoUploading}
                  />
                </label>
                {reportLogoError && (
                  <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200" role="alert">
                    {reportLogoError}
                  </p>
                )}
                {reportLogoUrl && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Náhled</p>
                    <img
                      src={reportLogoUrl}
                      alt=""
                      className="max-h-20 w-auto object-contain rounded-lg border border-slate-200 bg-slate-50"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Licence */}
            <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-50">
                <h3 className="font-black text-slate-900">Licence a oprávnění</h3>
              </div>
              <div className="p-4 space-y-3">
                {MOCK_LICENSES.map((lic, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 flex items-start gap-3"
                  >
                    <div
                      className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                        ${lic.status === "valid" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}
                      `}
                    >
                      {lic.status === "valid" ? (
                        <CheckCircle size={12} strokeWidth={3} aria-hidden />
                      ) : (
                        <AlertCircle size={12} strokeWidth={3} aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-800 leading-tight mb-1">{lic.name}</h4>
                      <p
                        className={`text-[10px] font-black uppercase tracking-widest ${lic.status === "valid" ? "text-slate-400" : "text-amber-600"}`}
                      >
                        Platnost do: {lic.expiry}
                      </p>
                    </div>
                  </div>
                ))}
                <a
                  href="https://jerrs.cnb.cz/apljerrsdad/JERRS.WEB09.DIRECT_FIND?p_lang=cz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 mt-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                >
                  Vyhledat v registru ČNB
                </a>
                <div className="mt-4 p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Následné vzdělávání (termín)
                  </label>
                  <input
                    type="date"
                    value={continuingEducationDueAt}
                    onChange={(e) => setContinuingEducationDueAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Připojené účty */}
            <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-50">
                <h3 className="font-black text-slate-900">Připojené účty</h3>
              </div>
              <div className="p-4 space-y-3">
                {PROFILE_INTEGRATIONS.map((integration) => {
                  const status = integrations[integration.id];
                  const statusLabel = status.loading
                    ? "Načítám stav…"
                    : status.error
                      ? status.error
                      : status.connected
                        ? status.email
                          ? `Připojeno (${status.email})`
                          : "Připojeno"
                        : "Nepřipojeno";
                  const statusClass = status.loading
                    ? "text-slate-400"
                    : status.error
                      ? "text-amber-600"
                      : status.connected
                        ? "text-emerald-600"
                        : "text-slate-400";

                  return (
                  <Link
                    key={integration.id}
                    href={integration.href}
                    className="p-4 rounded-xl border border-slate-100 flex flex-wrap items-center justify-between gap-3 group hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                        <GoogleIcon />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-800">{integration.name}</h4>
                        <p className={`text-xs font-medium ${statusClass}`}>{statusLabel}</p>
                      </div>
                    </div>
                    {status.connected ? (
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" />
                    ) : (
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 min-h-[44px] inline-flex items-center">
                        Připojit
                      </span>
                    )}
                  </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === "rezervace" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-2">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl sm:rounded-[24px] p-6 sm:p-8 text-white shadow-lg shadow-indigo-900/20 relative overflow-hidden group">
                <Globe className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10 group-hover:scale-110 transition-transform duration-700 pointer-events-none" aria-hidden />
                <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-4 flex items-center gap-2">
                  <LinkIcon size={12} aria-hidden /> Rezervační odkaz
                </h2>
                <p className="text-sm font-bold text-indigo-50 mb-4 leading-relaxed">
                  Pošlete tento odkaz klientům, aby si mohli sami naplánovat schůzku přímo do vašeho kalendáře.
                </p>
                <div className="bg-white/10 border border-white/20 p-3 rounded-xl flex items-center justify-between gap-2 backdrop-blur-md mb-4">
                  <span className="text-xs font-medium truncate opacity-90">{bookingLink}</span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors flex-shrink-0 min-h-[44px] min-w-[44px]"
                    title="Kopírovat odkaz"
                  >
                    {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                  </button>
                </div>
                <Link
                  href="/portal/calendar"
                  className="text-xs font-black uppercase tracking-widest text-white hover:text-indigo-200 transition-colors flex items-center gap-1 min-h-[44px] inline-flex"
                >
                  Nastavit dostupnost <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
            </div>
            <div className="lg:col-span-1" />
          </div>
        )}

        {activeTab === "integrace" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 sm:px-8 py-5 border-b border-slate-50 flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-lg font-black text-slate-900">Připojené účty</h2>
                  <Link
                    href="/portal/setup"
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-colors min-h-[44px]"
                  >
                    <Settings size={14} /> Spravovat integrace v Nastavení
                  </Link>
                </div>
                <div className="p-4 space-y-3">
                  {PROFILE_INTEGRATIONS.map((integration) => {
                    const status = integrations[integration.id];
                    const statusLabel = status.loading
                      ? "Načítám stav…"
                      : status.error
                        ? status.error
                        : status.connected
                          ? status.email
                            ? `Připojeno (${status.email})`
                            : "Připojeno"
                          : "Nepřipojeno";
                    const statusClass = status.loading
                      ? "text-slate-400"
                      : status.error
                        ? "text-amber-600"
                        : status.connected
                          ? "text-emerald-600"
                          : "text-slate-400";

                    return (
                    <Link
                      key={integration.id}
                      href={integration.href}
                      className="p-4 rounded-xl border border-slate-100 flex flex-wrap items-center justify-between gap-3 group hover:border-indigo-200 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                          <GoogleIcon />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-800">{integration.name}</h4>
                          <p className={`text-xs font-medium ${statusClass}`}>{statusLabel}</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-colors shrink-0" />
                    </Link>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-50">
                  <h3 className="font-black text-slate-900">Licence a oprávnění</h3>
                </div>
                <div className="p-4 space-y-3">
                  {MOCK_LICENSES.map((lic, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 flex items-start gap-3">
                      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${lic.status === "valid" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                        {lic.status === "valid" ? <CheckCircle size={12} strokeWidth={3} aria-hidden /> : <AlertCircle size={12} strokeWidth={3} aria-hidden />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-800 leading-tight mb-1">{lic.name}</h4>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${lic.status === "valid" ? "text-slate-400" : "text-amber-600"}`}>
                          Platnost do: {lic.expiry}
                        </p>
                      </div>
                    </div>
                  ))}
                  <a
                    href="https://jerrs.cnb.cz/apljerrsdad/JERRS.WEB09.DIRECT_FIND?p_lang=cz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 mt-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    Vyhledat v registru ČNB
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifikace" && (
          <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden p-8">
            <div className="flex items-center gap-3 mb-4">
              <Bell size={24} className="text-slate-400" />
              <h2 className="text-lg font-black text-slate-900">Notifikace a oznámení</h2>
            </div>
            <p className="text-slate-600 text-sm mb-6 max-w-xl">
              Přehled odeslaných e-mailů, notifikací a zpráv od klientů. Nastavení kanálů a šablon najdete v Nastavení.
            </p>
            <Link
              href="/portal/notifications"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors min-h-[44px]"
            >
              <Bell size={18} /> Přejít do Oznámení
            </Link>
          </div>
        )}

        {activeTab === "fakturace" && (
          <div className="bg-white rounded-2xl sm:rounded-[24px] border border-slate-100 shadow-sm overflow-hidden p-8">
            <div className="flex items-center gap-3 mb-4">
              <FileText size={24} className="text-slate-400" />
              <h2 className="text-lg font-black text-slate-900">Smlouvy a fakturace</h2>
            </div>
            <p className="text-slate-600 text-sm mb-6 max-w-xl">
              Přehled smluv, plateb a produkce. Smlouvy podle období a produkční reporty.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/portal/contracts"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors min-h-[44px]"
              >
                <FileText size={18} /> Smlouvy
              </Link>
              <Link
                href="/portal/production"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors min-h-[44px]"
              >
                <BarChart3 size={18} /> Produkce
              </Link>
            </div>

            {initial.billing ? (
              <div className="mt-8 pt-8 border-t border-slate-100">
                <WorkspaceStripeBilling billing={initial.billing} billingContext="profile" />
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
