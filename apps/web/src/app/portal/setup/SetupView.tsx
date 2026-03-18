"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Check,
  Key,
  Mail,
  Phone,
  Building,
  MapPin,
  Shield,
  Camera,
  Link as LinkIcon,
  Copy,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Users,
  CreditCard,
  FileDigit,
  Download,
  Bell,
  Server,
  ArrowUpRight,
  CheckCircle,
  AlertCircle,
  Settings2,
  Loader2,
} from "lucide-react";
import { updatePortalProfile, updatePortalPassword } from "@/app/actions/auth";
import { seedDemoData } from "@/app/actions/seed-demo";
import { getQuickActionsConfig, setQuickActionsConfig, getAdvisorAvatarUrl, uploadAdvisorAvatar, getAdvisorReportFields, updateAdvisorReportBranding } from "@/app/actions/preferences";
import { GoogleCalendarUpcomingEvents } from "@/app/portal/setup/GoogleCalendarUpcomingEvents";
import { GoogleCalendarAvailability } from "@/app/portal/setup/GoogleCalendarAvailability";
import { listTenantMembers } from "@/app/actions/team";
import {
  QUICK_ACTIONS_CATALOG,
  getDefaultQuickActionsConfig,
  type QuickActionId,
} from "@/lib/quick-actions";
import { useToast } from "@/app/components/Toast";

const TABS = [
  { id: "osobni", label: "Osobní údaje", keywords: ["osobní", "údaje", "fakturace", "heslo", "zabezpečení", "2fa", "rychlé", "demo"] },
  { id: "profil", label: "Profil poradce", keywords: ["profil", "poradce", "vizitka", "rezervace", "licence"] },
  { id: "tym", label: "Tým", keywords: ["tým", "člen", "pozvat"] },
  { id: "fakturace", label: "Fakturace a Tarif", keywords: ["fakturace", "tarif", "platba", "faktura"] },
  { id: "notifikace", label: "Notifikace", keywords: ["notifikace", "email", "push"] },
  { id: "integrace", label: "Integrace", keywords: ["integrace", "google", "api", "kalendář"] },
  { id: "api", label: "API", keywords: ["api", "klíč", "webhook", "dokumentace"] },
] as const;

type TabId = (typeof TABS)[number]["id"];

export type SetupInitial = {
  userId: string;
  email: string;
  fullName: string | null;
  roleName: string;
  tenantName: string;
};

function parseFullName(full: string | null): { firstName: string; lastName: string } {
  if (!full || !full.trim()) return { firstName: "", lastName: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// --- Integrations (from original setup page)
type IntegrationStatus = "connected" | "disconnected" | "coming_soon";
interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: IntegrationStatus;
  category: "calendar" | "ai" | "email" | "other";
  configFields?: { key: string; label: string; type: "text" | "password"; placeholder: string }[];
}

/** Response shape from GET /api/ai/health */
interface AIIntegrationHealth {
  ok: boolean;
  provider: "openai";
  apiKeyPresent: boolean;
  model: string;
  fallbackModel: string | null;
  latencyMs?: number;
  error?: string;
}

const INTEGRATIONS: Integration[] = [
  { id: "google-calendar", name: "Google Calendar", description: "Synchronizujte schůzky a události z Aidvisora s Google Kalendářem. Propojte svůj Google účet – přihlášení proběhne v novém okně.", icon: "📅", status: "disconnected", category: "calendar" },
  { id: "openai-gpt", name: "OpenAI GPT Mini", description: "AI asistent pro sumarizaci schůzek, generování e-mailů a analýzu finančních dat klientů. API klíč se nastavuje v proměnných prostředí na serveru.", icon: "🤖", status: "disconnected", category: "ai" },
  { id: "resend", name: "Resend (E-mail)", description: "Odesílání transakčních a notifikačních e-mailů klientům.", icon: "✉️", status: "disconnected", category: "email", configFields: [{ key: "apiKey", label: "API Key", type: "password", placeholder: "re_..." }, { key: "fromEmail", label: "Odesílatel", type: "text", placeholder: "info@aidvisora.cz" }] },
  { id: "smart-emailing", name: "SmartEmailing", description: "Hromadné e-mailové kampaně a newslettery.", icon: "📧", status: "coming_soon", category: "email" },
  { id: "google-sheets", name: "Google Sheets Export", description: "Automatický export dat do Google Sheets.", icon: "📊", status: "coming_soon", category: "other" },
];

const STATUS_BADGES: Record<IntegrationStatus, { label: string; cls: string }> = {
  connected: { label: "Připojeno", cls: "bg-green-100 text-green-700" },
  disconnected: { label: "Odpojeno", cls: "bg-slate-100 text-slate-500" },
  coming_soon: { label: "Připravujeme", cls: "bg-blue-50 text-blue-500" },
};

// Placeholder licenses (UI only)
const MOCK_LICENSES = [
  { name: "Vázaný zástupce – Pojištění", status: "valid" as const, expiry: "12. 05. 2027" },
  { name: "Vázaný zástupce – Úvěry", status: "valid" as const, expiry: "08. 11. 2026" },
  { name: "Vázaný zástupce – Investice", status: "expiring" as const, expiry: "15. 04. 2026" },
];

const labelClass = "block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1";
const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 placeholder:text-slate-400 placeholder:font-medium min-h-[44px]";
const iconInputClass = "w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 min-h-[44px]";

export function SetupView({ initial }: { initial: SetupInitial }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    const t = TABS.find((tab) => tab.id === tabParam);
    return (t?.id ?? "osobni") as TabId;
  });
  const [searchQuery, setSearchQuery] = useState("");

  const setActiveTab = useCallback(
    (tabId: TabId) => {
      setActiveTabState(tabId);
      router.replace(`${pathname}?tab=${tabId}`);
    },
    [pathname, router]
  );

  // Sync tab from URL
  useEffect(() => {
    const t = searchParams.get("tab");
    const found = TABS.find((tab) => tab.id === t);
    if (found) setActiveTabState(found.id as TabId);
  }, [searchParams]);

  // Scroll to #quick-actions when hash is present (e.g. from QuickNewMenu "Upravit nabídku")
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#quick-actions") {
      setActiveTabState("osobni");
      router.replace(`${pathname}?tab=osobni`);
      requestAnimationFrame(() => {
        document.getElementById("quick-actions")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [pathname, router]);

  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return TABS;
    const q = searchQuery.toLowerCase();
    const matched = TABS.filter(
      (tab) =>
        tab.label.toLowerCase().includes(q) ||
        tab.keywords.some((k) => k.includes(q))
    );
    return matched.length > 0 ? matched : TABS;
  }, [searchQuery]);

  const isTabVisible = (tabId: TabId) => filteredTabs.some((t) => t.id === tabId);

  // --- Osobní údaje state
  const parsed = parseFullName(initial.fullName);
  const [firstName, setFirstName] = useState(parsed.firstName);
  const [lastName, setLastName] = useState(parsed.lastName);
  const [phone, setPhone] = useState("");
  const [ico, setIco] = useState("");
  const [address, setAddress] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [advisorAvatarUrl, setAdvisorAvatarUrl] = useState<string | null>(null);
  const [advisorAvatarUploading, setAdvisorAvatarUploading] = useState(false);
  const [advisorAvatarError, setAdvisorAvatarError] = useState<string | null>(null);
  const [reportPhone, setReportPhone] = useState("");
  const [reportWebsite, setReportWebsite] = useState("");
  const [reportSaving, setReportSaving] = useState(false);

  useEffect(() => {
    if (activeTab === "profil") {
      getAdvisorAvatarUrl().then(setAdvisorAvatarUrl);
      getAdvisorReportFields().then((f) => {
        setReportPhone(f.phone ?? "");
        setReportWebsite(f.website ?? "");
      });
    }
  }, [activeTab]);

  const onAdvisorAvatarChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
  }, []);

  const personalDirty = useMemo(() => {
    const full = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
    const orig = initial.fullName?.trim() || "";
    return full !== orig;
  }, [firstName, lastName, initial.fullName]);

  const handleSaveProfile = useCallback(async () => {
    setProfileError(null);
    setProfileSaved(false);
    setProfileSaving(true);
    try {
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || "";
      await updatePortalProfile(fullName);
      setProfileSaved(true);
      toast.showToast("Údaje uloženy");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setProfileSaving(false);
    }
  }, [firstName, lastName, toast]);

  const handleUpdatePassword = useCallback(
    async (e: React.FormEvent) => {
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
        toast.showToast("Heslo bylo změněno.");
      } catch (err) {
        setPasswordError(err instanceof Error ? err.message : "Změna hesla selhala.");
      } finally {
        setPasswordSaving(false);
      }
    },
    [password, passwordConfirm, toast]
  );

  // --- Profil poradce (public name, booking link)
  const [publicRole, setPublicRole] = useState("");
  const [company, setCompany] = useState(initial.tenantName);
  const [bio, setBio] = useState("");
  const [copied, setCopied] = useState(false);
  const bookingLink = typeof window !== "undefined" ? `${window.location.origin}/portal/calendar` : "aidvisora.cz/rezervace";

  const handleCopyLink = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(bookingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [bookingLink]);

  // --- Quick actions
  const [quickOrder, setQuickOrder] = useState<QuickActionId[]>([]);
  const [quickVisible, setQuickVisible] = useState<Record<string, boolean>>({});
  const [quickLoading, setQuickLoading] = useState(true);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickLoadError, setQuickLoadError] = useState(false);
  useEffect(() => {
    getQuickActionsConfig()
      .then((c) => {
        const catalogIds = QUICK_ACTIONS_CATALOG.map((a) => a.id);
        const order = (c.order.length ? c.order.filter((id) => catalogIds.includes(id as QuickActionId)) : [...catalogIds]) as QuickActionId[];
        const missing = catalogIds.filter((id) => !order.includes(id));
        setQuickOrder([...order, ...missing]);
        setQuickVisible(
          catalogIds.reduce<Record<string, boolean>>((acc, id) => {
            acc[id] = c.visible[id] !== false;
            return acc;
          }, {})
        );
        setQuickLoadError(false);
        setQuickLoading(false);
      })
      .catch(() => {
        const def = getDefaultQuickActionsConfig();
        const catalogIds = QUICK_ACTIONS_CATALOG.map((a) => a.id);
        const order = (def.order.length ? def.order.filter((id) => catalogIds.includes(id as QuickActionId)) : [...catalogIds]) as QuickActionId[];
        const missing = catalogIds.filter((id) => !order.includes(id));
        setQuickOrder([...order, ...missing]);
        setQuickVisible(
          catalogIds.reduce<Record<string, boolean>>((acc, id) => {
            acc[id] = def.visible[id] !== false;
            return acc;
          }, {})
        );
        setQuickLoadError(true);
        setQuickLoading(false);
      });
  }, []);

  const handleSaveQuickActions = useCallback(async () => {
    setQuickSaving(true);
    try {
      await setQuickActionsConfig(
        quickOrder,
        QUICK_ACTIONS_CATALOG.reduce<Record<string, boolean>>((acc, a) => {
          acc[a.id] = quickVisible[a.id] !== false;
          return acc;
        }, {})
      );
      toast.showToast("Nastavení rychlého tlačítka uloženo");
    } catch (e) {
      toast.showToast(e instanceof Error ? e.message : "Chyba při ukládání");
    } finally {
      setQuickSaving(false);
    }
  }, [quickOrder, quickVisible, toast]);

  // --- Demo data
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  // --- Integrations
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [integrationsCategory, setIntegrationsCategory] = useState<string>("all");
  const [aiHealth, setAiHealth] = useState<AIIntegrationHealth | null>(null);
  const [aiHealthLoading, setAiHealthLoading] = useState(false);
  const [aiHealthTesting, setAiHealthTesting] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [calendarStatusLoading, setCalendarStatusLoading] = useState(false);
  const [calendarStatusError, setCalendarStatusError] = useState<string | null>(null);
  const [calendarDisconnecting, setCalendarDisconnecting] = useState(false);
  const handleSaveIntegration = useCallback((integrationId: string) => {
    toast.showToast("Konfigurace uložena");
  }, [toast]);

  const fetchCalendarStatus = useCallback(async () => {
    setCalendarStatusLoading(true);
    setCalendarStatusError(null);
    try {
      const res = await fetch("/api/calendar/status");
      if (!res.ok) {
        setCalendarStatusError("Stav se nepodařilo načíst.");
        setCalendarStatus(null);
        return null;
      }
      const data = (await res.json()) as { connected: boolean; email?: string };
      setCalendarStatus(data);
      setCalendarStatusError(null);
      return data;
    } catch {
      setCalendarStatusError("Stav se nepodařilo načíst.");
      setCalendarStatus(null);
      return null;
    } finally {
      setCalendarStatusLoading(false);
    }
  }, []);

  const handleCalendarConnect = useCallback(() => {
    window.location.href = "/api/integrations/google-calendar/connect";
  }, []);

  const handleCalendarDisconnect = useCallback(async () => {
    if (!window.confirm("Opravdu chcete odpojit Google Kalendář? Události v aplikaci se již nebudou zobrazovat.")) return;
    setCalendarDisconnecting(true);
    setCalendarStatusError(null);
    try {
      const res = await fetch("/api/calendar/disconnect", { method: "POST" });
      if (res.ok) {
        await fetchCalendarStatus();
        toast.showToast("Google Kalendář byl odpojen.", "success");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.showToast(data.error ?? "Odpojení se nepovedlo.", "error");
      }
    } catch {
      toast.showToast("Odpojení se nepovedlo.", "error");
    } finally {
      setCalendarDisconnecting(false);
    }
  }, [fetchCalendarStatus, toast]);

  const fetchAiHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/health");
      const data = (await res.json()) as AIIntegrationHealth;
      setAiHealth(data);
      return data;
    } catch {
      setAiHealth(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (activeTab === "integrace") {
      setAiHealthLoading(true);
      fetchAiHealth().finally(() => setAiHealthLoading(false));
      fetchCalendarStatus();
    }
  }, [activeTab, fetchAiHealth, fetchCalendarStatus]);

  useEffect(() => {
    const calendar = searchParams.get("calendar");
    const calendarError = searchParams.get("calendar_error");
    if (calendar === "connected") toast.showToast("Google Kalendář byl úspěšně propojen.", "success");
    if (calendarError) toast.showToast(calendarError === "access_denied" ? "Připojení bylo zrušeno." : "Připojení se nepovedlo.", "error");
  }, [searchParams, toast]);

  const handleTestAIConnection = useCallback(async () => {
    setAiHealthTesting(true);
    try {
      const data = await fetchAiHealth();
      if (data?.ok) toast.showToast("Připojení v pořádku");
      else toast.showToast(data?.error ?? "Připojení selhalo", "error");
    } finally {
      setAiHealthTesting(false);
    }
  }, [fetchAiHealth, toast]);

  // --- Team
  const [teamMembers, setTeamMembers] = useState<Awaited<ReturnType<typeof listTenantMembers>>>([]);
  useEffect(() => {
    listTenantMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, []);

  const globalSaveDisabled = !personalDirty || profileSaving;
  const handleGlobalSave = useCallback(() => {
    if (activeTab === "osobni" && personalDirty) handleSaveProfile();
  }, [activeTab, personalDirty, handleSaveProfile]);

  const initials = [firstName, lastName].map((s) => s?.[0]).filter(Boolean).join("").toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-12 md:pb-20">
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 md:px-8 pt-6 md:pt-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Nastavení účtu</h1>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative max-w-xl w-full sm:w-64 md:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Hledat v nastavení..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-slate-700 min-h-[44px]"
              />
            </div>
            <button
              type="button"
              onClick={handleGlobalSave}
              disabled={globalSaveDisabled}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#1a1c2e] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-[#2a2d4a] transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]"
            >
              <Check size={16} /> Uložit změny
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-8 border-b border-slate-200 px-2 overflow-x-auto hide-scrollbar mb-8">
          {TABS.map((tab) => {
            const visible = isTabVisible(tab.id);
            if (!visible) return null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-4 pt-1 text-sm font-black uppercase tracking-widest transition-all relative whitespace-nowrap min-h-[44px] flex items-end
                  ${activeTab === tab.id ? "text-indigo-600" : "text-slate-400 hover:text-slate-800"}
                `}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 w-full h-[3px] bg-indigo-600 rounded-t-full" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab: Osobní údaje */}
        {activeTab === "osobni" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-in fade-in duration-300">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 sm:px-8 py-5 border-b border-slate-50">
                  <h2 className="text-lg font-black text-slate-900">Základní informace a fakturace</h2>
                  <p className="text-sm text-slate-500 font-medium mt-1">Tyto údaje slouží pro interní účely a vystavování faktur.</p>
                </div>
                <div className="p-6 sm:p-8 space-y-6">
                  {profileError && (
                    <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200" role="alert">{profileError}</p>
                  )}
                  {profileSaved && (
                    <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200" role="status">Uloženo</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClass}>Jméno</label>
                      <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} autoComplete="given-name" />
                    </div>
                    <div>
                      <label className={labelClass}>Příjmení</label>
                      <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} autoComplete="family-name" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClass}>E-mail (pro přihlášení)</label>
                      <div className="relative">
                        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="email" value={initial.email} readOnly className={`${iconInputClass} bg-slate-100 text-slate-500 cursor-not-allowed`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Telefon</label>
                      <div className="relative">
                        <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={iconInputClass} autoComplete="tel" />
                      </div>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClass}>IČO</label>
                      <div className="relative">
                        <Building size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="text" value={ico} onChange={(e) => setIco(e.target.value)} className={iconInputClass} placeholder="12345678" />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Sídlo / Korespondenční adresa</label>
                      <div className="relative">
                        <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={iconInputClass} placeholder="Václavské nám. 1, Praha 1" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ukázková data */}
              <div className="bg-white rounded-[24px] border border-amber-200 shadow-sm overflow-hidden p-6">
                <h3 className="font-semibold text-amber-800 text-sm flex items-center gap-1.5 mb-2">Ukázková data</h3>
                <p className="text-xs text-amber-600 mb-4">Vložte ukázková data (kontakty, smlouvy, schůzky, úkoly, pipeline) pro testování.</p>
                <button
                  type="button"
                  disabled={seedingDemo}
                  onClick={async () => {
                    setSeedingDemo(true);
                    setSeedMsg("");
                    try {
                      const result = await seedDemoData();
                      setSeedMsg(result.message);
                    } catch (e) {
                      setSeedMsg(e instanceof Error ? e.message : "Chyba");
                    } finally {
                      setSeedingDemo(false);
                    }
                  }}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-amber-800 bg-amber-200 hover:bg-amber-300 disabled:opacity-50 min-h-[44px]"
                >
                  {seedingDemo ? "Vkládám…" : "Vložit demo data"}
                </button>
                {seedMsg && <p className="text-xs text-amber-700 mt-2 bg-amber-100 rounded-lg px-3 py-2">{seedMsg}</p>}
              </div>

              {/* Rychlé tlačítko + Nový – nastavení v sidebaru (Nastavení), tlačítko v headeru beze změny */}
              <div id="quick-actions" className="scroll-mt-4 w-full max-w-[700px]">
                <style>{`
                  .quick-actions-custom-check {
                    appearance: none;
                    width: 20px;
                    height: 20px;
                    border: 2px solid #cbd5e1;
                    border-radius: 6px;
                    background-color: white;
                    cursor: pointer;
                    position: relative;
                    transition: all 0.2s ease;
                  }
                  .quick-actions-custom-check:checked {
                    background-color: #4f46e5;
                    border-color: #4f46e5;
                  }
                  .quick-actions-custom-check:checked::after {
                    content: '';
                    position: absolute;
                    left: 5px;
                    top: 2px;
                    width: 6px;
                    height: 10px;
                    border: solid white;
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                  }
                `}</style>
                <div className="bg-white rounded-[32px] shadow-2xl shadow-indigo-900/5 border border-slate-100 overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 opacity-50 rounded-full blur-3xl pointer-events-none" aria-hidden />
                  <div className="px-10 py-8 border-b border-slate-50 relative z-10">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                        <Settings2 size={24} />
                      </div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Rychlé tlačítko „+ Nový“</h2>
                    </div>
                    <p className="text-sm font-medium text-slate-500 pl-16">
                      Vyberte položky a pořadí v menu „+ Nový“ v horní liště. Skryté položky se nezobrazí.
                    </p>
                  </div>
                  <div className="p-6 md:p-10 space-y-1 relative z-10 max-h-[60vh] overflow-y-auto">
                    {quickLoading ? (
                      <p className="text-sm text-slate-500 py-4">Načítám…</p>
                    ) : (
                      <>
                        {quickLoadError && (
                          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4" role="alert">
                            Nastavení se nepodařilo načíst. Zobrazujeme výchozí položky – uložte pro uložení.
                          </p>
                        )}
                        {quickOrder.map((id, index) => {
                          const item = QUICK_ACTIONS_CATALOG.find((a) => a.id === id);
                          if (!item) return null;
                          const visible = quickVisible[id] !== false;
                          return (
                            <div
                              key={id}
                              className={`flex items-center gap-6 p-4 rounded-2xl transition-colors group ${
                                visible
                                  ? "bg-slate-50 border border-slate-100 hover:border-indigo-100"
                                  : "bg-transparent border border-transparent opacity-60"
                              }`}
                            >
                              <div className="flex flex-col items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (index > 0) {
                                      const n = [...quickOrder];
                                      [n[index - 1], n[index]] = [n[index], n[index - 1]];
                                      setQuickOrder(n);
                                    }
                                  }}
                                  disabled={index === 0}
                                  className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                                  aria-label="Posunout nahoru"
                                >
                                  <ChevronUp size={18} strokeWidth={3} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (index < quickOrder.length - 1) {
                                      const n = [...quickOrder];
                                      [n[index], n[index + 1]] = [n[index + 1], n[index]];
                                      setQuickOrder(n);
                                    }
                                  }}
                                  disabled={index === quickOrder.length - 1}
                                  className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                                  aria-label="Posunout dolů"
                                >
                                  <ChevronDown size={18} strokeWidth={3} />
                                </button>
                              </div>
                              <label className="flex items-center gap-4 cursor-pointer flex-1 py-2">
                                <input
                                  type="checkbox"
                                  checked={visible}
                                  onChange={() => setQuickVisible((p) => ({ ...p, [id]: !p[id] }))}
                                  className="quick-actions-custom-check shrink-0"
                                  aria-label={item.label}
                                />
                                <span
                                  className={`text-base transition-colors ${
                                    visible ? "font-bold text-slate-800" : "font-medium text-slate-500 line-through"
                                  }`}
                                >
                                  {item.label}
                                </span>
                              </label>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                  <div className="px-10 py-6 bg-slate-50/80 border-t border-slate-100 relative z-10">
                    <button
                      type="button"
                      disabled={quickSaving}
                      onClick={handleSaveQuickActions}
                      className="flex items-center gap-2 px-10 py-3.5 bg-[#1a1c2e] text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-[#2a2d4a] transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0 min-h-[44px]"
                    >
                      <Check size={18} /> {quickSaving ? "Ukládám…" : "Uložit"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-50">
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Key size={18} className="text-indigo-500" /> Zabezpečení
                  </h2>
                </div>
                <form onSubmit={handleUpdatePassword} className="p-6 space-y-5">
                  <div>
                    <label className={labelClass}>Nové heslo</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} autoComplete="new-password" />
                  </div>
                  <div>
                    <label className={labelClass}>Potvrdit nové heslo</label>
                    <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" className={inputClass} autoComplete="new-password" />
                  </div>
                  {passwordError && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200" role="alert">{passwordError}</p>}
                  {passwordSuccess && <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200" role="status">Heslo bylo změněno.</p>}
                  <button type="submit" disabled={passwordSaving} className="w-full px-5 py-3 bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors min-h-[44px] disabled:opacity-60">
                    {passwordSaving ? "Ukládám…" : "Aktualizovat heslo"}
                  </button>
                </form>
              </div>
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-[24px] shadow-lg text-white">
                <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center mb-4">
                  <Shield size={20} className="text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">Dvoufázové ověření</h3>
                <p className="text-sm font-medium text-slate-300 leading-relaxed mb-5">Zvyšte bezpečnost svého účtu pomocí aplikace Authenticator.</p>
                <button type="button" onClick={() => toast.showToast("Tato funkce bude dostupná v příští verzi.")} className="w-full bg-white text-slate-900 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-50 transition-colors min-h-[44px]">
                  Aktivovat 2FA
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Profil poradce */}
        {activeTab === "profil" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-in fade-in duration-300">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 sm:p-8">
                <div className="flex flex-col md:flex-row items-start gap-6 md:gap-8 mb-8">
                  <div className="relative group flex-shrink-0 mx-auto md:mx-0">
                    <label className="block cursor-pointer">
                      <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-[28px] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-3xl sm:text-4xl shadow-xl border-4 border-white overflow-hidden">
                        {advisorAvatarUrl ? (
                          <img src={advisorAvatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className="absolute inset-0 bg-slate-900/40 rounded-[28px] border-4 border-transparent flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Camera size={28} className="text-white mb-1" />
                        <span className="text-[10px] font-black uppercase text-white">Nahrát fotku</span>
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
                      <p className="text-xs text-slate-500 mt-2 text-center">Nahrávám…</p>
                    )}
                    {advisorAvatarError && (
                      <p className="text-xs text-red-600 mt-2 text-center max-w-[140px]">{advisorAvatarError}</p>
                    )}
                  </div>
                  <div className="flex-1 w-full space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className={labelClass}>Veřejné jméno</label>
                        <input type="text" value={[firstName, lastName].filter(Boolean).join(" ")} onChange={(e) => { const p = e.target.value.trim().split(/\s+/); setFirstName(p[0] ?? ""); setLastName(p.slice(1).join(" ") ?? ""); }} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Pracovní pozice</label>
                        <input type="text" value={publicRole} onChange={(e) => setPublicRole(e.target.value)} className={inputClass} placeholder="např. Poradce pro majetek" />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Název společnosti (Síť)</label>
                      <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Krátké Bio (vizitka a rezervační stránka)</label>
                  <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} className={`${inputClass} resize-none leading-relaxed`} placeholder="Pomáhám klientům budovat majetek..." />
                </div>
              </div>
            </div>
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[24px] p-6 text-white shadow-lg relative overflow-hidden">
                <LinkIcon className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10" aria-hidden />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-4 flex items-center gap-2">Váš rezervační odkaz</h3>
                <p className="text-sm font-bold text-indigo-50 mb-4 leading-relaxed">Pošlete tento odkaz klientům pro naplánování schůzky.</p>
                <div className="bg-white/10 border border-white/20 p-3 rounded-xl flex items-center justify-between gap-2 backdrop-blur-md mb-4 cursor-pointer hover:bg-white/20 transition-colors min-h-[44px]" onClick={handleCopyLink} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && handleCopyLink()}>
                  <span className="text-xs font-medium truncate opacity-90">{bookingLink}</span>
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">{copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}</div>
                </div>
                <Link href="/portal/calendar" className="text-xs font-black uppercase tracking-widest text-white hover:text-indigo-200 transition-colors flex items-center gap-1 min-h-[44px] inline-flex items-center">
                  Nastavit dostupnost <ChevronRight size={14} />
                </Link>
              </div>
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-50">
                  <h3 className="font-black text-slate-900">Licence a Oprávnění ČNB</h3>
                </div>
                <div className="p-4 space-y-3">
                  {MOCK_LICENSES.map((lic, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 flex items-start gap-3">
                      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${lic.status === "valid" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                        {lic.status === "valid" ? <CheckCircle size={12} strokeWidth={3} /> : <AlertCircle size={12} strokeWidth={3} />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 leading-tight mb-1">{lic.name}</h4>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${lic.status === "valid" ? "text-slate-400" : "text-amber-600"}`}>Platnost do: {lic.expiry}</p>
                      </div>
                    </div>
                  ))}
                  <a href="https://www.cnb.cz/cs/dohled/" target="_blank" rel="noopener noreferrer" className="w-full py-3 mt-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]">
                    Dohled ČNB
                  </a>
                </div>
              </div>
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-50">
                  <h3 className="font-black text-slate-900">PDF report z finanční analýzy</h3>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1">Pro záhlaví a zápatí</p>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-600 mb-3">Do záhlaví a zápatí PDF se použijí: jméno a příjmení z vašeho profilu, e-mail z přihlášení a níže vyplněné pole.</p>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Jméno, příjmení</span>
                      <span className="font-medium text-slate-700">{[firstName, lastName].filter(Boolean).join(" ") || "—"}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">E-mail</span>
                      <span className="font-medium text-slate-700">{initial.email || "—"}</span>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Telefon (do zápatí)</label>
                    <input type="tel" value={reportPhone} onChange={(e) => setReportPhone(e.target.value)} className={inputClass} placeholder="+420 …" />
                  </div>
                  <div>
                    <label className={labelClass}>Web (do zápatí)</label>
                    <input type="url" value={reportWebsite} onChange={(e) => setReportWebsite(e.target.value)} className={inputClass} placeholder="https://…" />
                  </div>
                  <button
                    type="button"
                    disabled={reportSaving}
                    onClick={async () => {
                      setReportSaving(true);
                      try {
                        await updateAdvisorReportBranding({ phone: reportPhone.trim() || null, website: reportWebsite.trim() || null });
                        toast.showToast("Údaje pro PDF uloženy.");
                      } catch {
                        toast.showToast("Uložení se nezdařilo.", "error");
                      } finally {
                        setReportSaving(false);
                      }
                    }}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 min-h-[44px]"
                  >
                    {reportSaving ? "Ukládám…" : "Uložit údaje pro PDF"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Tým */}
        {activeTab === "tym" && (
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
            <div className="px-6 sm:px-8 py-6 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 mb-1">Správa Týmu</h2>
                <p className="text-sm font-medium text-slate-500">Spolupracujte na klientech se svými asistenty nebo kolegy.</p>
              </div>
              <button type="button" onClick={() => toast.showToast("Tato funkce bude dostupná v příští verzi.")} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]">
                <Users size={16} /> Pozvat člena
              </button>
            </div>
            <div className="overflow-x-auto">
              {teamMembers.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">Zatím žádní další členové.</p>
                  <p className="text-sm mt-1">Pozvěte prvního člena tlačítkem výše.</p>
                </div>
              ) : (
                <table className="w-full text-left min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 sm:px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Uživatel</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Role</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Připojení</th>
                      <th className="px-6 sm:px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((m) => {
                      const isCurrentUser = m.userId === initial.userId;
                      const displayName = isCurrentUser ? (initial.fullName || initial.email || "—") : "Člen týmu";
                      const displayEmail = isCurrentUser ? initial.email : "—";
                      const initials = isCurrentUser && initial.fullName ? [initial.fullName.trim().split(/\s+/)[0]?.[0], initial.fullName.trim().split(/\s+/).pop()?.[0]].filter(Boolean).join("").toUpperCase() : (displayEmail.slice(0, 2).toUpperCase() || "?");
                      return (
                        <tr key={m.membershipId} className="border-b border-slate-50">
                          <td className="px-6 sm:px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-sm shrink-0">
                                {initials}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{displayName}</div>
                                <div className="text-xs font-medium text-slate-500">{displayEmail}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg ${m.roleName === "Admin" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>
                              {m.roleName === "Admin" ? "Vlastník" : m.roleName}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-sm font-bold text-slate-500 hidden md:table-cell">
                            {new Date(m.joinedAt).toLocaleDateString("cs-CZ")}
                          </td>
                          <td className="px-6 sm:px-8 py-5 text-right text-slate-300">{isCurrentUser ? "—" : <button type="button" className="text-xs font-bold text-rose-500 hover:text-rose-700 hover:underline">Odebrat</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Tab: Fakturace a Tarif */}
        {activeTab === "fakturace" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 animate-in fade-in duration-300">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gradient-to-br from-[#1a1c2e] to-slate-800 rounded-[24px] p-8 text-white shadow-xl">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Aktuální Tarif</h3>
                <div className="flex items-end gap-3 mb-6">
                  <span className="text-4xl font-black tracking-tight">Pro</span>
                  <span className="text-sm font-bold text-slate-400 mb-1">/ 1 200 Kč měs.</span>
                </div>
                <div className="space-y-3 mb-8">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle size={16} className="text-emerald-400" /> Neomezení klienti</div>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle size={16} className="text-emerald-400" /> AI Asistent</div>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle size={16} className="text-emerald-400" /> Týmová spolupráce</div>
                </div>
                <button type="button" onClick={() => toast.showToast("Tato funkce bude dostupná v příští verzi.")} className="w-full py-3 bg-white text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-colors min-h-[44px]">Změnit tarif</button>
              </div>
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6">
                <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2"><CreditCard size={18} className="text-slate-400" /> Platební metoda</h3>
                <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50 min-h-[44px]">
                  <span className="text-sm font-medium text-slate-500">Připravujeme propojení platební metody.</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden h-full">
                <div className="px-6 sm:px-8 py-6 border-b border-slate-50">
                  <h2 className="text-lg font-black text-slate-900">Historie plateb</h2>
                </div>
                <div className="p-4">
                  <p className="text-sm text-slate-500 py-6 text-center">Zatím žádné faktury. Po zapnutí fakturace se zde zobrazí historie.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Notifikace */}
        {activeTab === "notifikace" && (
          <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-6 border-b border-slate-50 flex items-center gap-3">
                <Mail size={20} className="text-indigo-500" />
                <h2 className="text-lg font-black text-slate-900">E-mailová upozornění</h2>
              </div>
              <div className="p-6 space-y-4">
                {[
                  { title: "Denní souhrn (Agenda)", desc: "Každé ráno přehled schůzek a úkolů na daný den.", id: "daily" },
                  { title: "Nová zpráva od klienta", desc: "Okamžité upozornění na vzkaz v portálu.", id: "message" },
                  { title: "Zpožděné úkoly", desc: "Upozornění na úkoly více než 24 h po termínu.", id: "tasks" },
                  { title: "Expirace smluv", desc: "Týdenní souhrn smluv blížících se k výročí.", id: "contracts" },
                ].map((notif) => (
                  <div key={notif.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors min-h-[44px]">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm mb-1">{notif.title}</h4>
                      <p className="text-xs font-medium text-slate-500">{notif.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a1c2e] min-h-[44px]" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-6 border-b border-slate-50 flex items-center gap-3">
                <Bell size={20} className="text-amber-500" />
                <h2 className="text-lg font-black text-slate-900">Prohlížeč (Push notifikace)</h2>
              </div>
              <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm mb-1">Povolit upozornění v prohlížeči</h4>
                  <p className="text-xs font-medium text-slate-500">Pro okamžitá upozornění na obrazovce.</p>
                </div>
                <button type="button" onClick={() => toast.showToast("Tato funkce bude dostupná v příští verzi.")} className="px-4 py-2.5 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors shadow-sm min-h-[44px]">Požádat o oprávnění</button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Integrace */}
        {activeTab === "integrace" && (
          <div className="animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-black text-slate-900 mb-1">Integrace a propojené aplikace</h2>
                <p className="text-sm font-medium text-slate-500">Propojte Aidvisoru s kalendáři, e-maily a AI nástroji.</p>
              </div>
            </div>
            <div className="mb-6">
              <button type="button" onClick={() => setHowItWorksOpen((o) => !o)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors rounded-xl border border-slate-100" aria-expanded={howItWorksOpen}>
                <span className="font-semibold text-slate-700">Jak to funguje</span>
                <ChevronRight size={20} className={`text-slate-400 transition-transform shrink-0 ${howItWorksOpen ? "rotate-90" : ""}`} />
              </button>
              {howItWorksOpen && (
                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 text-sm text-slate-600 space-y-2 rounded-b-xl border-x border-b border-slate-100">
                  <p>Integrace propojují Aidvisora s kalendáři, e-maily a AI nástroji. Po vyplnění údajů (API klíče, OAuth) a uložení je služba připojena. Konfigurace se ukládá šifrovaně na serveru.</p>
                </div>
              )}
            </div>
            <div className="flex flex-col lg:flex-row items-start gap-8">
              <div className="w-full lg:w-56 flex-shrink-0 flex flex-wrap lg:flex-col gap-1">
                {[{ id: "all", label: "Zobrazit všechny" }, { id: "calendar", label: "Kalendář" }, { id: "ai", label: "AI" }, { id: "email", label: "E-mail" }, { id: "other", label: "Ostatní" }].map((cat) => (
                  <button key={cat.id} type="button" onClick={() => setIntegrationsCategory(cat.id)} className={`flex items-center px-4 py-3 rounded-xl text-sm font-bold transition-all text-left min-h-[44px] ${integrationsCategory === cat.id ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>{cat.label}</button>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
                {INTEGRATIONS.filter((i) => integrationsCategory === "all" || i.category === integrationsCategory).map((integration) => {
                  const expanded = expandedId === integration.id;
                  const isOpenAI = integration.id === "openai-gpt";
                  const isGoogleCalendar = integration.id === "google-calendar";
                  const openAIStatus: IntegrationStatus = aiHealthLoading ? "disconnected" : aiHealth?.ok ? "connected" : "disconnected";
                  const googleCalendarStatus: IntegrationStatus = calendarStatusLoading ? "disconnected" : calendarStatus?.connected ? "connected" : "disconnected";
                  const badge = STATUS_BADGES[isOpenAI ? openAIStatus : isGoogleCalendar ? googleCalendarStatus : integration.status];
                  const config = configs[integration.id] ?? {};
                  return (
                    <div key={integration.id} className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                      <div className="p-6 flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-2xl">{integration.icon}</span>
                          <div>
                            <h3 className="font-bold text-lg text-slate-900">{integration.name}</h3>
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>
                          </div>
                        </div>
                      </div>
                      <div className="px-6 pb-4 flex-1">
                        <p className="text-sm font-medium text-slate-600 leading-relaxed">{integration.description}</p>
                      </div>
                      <div className="px-6 py-4 border-t border-slate-50">
                        <button type="button" onClick={() => setExpandedId(expanded ? null : integration.id)} className="w-full flex items-center justify-between text-sm font-bold text-indigo-600 hover:text-indigo-800 min-h-[44px]">
                          {expanded ? "Zavřít" : isOpenAI ? "Stav připojení" : isGoogleCalendar ? "Propojit kalendář" : "Konfigurovat"} <ChevronRight size={14} className={expanded ? "rotate-90" : ""} />
                        </button>
                        {expanded && isGoogleCalendar && (
                          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                            {calendarStatusLoading && calendarStatus === null && !calendarStatusError ? (
                              <p className="text-sm text-slate-500 font-medium flex items-center gap-2" role="status">
                                <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> Načítám stav…
                              </p>
                            ) : calendarStatusError ? (
                              <div className="space-y-2">
                                <p className="text-sm text-amber-700 font-medium flex items-center gap-2">
                                  <AlertCircle size={16} className="shrink-0" aria-hidden /> {calendarStatusError}
                                </p>
                                <button type="button" onClick={() => fetchCalendarStatus()} className="wp-btn min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 flex items-center gap-2">
                                  Zkusit znovu
                                </button>
                              </div>
                            ) : calendarStatus?.connected ? (
                              <>
                                {calendarStatus.email && (
                                  <p className="text-sm text-slate-700 font-medium flex items-center gap-2">
                                    <Mail size={14} className="shrink-0 text-slate-500" aria-hidden /> {calendarStatus.email}
                                  </p>
                                )}
                                <button type="button" onClick={handleCalendarDisconnect} disabled={calendarDisconnecting} className="wp-btn mt-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2" aria-busy={calendarDisconnecting}>
                                  {calendarDisconnecting ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> : null}
                                  {calendarDisconnecting ? "Odpojuji…" : "Odpojit Google Kalendář"}
                                </button>
                                <GoogleCalendarUpcomingEvents />
                                <GoogleCalendarAvailability />
                              </>
                            ) : (
                              <button type="button" onClick={handleCalendarConnect} className="wp-btn wp-btn-primary mt-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                                Připojit Google účet
                              </button>
                            )}
                          </div>
                        )}
                        {expanded && isOpenAI && (
                          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                            {aiHealthLoading && !aiHealth ? (
                              <p className="text-sm text-slate-500 font-medium flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Načítám stav…</p>
                            ) : (
                              <>
                                <div className="text-sm">
                                  <p className="font-bold text-slate-700">Model: {aiHealth?.model ?? "—"}</p>
                                  {aiHealth?.latencyMs != null && <p className="text-slate-500 mt-0.5">Latence: {aiHealth.latencyMs} ms</p>}
                                </div>
                                {aiHealth?.fallbackModel && (
                                  <p className="text-sm text-amber-600 font-medium flex items-center gap-1"><AlertCircle size={14} /> Použit fallback model ({aiHealth.fallbackModel}). Primární model nemusí být na účtu dostupný.</p>
                                )}
                                {aiHealth?.error && !aiHealth.ok && (
                                  <p className="text-sm text-red-600 font-medium">{aiHealth.error === "missing_api_key" ? "API klíč není nastaven (OPENAI_API_KEY v .env)." : aiHealth.error}</p>
                                )}
                                <button type="button" onClick={handleTestAIConnection} disabled={aiHealthTesting} className="wp-btn mt-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2">
                                  {aiHealthTesting ? <Loader2 size={16} className="animate-spin" /> : null} Otestovat připojení
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {expanded && integration.configFields && !isGoogleCalendar && (
                          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                            {integration.configFields.map((field) => (
                              <div key={field.key}>
                                <label className={labelClass}>{field.label}</label>
                                <input type={field.type} placeholder={field.placeholder} value={config[field.key] ?? ""} onChange={(e) => setConfigs((prev) => ({ ...prev, [integration.id]: { ...prev[integration.id], [field.key]: e.target.value } }))} className={inputClass} />
                              </div>
                            ))}
                            <button type="button" onClick={() => handleSaveIntegration(integration.id)} className="wp-btn wp-btn-primary mt-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">Uložit konfiguraci</button>
                          </div>
                        )}
                        {expanded && integration.status === "coming_soon" && (
                          <p className="mt-4 text-sm text-blue-500 font-medium">Tato integrace bude dostupná v příští verzi.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab: API */}
        {activeTab === "api" && (
          <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 sm:px-8 py-6 border-b border-slate-50 flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-3">
                  <Server size={20} className="text-blue-500" /> Aidvisora API Přístup
                </h2>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-lg">Aktivní</span>
              </div>
              <div className="p-6 sm:p-8 space-y-6">
                <div>
                  <label className={labelClass}>Váš API Klíč (Secret)</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input type="password" value="••••••••••••••••••••" readOnly className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 min-h-[44px]" />
                    <button type="button" className="px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors shadow-sm font-bold text-sm min-h-[44px]">Zobrazit</button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 font-medium">Tento klíč nikomu nesdělujte. Slouží pro plný přístup k datům ve vašem CRM.</p>
                </div>
                <div className="pt-6 border-t border-slate-100">
                  <label className={labelClass}>Webhook URL (události v reálném čase)</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input type="url" placeholder="https://vasedomena.cz/webhook" className={inputClass} />
                    <button type="button" className="px-6 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors font-bold text-sm min-h-[44px]">Uložit</button>
                  </div>
                </div>
                <div className="pt-2">
                  <a href="#" className="text-sm font-bold text-indigo-600 hover:underline flex items-center gap-1">
                    Otevřít API Dokumentaci <ArrowUpRight size={14} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
