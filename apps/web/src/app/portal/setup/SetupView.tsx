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
  UserCog,
} from "lucide-react";
import { updatePortalProfile, updatePortalPassword } from "@/app/actions/auth";
import { getQuickActionsConfig, setQuickActionsConfig, getAdvisorAvatarUrl, uploadAdvisorAvatar, getAdvisorReportFields, updateAdvisorReportBranding, getNotificationPrefs, setNotificationPrefs } from "@/app/actions/preferences";
import { GoogleCalendarUpcomingEvents } from "@/app/portal/setup/GoogleCalendarUpcomingEvents";
import { GoogleCalendarAvailability } from "@/app/portal/setup/GoogleCalendarAvailability";
import { listTenantMembers } from "@/app/actions/team";
import {
  QUICK_ACTIONS_CATALOG,
  getDefaultQuickActionsConfig,
  type QuickActionId,
} from "@/lib/quick-actions";
import { WorkspaceStripeBilling } from "@/app/components/billing/WorkspaceStripeBilling";
import { useToast } from "@/app/components/Toast";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import type { WorkspaceBillingSnapshot } from "@/lib/stripe/billing-types";

const TABS = [
  { id: "osobni", label: "Osobní údaje", keywords: ["osobní", "údaje", "fakturace", "heslo", "zabezpečení", "2fa", "rychlé", "demo"] },
  { id: "profil", label: "Profil poradce", keywords: ["profil", "poradce", "vizitka", "rezervace", "licence"] },
  { id: "tym", label: "Tým", keywords: ["tým", "člen", "pozvat"] },
  { id: "fakturace", label: "Fakturace a Tarif", keywords: ["fakturace", "tarif", "platba", "faktura"] },
  { id: "notifikace", label: "Notifikace", keywords: ["notifikace", "email", "push"] },
  { id: "integrace", label: "Integrace", keywords: ["integrace", "google", "api", "kalendář"] },
] as const;

type TabId = (typeof TABS)[number]["id"];

export type SetupInitial = {
  userId: string;
  email: string;
  fullName: string | null;
  roleName: string;
  tenantName: string;
  billing?: WorkspaceBillingSnapshot;
};

function parseFullName(full: string | null): { firstName: string; lastName: string } {
  if (!full || !full.trim()) return { firstName: "", lastName: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

type IntegrationCategory = "calendar" | "communication" | "ai";
type IntegrationCard = {
  id: "google-calendar" | "google-drive" | "gmail" | "resend" | "openai-gpt";
  name: string;
  description: string;
  category: IntegrationCategory;
  icon: React.ComponentType;
};
type IntegrationProviderParam = "google-calendar" | "google-drive" | "gmail";

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

const GoogleCalendarLogo = () => (
  <img
    src="/logos/google-calendar.png"
    alt="Google Kalendář"
    className="w-6 h-6 object-contain"
  />
);

const GoogleDriveLogo = () => (
  <img
    src="/logos/google-drive.png"
    alt="Google Disk"
    className="w-6 h-6 object-contain"
  />
);

const GmailLogo = () => (
  <img
    src="/logos/gmail.png"
    alt="Gmail"
    className="w-6 h-6 object-contain"
  />
);

const OpenAIIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="#10a37f">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829v-2.3324a.0804.0804 0 0 1 .0332-.0615l3.852-2.2238a4.4992 4.4992 0 0 1 5.4083 6.9458l-.1419-.0805-4.783-2.7582a.7712.7712 0 0 0-.7805 0l-1.0408.6zM8.4526 4.6592a4.4755 4.4755 0 0 1 2.8764 1.0408l-.1419.0805-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7369l-2.02-1.1686a.071.071 0 0 1-.038-.052V9.153a4.504 4.504 0 0 1 4.4945-4.4938zm9.5891 4.1254a4.4708 4.4708 0 0 1 .5346 3.0137l-.142-.0852-4.783-2.7582a.7712.7712 0 0 0-.7806 0L7.028 12.3235v-2.3324a.0804.0804 0 0 1 .0332-.0615l3.852-2.2238a4.4992 4.4992 0 0 1 6.1408 1.6464z" />
  </svg>
);

const ResendIcon = () => (
  <div className="w-6 h-6 bg-black rounded-md flex items-center justify-center">
    <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  </div>
);

const INTEGRATIONS: IntegrationCard[] = [
  { id: "google-calendar", name: "Google Calendar", description: "Synchronizujte schůzky a události z Aidvisora s Google Kalendářem. Obousměrná synchronizace událostí.", category: "calendar", icon: GoogleCalendarLogo },
  { id: "google-drive", name: "Google Disk", description: "Ukládejte a spravujte dokumenty klientů přímo na Google Disku.", category: "calendar", icon: GoogleDriveLogo },
  { id: "gmail", name: "Gmail", description: "Odesílejte a čtěte e-maily přímo z CRM přes váš Gmail účet.", category: "calendar", icon: GmailLogo },
  { id: "resend", name: "Resend (E-mail)", description: "Bleskové odesílání transakčních a notifikačních e-mailů klientům.", category: "communication", icon: ResendIcon },
  { id: "openai-gpt", name: "OpenAI GPT Mini", description: "AI asistent pro sumarizaci schůzek, generování e-mailů a extrakci dat.", category: "ai", icon: OpenAIIcon },
];

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
  const providerParam = searchParams.get("provider");
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
      await updatePortalProfile(fullName, { phone, ico, company: address });
      setProfileSaved(true);
      toast.showToast("Údaje uloženy");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Uložení selhalo.");
    } finally {
      setProfileSaving(false);
    }
  }, [firstName, lastName, phone, ico, address, toast]);

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

  // --- Team invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Advisor");
  const [inviteSending, setInviteSending] = useState(false);

  // --- Notifications
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({ daily: true, message: true, tasks: true, contracts: true });
  const [notifLoaded, setNotifLoaded] = useState(false);

  useEffect(() => {
    if (activeTab === "notifikace" && !notifLoaded) {
      getNotificationPrefs().then((p) => { setNotifPrefs(p); setNotifLoaded(true); });
    }
  }, [activeTab, notifLoaded]);

  const handleNotifToggle = useCallback((id: string) => {
    setNotifPrefs((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      setNotificationPrefs(next)
        .then(() => toast.showToast("Nastavení notifikací uloženo"))
        .catch(() => toast.showToast("Uložení se nezdařilo", "error"));
      return next;
    });
  }, [toast]);

  // --- Integrations
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [integrationsCategory, setIntegrationsCategory] = useState<string>("all");
  const [aiHealth, setAiHealth] = useState<AIIntegrationHealth | null>(null);
  const [aiHealthLoading, setAiHealthLoading] = useState(false);
  const [aiHealthTesting, setAiHealthTesting] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [calendarStatusLoading, setCalendarStatusLoading] = useState(false);
  const [calendarStatusError, setCalendarStatusError] = useState<string | null>(null);
  const [calendarDisconnecting, setCalendarDisconnecting] = useState(false);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  // Google Drive
  const [driveStatus, setDriveStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [driveStatusError, setDriveStatusError] = useState<string | null>(null);
  const [driveDisconnecting, setDriveDisconnecting] = useState(false);
  // Gmail
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string } | null>(null);
  const [gmailStatusLoading, setGmailStatusLoading] = useState(false);
  const [gmailStatusError, setGmailStatusError] = useState<string | null>(null);
  const [gmailDisconnecting, setGmailDisconnecting] = useState(false);
  // Resend
  const [resendStatus, setResendStatus] = useState<{
    connected: boolean;
    fromEmail: string | null;
    replyToEmail: string | null;
    fromDomain: string | null;
  } | null>(null);
  const [resendStatusLoading, setResendStatusLoading] = useState(false);
  const [resendStatusError, setResendStatusError] = useState<string | null>(null);

  const providerToIntegrationId: Record<IntegrationProviderParam, IntegrationCard["id"]> = useMemo(
    () => ({
      "google-calendar": "google-calendar",
      "google-drive": "google-drive",
      gmail: "gmail",
    }),
    []
  );

  const fetchCalendarStatus = useCallback(async () => {
    setCalendarStatusLoading(true);
    setCalendarStatusError(null);
    try {
      const res = await fetch("/api/calendar/status");
      const data = (await res.json().catch(() => ({}))) as { connected?: boolean; email?: string; error?: string };
      if (!res.ok) {
        setCalendarStatusError(data.error || "Stav se nepodařilo načíst.");
        setCalendarStatus(null);
        return null;
      }
      setCalendarStatus({ connected: !!data.connected, email: data.email });
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

  const handleCalendarSync = useCallback(async () => {
    setCalendarSyncing(true);
    setCalendarStatusError(null);
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: number; updated?: number };
      if (!res.ok) {
        toast.showToast(data.error ?? "Synchronizace kalendáře se nepovedla.", "error");
        return;
      }
      toast.showToast(`Synchronizace hotová: +${data.created ?? 0} nových, ${data.updated ?? 0} upravených.`, "success");
    } catch {
      toast.showToast("Synchronizace kalendáře se nepovedla.", "error");
    } finally {
      setCalendarSyncing(false);
    }
  }, [toast]);

  // --- Google Drive handlers
  const fetchDriveStatus = useCallback(async () => {
    setDriveStatusLoading(true);
    setDriveStatusError(null);
    try {
      const res = await fetch("/api/drive/status");
      const data = (await res.json().catch(() => ({}))) as { connected?: boolean; email?: string; error?: string };
      if (!res.ok) { setDriveStatusError(data.error || "Stav se nepodařilo načíst."); setDriveStatus(null); return; }
      setDriveStatus({ connected: !!data.connected, email: data.email });
    } catch { setDriveStatusError("Stav se nepodařilo načíst."); setDriveStatus(null); }
    finally { setDriveStatusLoading(false); }
  }, []);
  const handleDriveConnect = useCallback(() => { window.location.href = "/api/integrations/google-drive/connect"; }, []);
  const handleDriveDisconnect = useCallback(async () => {
    if (!window.confirm("Opravdu chcete odpojit Google Drive?")) return;
    setDriveDisconnecting(true);
    try {
      const res = await fetch("/api/drive/disconnect", { method: "POST" });
      if (res.ok) { await fetchDriveStatus(); toast.showToast("Google Drive byl odpojen.", "success"); }
      else { const d = (await res.json().catch(() => ({}))) as { error?: string }; toast.showToast(d.error ?? "Odpojení se nepovedlo.", "error"); }
    } catch { toast.showToast("Odpojení se nepovedlo.", "error"); }
    finally { setDriveDisconnecting(false); }
  }, [fetchDriveStatus, toast]);

  // --- Gmail handlers
  const fetchGmailStatus = useCallback(async () => {
    setGmailStatusLoading(true);
    setGmailStatusError(null);
    try {
      const res = await fetch("/api/gmail/status");
      const data = (await res.json().catch(() => ({}))) as { connected?: boolean; email?: string; error?: string };
      if (!res.ok) { setGmailStatusError(data.error || "Stav se nepodařilo načíst."); setGmailStatus(null); return; }
      setGmailStatus({ connected: !!data.connected, email: data.email });
    } catch { setGmailStatusError("Stav se nepodařilo načíst."); setGmailStatus(null); }
    finally { setGmailStatusLoading(false); }
  }, []);
  const handleGmailConnect = useCallback(() => { window.location.href = "/api/integrations/gmail/connect"; }, []);
  const handleGmailDisconnect = useCallback(async () => {
    if (!window.confirm("Opravdu chcete odpojit Gmail?")) return;
    setGmailDisconnecting(true);
    try {
      const res = await fetch("/api/gmail/disconnect", { method: "POST" });
      if (res.ok) { await fetchGmailStatus(); toast.showToast("Gmail byl odpojen.", "success"); }
      else { const d = (await res.json().catch(() => ({}))) as { error?: string }; toast.showToast(d.error ?? "Odpojení se nepovedlo.", "error"); }
    } catch { toast.showToast("Odpojení se nepovedlo.", "error"); }
    finally { setGmailDisconnecting(false); }
  }, [fetchGmailStatus, toast]);

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

  const fetchResendStatus = useCallback(async () => {
    setResendStatusLoading(true);
    setResendStatusError(null);
    try {
      const res = await fetch("/api/resend/status");
      const data = (await res.json().catch(() => ({}))) as {
        connected?: boolean;
        fromEmail?: string | null;
        replyToEmail?: string | null;
        fromDomain?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setResendStatusError(data.error ?? "Stav Resendu se nepodařilo načíst.");
        setResendStatus(null);
        return;
      }
      setResendStatus({
        connected: !!data.connected,
        fromEmail: data.fromEmail ?? null,
        replyToEmail: data.replyToEmail ?? null,
        fromDomain: data.fromDomain ?? null,
      });
    } catch {
      setResendStatusError("Stav Resendu se nepodařilo načíst.");
      setResendStatus(null);
    } finally {
      setResendStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "integrace") {
      setAiHealthLoading(true);
      fetchAiHealth().finally(() => setAiHealthLoading(false));
      fetchCalendarStatus();
      fetchDriveStatus();
      fetchGmailStatus();
      fetchResendStatus();
    }
  }, [activeTab, fetchAiHealth, fetchCalendarStatus, fetchDriveStatus, fetchGmailStatus, fetchResendStatus]);

  useEffect(() => {
    const calendar = searchParams.get("calendar");
    const calendarError = searchParams.get("calendar_error");
    if (calendar === "connected") toast.showToast("Google Kalendář byl úspěšně propojen.", "success");
    if (calendarError) toast.showToast(calendarError === "access_denied" ? "Připojení bylo zrušeno." : "Připojení se nepovedlo.", "error");
    const drive = searchParams.get("drive");
    const driveError = searchParams.get("drive_error");
    if (drive === "connected") toast.showToast("Google Drive byl úspěšně propojen.", "success");
    if (driveError) toast.showToast(driveError === "access_denied" ? "Připojení bylo zrušeno." : "Připojení Drive se nepovedlo.", "error");
    const gmail = searchParams.get("gmail");
    const gmailError = searchParams.get("gmail_error");
    if (gmail === "connected") toast.showToast("Gmail byl úspěšně propojen.", "success");
    if (gmailError) toast.showToast(gmailError === "access_denied" ? "Připojení bylo zrušeno." : "Připojení Gmailu se nepovedlo.", "error");
  }, [searchParams, toast]);

  useEffect(() => {
    if (activeTab !== "integrace") return;
    if (!providerParam) return;
    if (!(providerParam in providerToIntegrationId)) return;

    const integrationId = providerToIntegrationId[providerParam as IntegrationProviderParam];
    setIntegrationsCategory("calendar");
    setExpandedId(integrationId);

    requestAnimationFrame(() => {
      const el = document.getElementById(`integration-card-${integrationId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [activeTab, providerParam, providerToIntegrationId]);

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
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-aidv-create text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-aidv-create-hover transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]"
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

              {/* Demo data action intentionally removed from production setup */}

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
                      className="flex items-center gap-2 px-10 py-3.5 bg-aidv-create text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-aidv-create-hover transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0 min-h-[44px]"
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
                  <a href="https://jerrs.cnb.cz/apljerrsdad/JERRS.WEB09.DIRECT_FIND?p_lang=cz" target="_blank" rel="noopener noreferrer" className="w-full py-3 mt-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 min-h-[44px]">
                    Vyhledat v registru ČNB
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
              <Link href="/portal/team-overview" className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors min-h-[44px]">
                <Users size={16} /> Otevřít správu týmu
              </Link>
            </div>
            <div className="px-6 sm:px-8 py-4 bg-slate-50 border-b border-slate-100">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Pozvat nového člena</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!inviteEmail.trim()) return;
                  setInviteSending(true);
                  try {
                    toast.showToast(`Pozvánka odeslána na ${inviteEmail}`);
                    setInviteEmail("");
                  } catch {
                    toast.showToast("Pozvánku se nepodařilo odeslat.", "error");
                  } finally {
                    setInviteSending(false);
                  }
                }}
                className="flex flex-wrap items-center gap-3"
              >
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@kolegy.cz"
                  className="flex-1 min-w-[200px] px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-200 min-h-[44px]"
                  required
                />
                <CustomDropdown
                  value={inviteRole}
                  onChange={setInviteRole}
                  options={[
                    { id: "Advisor", label: "Poradce" },
                    { id: "Assistant", label: "Asistent" },
                    { id: "Admin", label: "Admin" },
                  ]}
                  placeholder="Role"
                  icon={UserCog}
                />
                <button
                  type="submit"
                  disabled={inviteSending || !inviteEmail.trim()}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 min-h-[44px] transition-colors"
                >
                  {inviteSending ? "Odesílám…" : "Pozvat"}
                </button>
              </form>
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
              <div className="bg-gradient-to-br from-aidv-create to-slate-800 rounded-[24px] p-8 text-white shadow-xl">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Aktuální tarif</h3>
                <div className="flex flex-col gap-1 mb-6">
                  <span className="text-3xl sm:text-4xl font-black tracking-tight leading-tight break-words">
                    {initial.billing?.plan ?? "Zatím bez aktivního plánu"}
                  </span>
                  {initial.billing?.subscriptionStatus ? (
                    <span className="text-sm font-bold text-slate-400">
                      Stav: {initial.billing.subscriptionStatus}
                    </span>
                  ) : null}
                  {initial.billing?.currentPeriodEnd ? (
                    <span className="text-sm font-medium text-slate-400">
                      Období do{" "}
                      {new Date(initial.billing.currentPeriodEnd).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle size={16} className="text-emerald-400 shrink-0" /> Neomezení klienti</div>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle size={16} className="text-emerald-400 shrink-0" /> AI Asistent</div>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle size={16} className="text-emerald-400 shrink-0" /> Týmová spolupráce</div>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle size={16} className="text-emerald-400 shrink-0" /> Finanční analýzy</div>
                </div>
                <div className="text-xs text-slate-500 mb-4 space-y-1">
                  <p>Přehled cen a tarifů na webu: Starter / Pro / Team.</p>
                  <p>
                    Více na{" "}
                    <a href="https://www.aidvisora.cz" target="_blank" rel="noopener noreferrer" className="underline text-indigo-300 hover:text-white">
                      aidvisora.cz
                    </a>
                  </p>
                </div>
                <a
                  href="https://www.aidvisora.cz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-white text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-colors min-h-[44px] inline-flex items-center justify-center"
                >
                  Porovnat tarify na webu
                </a>
              </div>
            </div>
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-2">
                  <CreditCard size={22} className="text-slate-400 shrink-0" />
                  <h2 className="text-lg font-black text-slate-900">Předplatné a platby</h2>
                </div>
                <p className="text-sm text-slate-500 mb-6 max-w-xl">
                  Zde zahájíte předplatné přes Stripe Checkout nebo otevřete Customer Portal (karty, faktury, zrušení).
                </p>
                {initial.billing ? (
                  <WorkspaceStripeBilling billing={initial.billing} billingContext="setup" showTitle={false} />
                ) : (
                  <p className="text-sm text-slate-500">
                    Správa předplatného vyžaduje Stripe na serveru (STRIPE_SECRET_KEY + STRIPE_PRICE_*_* nebo STRIPE_PRICE_ID) a migraci{" "}
                    <code className="text-xs bg-slate-100 px-1 rounded">add_stripe_workspace_billing.sql</code>.
                  </p>
                )}
              </div>
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden h-full">
                <div className="px-6 sm:px-8 py-6 border-b border-slate-50">
                  <h2 className="text-lg font-black text-slate-900">Historie plateb</h2>
                </div>
                <div className="p-4 sm:p-6">
                  <p className="text-sm text-slate-500 text-center py-4">
                    Detail faktur a historii najdete ve Stripe Customer Portalu (tlačítko „Spravovat platby a faktury“ výše).
                  </p>
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
                  { title: "Denní souhrn (Agenda)", desc: "Každé ráno v 8:00 zašleme přehled schůzek a úkolů na daný den.", id: "daily" },
                  { title: "Nová zpráva od klienta", desc: "Okamžité upozornění, pokud vám klient zanechá vzkaz v portálu.", id: "message" },
                  { title: "Zpožděné úkoly", desc: "Upozornění na úkoly, které jsou více než 24 hodin po termínu.", id: "tasks" },
                  { title: "Expirace smluv", desc: "Týdenní souhrn smluv, kterým se blíží konec fixace nebo výročí.", id: "contracts" },
                ].map((notif) => (
                  <div key={notif.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors min-h-[44px] gap-3">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm mb-1">{notif.title}</h4>
                      <p className="text-xs font-medium text-slate-500">{notif.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-2 shrink-0">
                      <input type="checkbox" className="sr-only peer" checked={notifPrefs[notif.id] ?? true} onChange={() => handleNotifToggle(notif.id)} />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-aidv-create" />
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
                  <p className="text-xs font-medium text-slate-500">Pro okamžitá upozornění na obrazovce, i když nemáte Aidvisoru otevřenou.</p>
                </div>
                <button type="button" onClick={() => toast.showToast("Tato funkce bude dostupná v příští verzi.")} className="px-4 py-2.5 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors shadow-sm min-h-[44px]">
                  Požádat o oprávnění
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Integrace */}
        {activeTab === "integrace" && (
          <div className="animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-8 border-b border-slate-200">
              <div>
                <h2 className="text-xl font-black text-slate-900 mb-1">Integrace a propojené aplikace</h2>
                <p className="text-sm font-medium text-slate-500">Zrychlete svou práci a propojte Aidvisoru s nástroji, které používáte každý den.</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:shadow-md hover:bg-slate-50 transition-all min-h-[44px]">
                  <Server size={16} /> Filtry
                </button>
                <button type="button" onClick={() => toast.showToast("Díky, návrhy integrací sbíráme průběžně.")} className="flex items-center gap-2 px-5 py-2.5 bg-aidv-create text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-aidv-create-hover transition-all hover:-translate-y-0.5 active:scale-95 min-h-[44px]">
                  <Check size={16} /> Navrhnout integraci
                </button>
              </div>
            </div>
            <div className="flex flex-col lg:flex-row items-start gap-12">
              <div className="w-full lg:w-64 flex-shrink-0 flex flex-wrap lg:flex-col gap-1">
                {[
                  { id: "all", label: "Zobrazit všechny" },
                  { id: "calendar", label: "Kalendář a E-mail" },
                  { id: "communication", label: "Komunikace" },
                  { id: "ai", label: "Nástroje AI" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setIntegrationsCategory(cat.id)}
                    className={`flex items-center px-5 py-3 rounded-xl text-sm font-bold transition-all text-left min-h-[44px] ${integrationsCategory === cat.id ? "bg-indigo-50 text-indigo-700" : "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
                {INTEGRATIONS.filter((i) => {
                  if (integrationsCategory === "all") return true;
                  if (integrationsCategory === "calendar") {
                    return i.id === "google-calendar" || i.id === "google-drive" || i.id === "gmail";
                  }
                  return i.category === integrationsCategory;
                }).map((integration) => {
                  const expanded = expandedId === integration.id;
                  const isOpenAI = integration.id === "openai-gpt";
                  const isGoogleCalendar = integration.id === "google-calendar";
                  const isGoogleDrive = integration.id === "google-drive";
                  const isGmail = integration.id === "gmail";
                  const isResend = integration.id === "resend";
                  const isConnected =
                    isGoogleCalendar ? !!calendarStatus?.connected
                    : isGoogleDrive ? !!driveStatus?.connected
                    : isGmail ? !!gmailStatus?.connected
                    : isResend ? !!resendStatus?.connected
                    : !!aiHealth?.ok;
                  const Icon = integration.icon;
                  const toggleDisabled = isResend || isOpenAI || (isGoogleCalendar && calendarStatusLoading) || (isGoogleDrive && driveStatusLoading) || (isGmail && gmailStatusLoading);
                  const handleToggleClick = () => {
                    if (isGoogleCalendar) {
                      if (calendarStatus?.connected) handleCalendarDisconnect();
                      else handleCalendarConnect();
                      return;
                    }
                    if (isGoogleDrive) {
                      if (driveStatus?.connected) handleDriveDisconnect();
                      else handleDriveConnect();
                      return;
                    }
                    if (isGmail) {
                      if (gmailStatus?.connected) handleGmailDisconnect();
                      else handleGmailConnect();
                      return;
                    }
                  };
                  return (
                    <div
                      key={integration.id}
                      id={`integration-card-${integration.id}`}
                      className={`bg-white rounded-[24px] border transition-all duration-300 flex flex-col group ${isConnected ? "border-indigo-200 shadow-md" : "border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200"}`}
                    >
                      <div className="p-6 flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm transition-colors ${isConnected ? "bg-white border-indigo-100" : "bg-slate-50 border-slate-100 grayscale-[0.5]"}`}>
                            <Icon />
                          </div>
                          <h3 className="font-bold text-lg text-slate-900">{integration.name}</h3>
                        </div>
                        <label className={`relative inline-flex items-center mt-2 ${toggleDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}>
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isConnected}
                            onChange={handleToggleClick}
                            disabled={toggleDisabled}
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-aidv-create" />
                        </label>
                      </div>
                      <div className="px-6 pb-6 flex-1">
                        <p className={`text-sm font-medium leading-relaxed transition-colors ${isConnected ? "text-slate-600" : "text-slate-500"}`}>{integration.description}</p>
                      </div>
                      <div className={`px-6 py-4 bg-slate-50/80 border-t flex items-center justify-between rounded-b-[24px] transition-all ${isConnected ? "border-indigo-50" : "border-slate-50"}`}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : integration.id)}
                          className={`text-sm font-bold flex items-center gap-1 transition-colors ${isConnected ? "text-indigo-600 hover:text-indigo-800" : "text-slate-500 hover:text-slate-800"}`}
                        >
                          {isConnected ? "Spravovat nastavení" : "Zobrazit detaily"} <ChevronRight size={14} className={expanded ? "rotate-90" : ""} />
                        </button>
                      </div>
                      {expanded && (
                        <div className="px-6 pb-6 space-y-3 border-t border-slate-100 pt-4">
                        {expanded && isGoogleCalendar && (
                          <div className="space-y-3">
                            {calendarStatusLoading && calendarStatus === null && !calendarStatusError ? (
                              <p className="text-sm text-slate-500 font-medium flex items-center gap-2" role="status">
                                <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> Načítám stav…
                              </p>
                            ) : calendarStatusError ? (
                              <div className="space-y-2">
                                <p className="text-sm text-amber-700 font-medium flex items-center gap-2">
                                  <AlertCircle size={16} className="shrink-0" aria-hidden /> {calendarStatusError}
                                </p>
                                <button type="button" onClick={() => fetchCalendarStatus()} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 flex items-center gap-2">
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
                                <button type="button" onClick={handleCalendarSync} disabled={calendarSyncing} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold hover:bg-indigo-100 disabled:opacity-60 flex items-center gap-2" aria-busy={calendarSyncing}>
                                  {calendarSyncing ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> : null}
                                  {calendarSyncing ? "Synchronizuji…" : "Synchronizovat teď"}
                                </button>
                                <button type="button" onClick={handleCalendarDisconnect} disabled={calendarDisconnecting} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2" aria-busy={calendarDisconnecting}>
                                  {calendarDisconnecting ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> : null}
                                  {calendarDisconnecting ? "Odpojuji…" : "Odpojit Google Kalendář"}
                                </button>
                                <GoogleCalendarUpcomingEvents />
                                <GoogleCalendarAvailability />
                              </>
                            ) : (
                              <button type="button" onClick={handleCalendarConnect} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                                Připojit Google účet
                              </button>
                            )}
                          </div>
                        )}
                        {expanded && isGoogleDrive && (
                          <div className="space-y-3">
                            {driveStatusLoading && driveStatus === null && !driveStatusError ? (
                              <p className="text-sm text-slate-500 font-medium flex items-center gap-2" role="status"><Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> Načítám stav…</p>
                            ) : driveStatusError ? (
                              <div className="space-y-2">
                                <p className="text-sm text-amber-700 font-medium flex items-center gap-2"><AlertCircle size={16} className="shrink-0" aria-hidden /> {driveStatusError}</p>
                                <button type="button" onClick={() => fetchDriveStatus()} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 flex items-center gap-2">Zkusit znovu</button>
                              </div>
                            ) : driveStatus?.connected ? (
                              <>
                                {driveStatus.email && (
                                  <p className="text-sm text-slate-700 font-medium flex items-center gap-2"><Mail size={14} className="shrink-0 text-slate-500" aria-hidden /> {driveStatus.email}</p>
                                )}
                                <Link
                                  href="/portal/tools/drive"
                                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 inline-flex items-center justify-center"
                                >
                                  Otevřít Google Drive workspace
                                </Link>
                                <button type="button" onClick={handleDriveDisconnect} disabled={driveDisconnecting} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2" aria-busy={driveDisconnecting}>
                                  {driveDisconnecting ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> : null}
                                  {driveDisconnecting ? "Odpojuji…" : "Odpojit Google Drive"}
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={handleDriveConnect} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                                Připojit Google Drive
                              </button>
                            )}
                          </div>
                        )}
                        {expanded && isGmail && (
                          <div className="space-y-3">
                            {gmailStatusLoading && gmailStatus === null && !gmailStatusError ? (
                              <p className="text-sm text-slate-500 font-medium flex items-center gap-2" role="status"><Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> Načítám stav…</p>
                            ) : gmailStatusError ? (
                              <div className="space-y-2">
                                <p className="text-sm text-amber-700 font-medium flex items-center gap-2"><AlertCircle size={16} className="shrink-0" aria-hidden /> {gmailStatusError}</p>
                                <button type="button" onClick={() => fetchGmailStatus()} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 flex items-center gap-2">Zkusit znovu</button>
                              </div>
                            ) : gmailStatus?.connected ? (
                              <>
                                {gmailStatus.email && (
                                  <p className="text-sm text-slate-700 font-medium flex items-center gap-2"><Mail size={14} className="shrink-0 text-slate-500" aria-hidden /> {gmailStatus.email}</p>
                                )}
                                <Link
                                  href="/portal/tools/gmail"
                                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 inline-flex items-center justify-center"
                                >
                                  Otevřít Gmail workspace
                                </Link>
                                <button type="button" onClick={handleGmailDisconnect} disabled={gmailDisconnecting} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2" aria-busy={gmailDisconnecting}>
                                  {gmailDisconnecting ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden /> : null}
                                  {gmailDisconnecting ? "Odpojuji…" : "Odpojit Gmail"}
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={handleGmailConnect} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">
                                Připojit Gmail
                              </button>
                            )}
                          </div>
                        )}
                        {expanded && isOpenAI && (
                          <div className="space-y-3">
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
                                <button type="button" onClick={handleTestAIConnection} disabled={aiHealthTesting} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60 flex items-center gap-2">
                                  {aiHealthTesting ? <Loader2 size={16} className="animate-spin" /> : null} Otestovat připojení
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {expanded && isResend && (
                          <div className="space-y-3">
                            {resendStatusLoading && resendStatus === null && !resendStatusError ? (
                              <p className="text-sm text-slate-500 font-medium flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Načítám stav…</p>
                            ) : resendStatusError ? (
                              <>
                                <p className="text-sm text-amber-700 font-medium flex items-center gap-2"><AlertCircle size={16} className="shrink-0" /> {resendStatusError}</p>
                                <button type="button" onClick={fetchResendStatus} className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200">
                                  Zkusit znovu
                                </button>
                              </>
                            ) : (
                              <>
                                <p className={`text-sm font-medium ${resendStatus?.connected ? "text-emerald-700" : "text-amber-700"}`}>
                                  {resendStatus?.connected ? "Resend je nakonfigurovaný." : "Resend zatím není nakonfigurovaný (chybí RESEND_API_KEY)."}
                                </p>
                                <p className="text-xs text-slate-500">
                                  Odesílatel (From): <span className="font-bold text-slate-700">{resendStatus?.fromEmail ?? "—"}</span>
                                </p>
                                <p className="text-xs text-slate-500">
                                  Doména pro generovaný From:{" "}
                                  <span className="font-bold text-slate-700">{resendStatus?.fromDomain ?? "—"}</span>
                                  <span className="block text-slate-400 mt-0.5">
                                    Env <code className="text-[11px]">RESEND_FROM_DOMAIN</code> nebo z <code className="text-[11px]">RESEND_FROM_EMAIL</code>.
                                  </span>
                                </p>
                                <p className="text-xs text-slate-500">
                                  Odpovědi (Reply-To):{" "}
                                  <span className="font-bold text-slate-700">{resendStatus?.replyToEmail ?? "—"}</span>
                                  <span className="block text-slate-400 mt-0.5">
                                    Firemní e-mail bez ověření domény v Resend nastav jako <code className="text-[11px]">RESEND_REPLY_TO</code>; u přihlášeného poradce
                                    jde o e-mail z profilu / účtu.
                                  </span>
                                </p>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await fetchResendStatus();
                                    toast.showToast("Konfigurace Resendu ověřena.");
                                  }}
                                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200"
                                >
                                  Ověřit konfiguraci
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
