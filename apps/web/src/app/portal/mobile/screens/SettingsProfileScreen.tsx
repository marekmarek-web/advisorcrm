"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getAdvisorAvatarUrl,
  getNotificationPrefs,
  getQuickActionsConfig,
  setNotificationPrefs,
  setQuickActionsConfig,
  updateAdvisorReportBranding,
  uploadAdvisorAvatar,
} from "@/app/actions/preferences";
import { listSupervisorOptions, updatePortalPassword, updatePortalProfile, type SupervisorOption } from "@/app/actions/auth";
import { getDefaultQuickActionsConfig } from "@/lib/quick-actions";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
  SettingsGroupCard,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

type NotificationPrefs = Record<string, boolean>;

export function SettingsProfileScreen({
  advisorName,
}: {
  advisorName: string;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [ico, setIco] = useState("");
  const [company, setCompany] = useState("");
  const [fullName, setFullName] = useState(advisorName);
  const [supervisorUserId, setSupervisorUserId] = useState("");
  const [supervisorOptions, setSupervisorOptions] = useState<SupervisorOption[]>([]);
  const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>({
    daily: true,
    message: true,
    tasks: true,
    contracts: true,
  });
  const [quickActions, setQuickActions] = useState(getDefaultQuickActionsConfig());
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPhone, setReportPhone] = useState("");
  const [reportWebsite, setReportWebsite] = useState("");

  const visibleQuickActionsCount = useMemo(
    () => Object.values(quickActions.visible ?? {}).filter(Boolean).length,
    [quickActions.visible]
  );

  function load() {
    startTransition(async () => {
      setError(null);
      try {
        const [avatar, prefs, quick, supervisors] = await Promise.all([
          getAdvisorAvatarUrl(),
          getNotificationPrefs(),
          getQuickActionsConfig(),
          listSupervisorOptions(),
        ]);
        setAvatarUrl(avatar);
        setNotificationPrefsState(prefs);
        setQuickActions(quick);
        setSupervisorOptions(supervisors);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nastavení se nepodařilo načíst.");
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  function showSuccess(message: string) {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 2000);
  }

  async function saveProfile() {
    startTransition(async () => {
      setError(null);
      try {
        await updatePortalProfile(fullName, { phone, ico, company }, supervisorUserId || null);
        setProfileOpen(false);
        showSuccess("Profil byl uložen.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Profil se nepodařilo uložit.");
      }
    });
  }

  async function saveNotifications() {
    startTransition(async () => {
      setError(null);
      try {
        await setNotificationPrefs(notificationPrefs);
        setNotificationOpen(false);
        showSuccess("Notifikační preference byly uloženy.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Preference se nepodařilo uložit.");
      }
    });
  }

  async function saveQuickActions() {
    startTransition(async () => {
      setError(null);
      try {
        await setQuickActionsConfig(quickActions.order, quickActions.visible);
        showSuccess("Rychlé akce byly uloženy.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rychlé akce se nepodařilo uložit.");
      }
    });
  }

  async function savePassword() {
    if (!password || password !== passwordConfirm) {
      setError("Hesla se neshodují.");
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        await updatePortalPassword(password);
        setPassword("");
        setPasswordConfirm("");
        setSecurityOpen(false);
        showSuccess("Heslo bylo změněno.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Heslo se nepodařilo změnit.");
      }
    });
  }

  async function saveReportFields() {
    startTransition(async () => {
      setError(null);
      try {
        await updateAdvisorReportBranding({ phone: reportPhone, website: reportWebsite });
        setReportOpen(false);
        showSuccess("Report branding byl uložen.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Report branding se nepodařilo uložit.");
      }
    });
  }

  async function onAvatarSelected(file: File | null) {
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      setError(null);
      try {
        const next = await uploadAdvisorAvatar(formData);
        setAvatarUrl(next);
        showSuccess("Avatar byl aktualizován.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Avatar se nepodařilo nahrát.");
      }
    });
  }

  if (pending && !avatarUrl && !success && !error) {
    return <LoadingSkeleton rows={3} />;
  }

  return (
    <>
      {error ? <ErrorState title={error} onRetry={load} /> : null}
      {success ? (
        <MobileCard className="border-emerald-200 bg-emerald-50/70 p-3">
          <p className="text-sm font-semibold text-emerald-700">{success}</p>
        </MobileCard>
      ) : null}

      <MobileSection title="Profil a nastavení">
        <MobileCard>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden grid place-items-center">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-black text-slate-600">{(fullName || advisorName).slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{fullName || advisorName}</p>
              <p className="text-xs text-slate-500">Advisor profil</p>
            </div>
          </div>
          <label className="mt-3 inline-flex items-center justify-center min-h-[40px] rounded-lg border border-slate-200 px-3 text-xs font-bold cursor-pointer">
            Změnit avatar
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarSelected(e.target.files?.[0] ?? null)} />
          </label>
        </MobileCard>
      </MobileSection>

      <SettingsGroupCard title="Účet" description="Profil, bezpečnost a role">
        <button type="button" onClick={() => setProfileOpen(true)} className="w-full min-h-[44px] rounded-xl border border-slate-200 text-left px-3 text-sm font-semibold">Upravit osobní údaje</button>
        <button type="button" onClick={() => setSecurityOpen(true)} className="w-full min-h-[44px] rounded-xl border border-slate-200 text-left px-3 text-sm font-semibold">Změnit heslo</button>
      </SettingsGroupCard>

      <SettingsGroupCard title="Notifikace a workflow" description="Notifikační preference a quick actions">
        <button type="button" onClick={() => setNotificationOpen(true)} className="w-full min-h-[44px] rounded-xl border border-slate-200 text-left px-3 text-sm font-semibold">Notifikační preference</button>
        <button type="button" onClick={saveQuickActions} className="w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-left px-3 text-sm font-semibold text-indigo-700">
          Uložit quick actions ({visibleQuickActionsCount})
        </button>
      </SettingsGroupCard>

      <SettingsGroupCard title="Integrace a reporty">
        <button type="button" onClick={() => setReportOpen(true)} className="w-full min-h-[44px] rounded-xl border border-slate-200 text-left px-3 text-sm font-semibold">
          Report branding (telefon / web)
        </button>
        <a href="/api/integrations/google-calendar/connect" className="w-full min-h-[44px] rounded-xl border border-slate-200 text-left px-3 text-sm font-semibold inline-flex items-center">
          Připojit Google Calendar
        </a>
      </SettingsGroupCard>

      <BottomSheet open={profileOpen} onClose={() => setProfileOpen(false)} title="Osobní údaje">
        <div className="space-y-3">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Jméno a příjmení" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Telefon" />
          <input value={ico} onChange={(e) => setIco(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="IČO" />
          <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Společnost / adresa" />
          <select value={supervisorUserId} onChange={(e) => setSupervisorUserId(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white">
            <option value="">Bez nadřízeného</option>
            {supervisorOptions.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.displayName} ({item.roleName})
              </option>
            ))}
          </select>
          <button type="button" onClick={saveProfile} className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold">Uložit profil</button>
        </div>
      </BottomSheet>

      <BottomSheet open={notificationOpen} onClose={() => setNotificationOpen(false)} title="Notifikační preference">
        <div className="space-y-2">
          {[
            { key: "daily", label: "Denní souhrn" },
            { key: "message", label: "Nové zprávy" },
            { key: "tasks", label: "Úkoly" },
            { key: "contracts", label: "AI smlouvy" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                setNotificationPrefsState((prev) => ({
                  ...prev,
                  [item.key]: !prev[item.key],
                }))
              }
              className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-left text-sm font-semibold flex items-center justify-between"
            >
              <span>{item.label}</span>
              <StatusBadge tone={notificationPrefs[item.key] ? "success" : "neutral"}>
                {notificationPrefs[item.key] ? "ON" : "OFF"}
              </StatusBadge>
            </button>
          ))}
          <button type="button" onClick={saveNotifications} className="w-full min-h-[44px] rounded-xl bg-[#1a1c2e] text-white text-sm font-bold">Uložit preference</button>
        </div>
      </BottomSheet>

      <BottomSheet open={securityOpen} onClose={() => setSecurityOpen(false)} title="Změna hesla">
        <div className="space-y-3">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Nové heslo" />
          <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Potvrzení hesla" />
          <button type="button" onClick={savePassword} className="w-full min-h-[44px] rounded-xl bg-rose-600 text-white text-sm font-bold">Uložit nové heslo</button>
        </div>
      </BottomSheet>

      <BottomSheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report branding">
        <div className="space-y-3">
          <input value={reportPhone} onChange={(e) => setReportPhone(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Telefon do reportu" />
          <input value={reportWebsite} onChange={(e) => setReportWebsite(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Web do reportu" />
          <button type="button" onClick={saveReportFields} className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold">Uložit report údaje</button>
        </div>
      </BottomSheet>

      <MobileSection title="Session">
        <a href="/" className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold inline-flex items-center justify-center">
          Odhlásit se
        </a>
      </MobileSection>

      {pending && !error ? <LoadingSkeleton rows={1} /> : null}
      {!pending && !avatarUrl && !fullName ? <EmptyState title="Nastavení je prázdné" /> : null}
    </>
  );
}
