"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  User,
  Bell,
  BellOff,
  Shield,
  Smartphone,
  Calendar,
  Mail,
  FolderOpen,
  LogOut,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Camera,
  FileText,
  Cake,
} from "lucide-react";
import {
  getAdvisorAvatarUrl,
  getNotificationPrefs,
  getQuickActionsConfig,
  setNotificationPrefs,
  setQuickActionsConfig,
  updateAdvisorReportBranding,
  uploadAdvisorAvatar,
  getAdvisorBirthdayEmailPrefs,
  updateAdvisorBirthdayEmailPrefs,
} from "@/app/actions/preferences";
import { getWorkspaceBirthdayEmailTheme, setWorkspaceBirthdayEmailTheme } from "@/app/actions/birthday-greetings";
import type { RoleName } from "@/shared/rolePermissions";
import {
  listSupervisorOptions,
  updatePortalPassword,
  updatePortalProfile,
  type SupervisorOption,
} from "@/app/actions/auth";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { getDefaultQuickActionsConfig, QUICK_ACTIONS_CATALOG, type QuickActionId } from "@/lib/quick-actions";
import { usePushNotifications } from "@/lib/push/usePushNotifications";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import { signOutAndRedirectClient } from "@/lib/auth/sign-out-client";
import { openIntegrationConnect } from "@/lib/native/open-integration-connect";

type NotificationPrefs = Record<string, boolean>;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function SettingsRow({
  icon: Icon,
  label,
  sublabel,
  onClick,
  right,
  danger,
}: {
  icon?: React.ElementType;
  label: string;
  sublabel?: string;
  onClick?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full min-h-[52px] flex items-center gap-3 px-0 py-2 text-left transition-colors",
        danger ? "text-rose-600" : "text-[color:var(--wp-text)]"
      )}
    >
      {Icon ? (
        <div className={cx(
          "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
          danger ? "bg-rose-50 text-rose-500" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
        )}>
          <Icon size={17} />
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        <p className={cx("text-sm font-bold truncate", danger ? "text-rose-600" : "text-[color:var(--wp-text)]")}>
          {label}
        </p>
        {sublabel ? <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">{sublabel}</p> : null}
      </div>
      {right ?? <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0" />}
    </button>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 mt-4 first:mt-0">
        {title}
      </p>
      <MobileCard className="divide-y divide-[color:var(--wp-surface-card-border)] py-0 px-4">
        {children}
      </MobileCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Push notifications section                                         */
/* ------------------------------------------------------------------ */

function PushNotificationsRow() {
  const { isSupported, permissionState, token, requestSystemPermission, syncPermissions } =
    usePushNotifications();

  useEffect(() => {
    if (isSupported) void syncPermissions();
  }, [isSupported, syncPermissions]);

  if (!isSupported) {
    return (
      <SettingsRow
        icon={Bell}
        label="Push notifikace"
        sublabel="Dostupné pouze v nativní aplikaci"
        right={<StatusBadge tone="neutral">Web</StatusBadge>}
      />
    );
  }

  if (permissionState === "granted") {
    return (
      <SettingsRow
        icon={Bell}
        label="Push notifikace"
        sublabel={token ? "Zařízení registrováno" : "Zapnuto"}
        right={
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-500" />
            <StatusBadge tone="success">Zapnuto</StatusBadge>
          </div>
        }
      />
    );
  }

  if (permissionState === "denied") {
    return (
      <SettingsRow
        icon={BellOff}
        label="Push notifikace"
        sublabel="Zakázáno v nastavení systému"
        right={
          <div className="flex items-center gap-1.5">
            <AlertCircle size={14} className="text-rose-500" />
            <StatusBadge tone="danger">Blokováno</StatusBadge>
          </div>
        }
      />
    );
  }

  return (
    <SettingsRow
      icon={Bell}
      label="Povolit push notifikace"
      sublabel="Dostávejte upozornění na nové zprávy a úkoly"
      onClick={requestSystemPermission}
      right={
        <button
          type="button"
          onClick={requestSystemPermission}
          className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg min-h-[32px]"
        >
          Povolit
        </button>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function SettingsProfileScreen({
  advisorName,
  roleName = "Advisor",
}: {
  advisorName: string;
  roleName?: RoleName;
}) {
  const router = useRouter();
  const [logoutSigningOut, setLogoutSigningOut] = useState(false);
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
  const [quickActionsSheetOpen, setQuickActionsSheetOpen] = useState(false);
  const [quickEditOrder, setQuickEditOrder] = useState<QuickActionId[]>([]);
  const [quickEditVisible, setQuickEditVisible] = useState<Record<string, boolean>>({});
  const [quickSaving, setQuickSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [reportPhone, setReportPhone] = useState("");
  const [reportWebsite, setReportWebsite] = useState("");
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [bdSigName, setBdSigName] = useState("");
  const [bdSigRole, setBdSigRole] = useState("");
  const [bdReplyTo, setBdReplyTo] = useState("");
  const [bdThemeOverride, setBdThemeOverride] = useState<"" | "premium_dark" | "birthday_gif">("");
  const [workspaceBirthdayTheme, setWorkspaceBirthdayTheme] = useState<"premium_dark" | "birthday_gif">("premium_dark");
  const [bdSaving, setBdSaving] = useState(false);

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

  useEffect(() => {
    if (!birthdayOpen) return;
    void getAdvisorBirthdayEmailPrefs().then((p) => {
      setBdSigName(p.birthdaySignatureName ?? "");
      setBdSigRole(p.birthdaySignatureRole ?? "");
      setBdReplyTo(p.birthdayReplyToEmail ?? "");
      setBdThemeOverride(p.birthdayEmailTheme ?? "");
    });
    if (roleName === "Admin") {
      void getWorkspaceBirthdayEmailTheme().then(setWorkspaceBirthdayTheme);
    }
  }, [birthdayOpen, roleName]);

  function showSuccess(message: string) {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 2500);
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

  function openQuickActionsSheet() {
    const catalogIds = QUICK_ACTIONS_CATALOG.map((a) => a.id);
    const rawOrder = (quickActions.order?.length
      ? quickActions.order.filter((id) => catalogIds.includes(id as QuickActionId))
      : [...catalogIds]) as QuickActionId[];
    const missing = catalogIds.filter((id) => !rawOrder.includes(id));
    setQuickEditOrder([...rawOrder, ...missing]);
    setQuickEditVisible(
      catalogIds.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = quickActions.visible[id] !== false;
        return acc;
      }, {})
    );
    setQuickActionsSheetOpen(true);
  }

  async function saveQuickActionsFromSheet() {
    setQuickSaving(true);
    setError(null);
    try {
      const visiblePayload = QUICK_ACTIONS_CATALOG.reduce<Record<string, boolean>>((acc, a) => {
        acc[a.id] = quickEditVisible[a.id] !== false;
        return acc;
      }, {});
      await setQuickActionsConfig(quickEditOrder, visiblePayload);
      setQuickActions({ order: quickEditOrder, visible: visiblePayload });
      setQuickActionsSheetOpen(false);
      showSuccess("Rychlé akce byly uloženy.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rychlé akce se nepodařilo uložit.");
    } finally {
      setQuickSaving(false);
    }
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
    return <LoadingSkeleton rows={4} />;
  }

  const displayName = fullName || advisorName;
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-1 pb-6">
      {error ? <ErrorState title={error} onRetry={load} /> : null}

      {/* Success toast */}
      {success ? (
        <MobileCard className="border-emerald-200 bg-emerald-50/70 p-3 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-700">{success}</p>
        </MobileCard>
      ) : null}

      {/* Profile hero card */}
      <MobileSection>
        <MobileCard className="bg-gradient-to-br from-[color:var(--wp-surface-muted)] to-[color:var(--wp-surface-card)]">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="relative w-16 h-16 rounded-2xl bg-indigo-100 border-2 border-indigo-200 overflow-hidden flex items-center justify-center">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" fill sizes="64px" className="object-cover" />
                ) : (
                  <span className="text-xl font-black text-indigo-600">{initials}</span>
                )}
              </div>
              <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-[color:var(--wp-surface-card)] border-2 border-[color:var(--wp-surface-card-border)] rounded-full flex items-center justify-center cursor-pointer shadow-sm">
                <Camera size={13} className="text-[color:var(--wp-text-secondary)]" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onAvatarSelected(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-black text-[color:var(--wp-text)] truncate">{displayName}</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">Poradce · Advisor</p>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="mt-2 text-xs font-bold text-indigo-600 min-h-[32px] px-2.5 rounded-lg border border-indigo-200 bg-indigo-50"
              >
                Upravit profil
              </button>
            </div>
          </div>
        </MobileCard>
      </MobileSection>

      {/* Account section */}
      <SettingsSection title="Účet">
        <SettingsRow
          icon={User}
          label="Osobní údaje"
          sublabel="Jméno, telefon, IČO, nadřízený"
          onClick={() => setProfileOpen(true)}
        />
        <SettingsRow
          icon={Shield}
          label="Změna hesla"
          sublabel="Zabezpečení přihlášení"
          onClick={() => setSecurityOpen(true)}
        />
      </SettingsSection>

      {/* Notifications section */}
      <SettingsSection title="Notifikace">
        <PushNotificationsRow />
        <SettingsRow
          icon={Bell}
          label="Notifikační preference"
          sublabel="E-mail, denní souhrn, typy"
          onClick={() => setNotificationOpen(true)}
        />
      </SettingsSection>

      {/* Integrations section */}
      <SettingsSection title="Integrace">
        <SettingsRow
          icon={Calendar}
          label="Google Calendar"
          sublabel="Propojit kalendář a schůzky"
          onClick={() => void openIntegrationConnect("/api/integrations/google-calendar/connect")}
        />
        <SettingsRow
          icon={Mail}
          label="Gmail"
          sublabel="Propojit schránku pro integraci zpráv"
          onClick={() => void openIntegrationConnect("/api/integrations/gmail/connect")}
        />
        <SettingsRow
          icon={FolderOpen}
          label="Google Disk"
          sublabel="Propojení souborů a náhledy dokumentů"
          onClick={() => void openIntegrationConnect("/api/integrations/google-drive/connect")}
        />
        <SettingsRow
          icon={Smartphone}
          label="Mobilní nastavení"
          sublabel="Verze aplikace a zařízení"
          right={
            <StatusBadge tone="neutral">
              {typeof window !== "undefined" && window.navigator?.userAgent?.includes("Android") ? "Android" : "iOS"}
            </StatusBadge>
          }
        />
      </SettingsSection>

      {/* Workflow section */}
      <SettingsSection title="Workflow">
        <SettingsRow
          icon={FileText}
          label="Report branding"
          sublabel="Telefon a web v PDF reportech"
          onClick={() => setReportOpen(true)}
        />
        <SettingsRow
          icon={Cake}
          label="Narozeninové e-maily"
          sublabel="Podpis, Reply-To, šablona"
          onClick={() => setBirthdayOpen(true)}
        />
        <SettingsRow
          icon={Bell}
          label={`Quick actions (${visibleQuickActionsCount} aktivních)`}
          sublabel="Nastavit viditelné zkratky v menu + Nový"
          onClick={openQuickActionsSheet}
        />
      </SettingsSection>

      {/* Session section */}
      <SettingsSection title="Session">
        <SettingsRow
          icon={LogOut}
          label="Odhlásit se"
          sublabel="Ukončit aktuální session"
          onClick={() => setLogoutOpen(true)}
          danger
          right={null}
        />
      </SettingsSection>

      {pending && !error ? <LoadingSkeleton rows={1} /> : null}
      {!pending && !avatarUrl && !displayName ? (
        <EmptyState title="Nastavení je prázdné" />
      ) : null}

      {/* ====== BOTTOM SHEETS ====== */}

      {/* Profile edit */}
      <BottomSheet open={profileOpen} onClose={() => setProfileOpen(false)} title="Osobní údaje">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Jméno a příjmení
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
              placeholder="Jan Novák"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
                Telefon
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                placeholder="+420 …"
                type="tel"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
                IČO
              </label>
              <input
                value={ico}
                onChange={(e) => setIco(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                placeholder="12345678"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Společnost / adresa
            </label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
              placeholder="Název firmy nebo adresa"
            />
          </div>
          {supervisorOptions.length > 0 ? (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
                Nadřízený
              </label>
              <CustomDropdown
                value={supervisorUserId}
                onChange={setSupervisorUserId}
                placeholder="Bez nadřízeného"
                options={[
                  { id: "", label: "Bez nadřízeného" },
                  ...supervisorOptions.map((item) => ({
                    id: item.userId,
                    label: `${item.displayName} (${item.roleName})`,
                  })),
                ]}
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={saveProfile}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-bold"
          >
            Uložit profil
          </button>
        </div>
      </BottomSheet>

      {/* Notifications prefs */}
      <BottomSheet
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        title="Notifikační preference"
      >
        <div className="space-y-2">
          {[
            { key: "daily", label: "Denní souhrn", sub: "Každodenní přehled aktivit" },
            { key: "message", label: "Nové zprávy", sub: "Příchozí zprávy od klientů" },
            { key: "tasks", label: "Úkoly", sub: "Upomínky a termíny úkolů" },
            { key: "contracts", label: "AI smlouvy", sub: "Výsledky AI review smluv" },
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
              className="w-full min-h-[52px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-left flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-bold text-[color:var(--wp-text)]">{item.label}</p>
                <p className="text-xs text-[color:var(--wp-text-secondary)]">{item.sub}</p>
              </div>
              <div
                className={cx(
                  "w-11 h-6 rounded-full transition-colors flex items-center flex-shrink-0",
                  notificationPrefs[item.key] ? "bg-indigo-600" : "bg-[color:var(--wp-surface-card-border)]"
                )}
              >
                <div
                  className={cx(
                    "w-5 h-5 rounded-full bg-[color:var(--wp-surface-card)] shadow-sm transition-transform mx-0.5",
                    notificationPrefs[item.key] ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </div>
            </button>
          ))}
          <CreateActionButton type="button" onClick={saveNotifications} className="min-h-[48px] w-full" icon={null}>
            Uložit preference
          </CreateActionButton>
        </div>
      </BottomSheet>

      {/* Password change */}
      <BottomSheet
        open={securityOpen}
        onClose={() => setSecurityOpen(false)}
        title="Změna hesla"
      >
        <div className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Nové heslo"
          />
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Potvrzení hesla"
          />
          {password && passwordConfirm && password !== passwordConfirm ? (
            <p className="text-xs font-bold text-rose-600 flex items-center gap-1">
              <AlertCircle size={12} /> Hesla se neshodují
            </p>
          ) : null}
          <button
            type="button"
            onClick={savePassword}
            disabled={!password || password !== passwordConfirm}
            className="w-full min-h-[48px] rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50"
          >
            Uložit nové heslo
          </button>
        </div>
      </BottomSheet>

      {/* Report branding */}
      <BottomSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report branding"
      >
        <div className="space-y-3">
          <input
            value={reportPhone}
            onChange={(e) => setReportPhone(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Telefon do reportu"
            type="tel"
          />
          <input
            value={reportWebsite}
            onChange={(e) => setReportWebsite(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Web do reportu"
            type="url"
          />
          <button
            type="button"
            onClick={saveReportFields}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-bold"
          >
            Uložit report údaje
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={birthdayOpen} onClose={() => setBirthdayOpen(false)} title="Narozeninové e-maily">
        <div className="space-y-3">
          {roleName === "Admin" ? (
            <>
              <p className="text-xs font-bold text-[color:var(--wp-text-tertiary)] uppercase tracking-wider">Workspace výchozí</p>
              <select
                value={workspaceBirthdayTheme}
                onChange={(e) => setWorkspaceBirthdayTheme(e.target.value as "premium_dark" | "birthday_gif")}
                className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
              >
                <option value="premium_dark">Premium (tmavá hlavička)</option>
                <option value="birthday_gif">S GIF (fallback premium)</option>
              </select>
            </>
          ) : null}
          <p className="text-xs font-bold text-[color:var(--wp-text-tertiary)] uppercase tracking-wider">Váš podpis</p>
          <input
            value={bdSigName}
            onChange={(e) => setBdSigName(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Jméno v podpisu"
          />
          <input
            value={bdSigRole}
            onChange={(e) => setBdSigRole(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Role"
          />
          <input
            type="email"
            value={bdReplyTo}
            onChange={(e) => setBdReplyTo(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            placeholder="Reply-To (volitelné)"
          />
          <select
            value={bdThemeOverride}
            onChange={(e) => setBdThemeOverride(e.target.value as "" | "premium_dark" | "birthday_gif")}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
          >
            <option value="">Téma: podle workspace</option>
            <option value="premium_dark">Premium</option>
            <option value="birthday_gif">S GIF</option>
          </select>
          <button
            type="button"
            disabled={bdSaving}
            onClick={async () => {
              setBdSaving(true);
              setError(null);
              try {
                if (roleName === "Admin") {
                  const wr = await setWorkspaceBirthdayEmailTheme(workspaceBirthdayTheme);
                  if (!wr.ok) {
                    setError(wr.message);
                    setBdSaving(false);
                    return;
                  }
                }
                await updateAdvisorBirthdayEmailPrefs({
                  birthdaySignatureName: bdSigName.trim() || null,
                  birthdaySignatureRole: bdSigRole.trim() || null,
                  birthdayReplyToEmail: bdReplyTo.trim() || null,
                  birthdayEmailTheme: bdThemeOverride || null,
                });
                setBirthdayOpen(false);
                showSuccess("Narozeninové nastavení uloženo.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Uložení se nezdařilo.");
              } finally {
                setBdSaving(false);
              }
            }}
            className="w-full min-h-[48px] rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-50"
          >
            {bdSaving ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </BottomSheet>

      {/* Quick actions (+ Nový menu) */}
      <BottomSheet
        open={quickActionsSheetOpen}
        onClose={() => setQuickActionsSheetOpen(false)}
        title="Rychlé akce (+ Nový)"
        reserveMobileBottomNav
      >
        <p className="text-xs text-[color:var(--wp-text-secondary)] mb-3 leading-relaxed">
          Zaškrtněte viditelné položky v menu „+ Nový“. Šipkami změníte pořadí.
        </p>
        <div className="space-y-2 max-h-[min(52vh,420px)] overflow-y-auto overscroll-y-contain pr-1 -mr-1">
          {quickEditOrder.map((id, index) => {
            const item = QUICK_ACTIONS_CATALOG.find((a) => a.id === id);
            if (!item) return null;
            const visible = quickEditVisible[id] !== false;
            return (
              <div
                key={id}
                className={cx(
                  "flex items-stretch gap-2 rounded-xl border px-2 py-2",
                  visible
                    ? "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]"
                    : "border-[color:var(--wp-surface-card-border)]/40 opacity-70"
                )}
              >
                <div className="flex flex-col justify-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (index <= 0) return;
                      const n = [...quickEditOrder];
                      [n[index - 1], n[index]] = [n[index], n[index - 1]];
                      setQuickEditOrder(n);
                    }}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)] disabled:opacity-30"
                    aria-label="Posunout nahoru"
                  >
                    <ChevronUp size={18} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (index >= quickEditOrder.length - 1) return;
                      const n = [...quickEditOrder];
                      [n[index], n[index + 1]] = [n[index + 1], n[index]];
                      setQuickEditOrder(n);
                    }}
                    disabled={index === quickEditOrder.length - 1}
                    className="p-1.5 rounded-lg text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)] disabled:opacity-30"
                    aria-label="Posunout dolů"
                  >
                    <ChevronDown size={18} strokeWidth={2.5} />
                  </button>
                </div>
                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() =>
                      setQuickEditVisible((p) => ({ ...p, [id]: p[id] === false }))
                    }
                    className="h-5 w-5 rounded border border-[color:var(--wp-surface-card-border)] shrink-0 accent-indigo-600"
                  />
                  <span
                    className={cx(
                      "text-sm font-bold truncate",
                      visible ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-secondary)] line-through"
                    )}
                  >
                    {item.label}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
        <CreateActionButton
          type="button"
          onClick={() => void saveQuickActionsFromSheet()}
          disabled={quickSaving}
          className="min-h-[48px] w-full mt-4"
          icon={null}
        >
          {quickSaving ? "Ukládám…" : "Uložit"}
        </CreateActionButton>
      </BottomSheet>

      {/* Logout confirmation */}
      <BottomSheet
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Odhlásit se"
      >
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Opravdu se chcete odhlásit z aplikace Aidvisora?</p>
          <button
            type="button"
            disabled={logoutSigningOut}
            onClick={() => {
              setLogoutSigningOut(true);
              void signOutAndRedirectClient(router).finally(() => setLogoutSigningOut(false));
            }}
            className="w-full min-h-[48px] rounded-xl bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <LogOut size={16} /> {logoutSigningOut ? "Odhlašuji…" : "Odhlásit se"}
          </button>
          <button
            type="button"
            onClick={() => setLogoutOpen(false)}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)]"
          >
            Zrušit
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
